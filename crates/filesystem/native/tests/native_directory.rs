use std::{fs, io};

use binary_inspection::input::ByteSource;
use filesystem_data::DirectoryEntryKind;
use filesystem_native::{NativeDirectory, NativeFileSource};

fn id(directory: &NativeDirectory, name: &str) -> u32 {
    directory
        .entries()
        .iter()
        .find(|entry| entry.name == name)
        .unwrap()
        .id
}

#[test]
fn lists_only_immediate_children_and_opens_original_bytes() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("sample"), b"original bytes").unwrap();
    fs::create_dir(root.path().join("nested")).unwrap();
    fs::write(root.path().join("nested/hidden"), b"hidden").unwrap();
    let directory = NativeDirectory::open(root.path()).unwrap();
    assert_eq!(directory.entries().len(), 2);
    assert_eq!(
        directory.entries()[id(&directory, "nested") as usize].kind,
        DirectoryEntryKind::Directory
    );
    assert!(directory.open_file(id(&directory, "nested")).is_err());
    for entry_id in [u32::MAX, id(&directory, "sample")] {
        assert_eq!(
            directory.open_directory(entry_id).unwrap_err().kind(),
            io::ErrorKind::InvalidInput
        );
    }
    let mut source =
        NativeFileSource::new(directory.open_file(id(&directory, "sample")).unwrap()).unwrap();
    let mut bytes = [0; 14];
    assert_eq!(source.read_at(0, &mut bytes).unwrap(), 14);
    assert_eq!(&bytes, b"original bytes");
    assert_eq!(
        directory.open_file(u32::MAX).unwrap_err().kind(),
        io::ErrorKind::InvalidInput
    );
}

#[cfg(unix)]
#[test]
fn symlinks_and_nonregular_entries_observed_before_open_are_rejected() {
    use std::os::unix::{fs::symlink, net::UnixListener};
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::NamedTempFile::new().unwrap();
    fs::write(outside.path(), b"outside").unwrap();
    fs::write(root.path().join("sample"), b"inside").unwrap();
    symlink(outside.path(), root.path().join("escape")).unwrap();
    let _socket = UnixListener::bind(root.path().join("socket")).unwrap();
    let directory = NativeDirectory::open(root.path()).unwrap();
    assert_eq!(
        directory.entries()[id(&directory, "escape") as usize].kind,
        DirectoryEntryKind::Symlink
    );
    assert_eq!(
        directory.entries()[id(&directory, "socket") as usize].kind,
        DirectoryEntryKind::Other
    );
    assert!(directory.open_file(id(&directory, "escape")).is_err());
    assert!(directory.open_file(id(&directory, "socket")).is_err());
    fs::remove_file(root.path().join("sample")).unwrap();
    symlink(outside.path(), root.path().join("sample")).unwrap();
    assert!(directory.open_file(id(&directory, "sample")).is_err());
}

#[cfg(unix)]
#[test]
fn child_directory_opens_reject_captured_and_replacement_symlinks() {
    use std::os::unix::fs::symlink;
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let child = root.path().join("child");
    let link = root.path().join("link");
    fs::create_dir(&child).unwrap();
    symlink(outside.path(), &link).unwrap();
    let directory = NativeDirectory::open(root.path()).unwrap();
    let child_id = id(&directory, "child");
    let link_id = id(&directory, "link");
    assert_eq!(
        directory.open_directory(link_id).unwrap_err().kind(),
        io::ErrorKind::InvalidInput
    );
    fs::remove_file(&link).unwrap();
    fs::create_dir(&link).unwrap();
    assert_eq!(
        directory.open_directory(link_id).unwrap_err().kind(),
        io::ErrorKind::InvalidInput
    );
    fs::remove_dir(&child).unwrap();
    symlink(outside.path(), &child).unwrap();
    assert_eq!(
        directory.open_directory(child_id).unwrap_err().kind(),
        io::ErrorKind::InvalidInput
    );
}

#[cfg(target_os = "linux")]
#[test]
fn lossy_display_names_do_not_change_the_native_open_name() {
    use std::{ffi::OsString, os::unix::ffi::OsStringExt};
    let root = tempfile::tempdir().unwrap();
    for (name, bytes) in [
        (b"bad-\xff".to_vec(), b"first"),
        (b"bad-\xfe".to_vec(), b"other"),
    ] {
        fs::write(root.path().join(OsString::from_vec(name)), bytes).unwrap();
    }
    let directory = NativeDirectory::open(root.path()).unwrap();
    assert_eq!(directory.entries()[0].name, directory.entries()[1].name);
    let mut contents = Vec::new();
    for entry in directory.entries() {
        let mut source = NativeFileSource::new(directory.open_file(entry.id).unwrap()).unwrap();
        let mut bytes = [0; 5];
        source.read_at(0, &mut bytes).unwrap();
        contents.push(bytes);
    }
    contents.sort();
    assert_eq!(contents, [*b"first", *b"other"]);
}

#[test]
fn aggregate_display_name_limit_fails_the_whole_listing() {
    let root = tempfile::tempdir().unwrap();
    for index in 0..300 {
        fs::write(
            root.path().join(format!("{index:03}{}", "a".repeat(237))),
            b"",
        )
        .unwrap();
    }
    assert_eq!(
        NativeDirectory::open(root.path()).unwrap_err().kind(),
        io::ErrorKind::InvalidData
    );
}
