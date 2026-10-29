//! Native ownership rules, exercised directly without a service or host runtime.

use std::{fs, io};

use binary_inspection::input::ByteSource;
use filesystem_native::{DirectoryId, MAX_RETAINED_DIRECTORIES, NativeSelection};

fn entry(selection: &NativeSelection, directory: DirectoryId, name: &str) -> u32 {
    selection
        .directory(directory)
        .unwrap()
        .entries
        .iter()
        .find(|entry| entry.name == name)
        .unwrap()
        .id
}

#[test]
fn lazy_siblings_keep_the_root_and_selected_file_addressable()
-> Result<(), Box<dyn std::error::Error>> {
    // 1. Capture a root with two independent child listings.
    let root = tempfile::tempdir()?;
    for name in ["left", "right"] {
        fs::create_dir(root.path().join(name))?;
        fs::write(root.path().join(name).join("file"), name)?;
    }
    let mut selection = NativeSelection::default();
    selection.select_directory(root.path())?;
    let root_id = selection.root_directory().unwrap();
    let left_entry = entry(&selection, root_id, "left");
    let right_entry = entry(&selection, root_id, "right");
    let left = selection.load_child(root_id, left_entry)?;
    let right = selection.load_child(root_id, right_entry)?;
    assert_ne!(left, right);
    assert_eq!(selection.root_directory(), Some(root_id));
    assert_eq!(selection.current_directory(), Some(root_id));

    // 2. Select from one child and reload the sibling without replacing the file.
    let left_file = entry(&selection, left, "file");
    selection.open_file_from(left, left_file)?;
    assert_eq!(selection.file_entry().unwrap().directory, left);
    assert_eq!(selection.load_child(root_id, right_entry)?, right);
    assert_eq!(selection.current_directory(), Some(left));
    let mut bytes = [0; 4];
    assert_eq!(selection.file_mut().unwrap().read_at(0, &mut bytes)?, 4);
    assert_eq!(&bytes, b"left");

    // 3. The other sibling remains independently addressable for file selection.
    selection.open_file_from(right, entry(&selection, right, "file"))?;
    assert_eq!(selection.file_entry().unwrap().directory, right);
    assert_eq!(selection.root_directory(), Some(root_id));
    assert_eq!(
        selection.directory(left).unwrap().parent.unwrap().directory,
        root_id
    );
    assert_eq!(selection.directories().count(), 3);
    Ok(())
}

#[test]
fn acquisition_failure_preserves_the_tree_and_external_replacement_invalidates_it()
-> Result<(), Box<dyn std::error::Error>> {
    // 1. Keep a captured child and selected file beneath the root.
    let root = tempfile::tempdir()?;
    fs::create_dir(root.path().join("child"))?;
    fs::write(root.path().join("file"), b"retained")?;
    let mut selection = NativeSelection::default();
    selection.select_directory(root.path())?;
    let root_id = selection.root_directory().unwrap();
    let child_entry = entry(&selection, root_id, "child");
    let child = selection.load_child(root_id, child_entry)?;
    let file_entry = entry(&selection, root_id, "file");
    selection.open_file_from(root_id, file_entry)?;

    // 2. Failed opens preserve the root, origin and already acquired source.
    assert!(selection.load_child(root_id, file_entry).is_err());
    assert!(selection.open_file_from(child, u32::MAX).is_err());
    assert!(
        selection
            .select_directory(root.path().join("absent"))
            .is_err()
    );
    assert_eq!(selection.root_directory(), Some(root_id));
    assert_eq!(selection.file_entry().unwrap().entry_id, file_entry);
    assert_eq!(selection.file().unwrap().byte_length(), 8);

    // 3. Repeated expansion uses its captured listing even after native removal.
    fs::remove_dir(root.path().join("child"))?;
    assert_eq!(selection.load_child(root_id, child_entry)?, child);

    // 4. External replacement invalidates old IDs and never reuses them.
    selection.select_file(root.path().join("file"))?;
    assert_eq!(selection.root_directory(), None);
    assert_eq!(selection.file_entry(), None);
    assert!(selection.directory(root_id).is_none());
    assert!(selection.open_file_from(root_id, file_entry).is_err());
    selection.select_directory(root.path())?;
    assert_ne!(selection.root_directory(), Some(root_id));
    assert!(selection.directory(child).is_none());
    Ok(())
}

#[test]
fn retained_directory_limit_rejects_new_expansion_without_evicting_loaded_children()
-> io::Result<()> {
    // 1. Fill the bounded arena, counting the root as one retained directory.
    let root = tempfile::tempdir()?;
    for index in 0..MAX_RETAINED_DIRECTORIES {
        fs::create_dir(root.path().join(index.to_string()))?;
    }
    let mut selection = NativeSelection::default();
    selection.select_directory(root.path())?;
    let root_id = selection.root_directory().unwrap();
    let entries: Vec<_> = selection.entries().iter().map(|entry| entry.id).collect();
    let mut loaded = Vec::new();
    for entry in &entries[..MAX_RETAINED_DIRECTORIES - 1] {
        loaded.push(selection.load_child(root_id, *entry)?);
    }

    // 2. Reject the next acquisition while keeping every existing identity usable.
    assert!(
        selection
            .load_child(root_id, entries[MAX_RETAINED_DIRECTORIES - 1])
            .is_err()
    );
    assert_eq!(selection.directories().count(), MAX_RETAINED_DIRECTORIES);
    assert_eq!(selection.root_directory(), Some(root_id));
    assert_eq!(selection.current_directory(), Some(root_id));
    for (entry, id) in entries.iter().zip(loaded) {
        assert_eq!(selection.load_child(root_id, *entry)?, id);
        assert!(selection.directory(id).is_some());
    }
    Ok(())
}

#[test]
fn application_scope_includes_resources_and_survives_file_and_cursor_changes() -> io::Result<()> {
    use filesystem_data::SelectionScope;

    // 1. Acquire one modern app root, including non-code resource contents.
    let fixture = tempfile::tempdir()?;
    let application = fixture.path().join("Chosen.app");
    fs::create_dir_all(application.join("Contents/Resources"))?;
    fs::create_dir(application.join("Contents/MacOS"))?;
    // Only the file/layout is validated; plist parsing is deliberately out of scope.
    fs::write(
        application.join("Contents/Info.plist"),
        b"unparsed metadata",
    )?;
    fs::write(application.join("Contents/Resources/image"), b"resource")?;
    let mut selection = NativeSelection::default();
    assert_eq!(selection.scope(), SelectionScope::Empty);
    selection.select_application(&application)?;
    let root = selection.root_directory().unwrap();
    assert_eq!(selection.scope(), SelectionScope::Application);
    let contents = selection.load_child(root, entry(&selection, root, "Contents"))?;
    let resources_entry = entry(&selection, contents, "Resources");
    let resources = selection.load_child(contents, resources_entry)?;
    selection.open_file_from(resources, entry(&selection, resources, "image"))?;
    assert_eq!(selection.scope(), SelectionScope::Application);
    assert_eq!(selection.root_directory(), Some(root));

    // 2. Cursor navigation retains application identity and loaded resource siblings.
    selection.open_directory_from(contents, entry(&selection, contents, "MacOS"))?;
    assert_eq!(selection.scope(), SelectionScope::Application);
    assert!(selection.file().is_none());
    assert!(selection.directory(resources).is_some());
    assert_eq!(selection.root_directory(), Some(root));

    // 3. Generic folder acquisition is never promoted merely by its .app name.
    selection.select_directory(&application)?;
    assert_eq!(selection.scope(), SelectionScope::Directory);
    Ok(())
}

#[test]
fn invalid_subjects_preserve_application_and_valid_binary_replaces_it()
-> Result<(), Box<dyn std::error::Error>> {
    use filesystem_data::SelectionScope;

    // 1. Keep a selected resource under an accepted app root.
    let fixture = tempfile::tempdir()?;
    let application = fixture.path().join("Chosen.app");
    fs::create_dir_all(application.join("Contents"))?;
    fs::write(application.join("Contents/Info.plist"), b"metadata")?;
    let mut selection = NativeSelection::default();
    selection.select_application(&application)?;
    let root = selection.root_directory().unwrap();
    let contents = selection.load_child(root, entry(&selection, root, "Contents"))?;
    selection.open_file_from(contents, entry(&selection, contents, "Info.plist"))?;
    let origin = selection.file_entry();

    // 2. Neither an arbitrary folder, invalid .app nor nonbinary file can replace it.
    let invalid_app = fixture.path().join("Invalid.app");
    fs::create_dir(&invalid_app)?;
    let invalid_file = fixture.path().join("not-a-binary");
    fs::write(&invalid_file, b"text")?;
    for result in [
        selection.select_application(fixture.path()),
        selection.select_application(&invalid_app),
        selection.select_binary(&invalid_file),
    ] {
        assert!(result.is_err());
        assert_eq!(selection.scope(), SelectionScope::Application);
        assert_eq!(selection.root_directory(), Some(root));
        assert_eq!(selection.file_entry(), origin);
    }

    // 3. An extensionless Mach-O header is eligible without dependency inspection.
    let binary = fixture.path().join("standalone");
    let header: Vec<u8> = [0xfeed_facf_u32, 0x0100_000c, 0, 2, 0, 0, 0, 0]
        .into_iter()
        .flat_map(u32::to_le_bytes)
        .collect();
    fs::write(&binary, header)?;
    selection.select_binary(&binary)?;
    assert_eq!(selection.scope(), SelectionScope::Binary);
    assert_eq!(selection.root_directory(), None);
    assert_eq!(selection.file_entry(), None);
    assert!(selection.directory(root).is_none());
    assert_eq!(selection.file().unwrap().byte_length(), 32);
    selection.select_file(&binary)?;
    assert_eq!(selection.scope(), SelectionScope::File);
    Ok(())
}
