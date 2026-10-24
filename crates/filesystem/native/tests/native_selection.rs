use std::{fs, io};

use binary_inspection::input::ByteSource;
use filesystem_native::{MAX_DIRECTORY_ENTRIES, NativeSelection};

fn id(selection: &NativeSelection, name: &str) -> u32 {
    selection
        .entries()
        .iter()
        .find(|entry| entry.name == name)
        .unwrap()
        .id
}

#[test]
fn acquisition_failure_preserves_the_file_directory_names_and_listing() {
    let root = tempfile::tempdir().unwrap();
    let nested = root.path().join("nested");
    fs::create_dir(&nested).unwrap();
    fs::write(root.path().join("sample"), b"original").unwrap();
    let mut selection = NativeSelection::default();
    selection.select_directory(root.path()).unwrap();
    let nested_id = id(&selection, "nested");
    let file_id = id(&selection, "sample");
    selection.open_file(file_id).unwrap();
    let original_listing = selection.entries().to_vec();
    let original_name = selection.directory_name().unwrap().to_owned();

    fs::remove_file(root.path().join("sample")).unwrap();
    assert_eq!(
        selection.open_file(file_id).unwrap_err().kind(),
        io::ErrorKind::NotFound
    );
    assert!(selection.select_file(root.path().join("missing")).is_err());
    for index in 0..=MAX_DIRECTORY_ENTRIES {
        fs::write(nested.join(format!("file-{index}")), b"").unwrap();
    }
    assert_eq!(
        selection.open_directory(nested_id).unwrap_err().kind(),
        io::ErrorKind::InvalidData
    );
    assert!(selection.select_directory(&nested).is_err());
    assert_eq!(selection.entries(), original_listing);
    assert_eq!(selection.directory_name(), Some(original_name.as_str()));
    assert_eq!(selection.file_name(), Some("sample"));
    let mut bytes = [0; 8];
    selection
        .file_mut()
        .unwrap()
        .read_at(0, &mut bytes)
        .unwrap();
    assert_eq!(&bytes, b"original");

    fs::remove_file(nested.join("file-0")).unwrap();
    selection.open_directory(nested_id).unwrap();
    assert_eq!(selection.directory_name(), Some("nested"));
    assert_eq!(selection.entries().len(), MAX_DIRECTORY_ENTRIES);
    assert!(selection.file().is_none());
    assert!(selection.file_name().is_none());
    selection.select_file(nested.join("file-1")).unwrap();
    assert_eq!(selection.file_name(), Some("file-1"));
    assert!(selection.directory_name().is_none());
    assert!(selection.entries().is_empty());
}
