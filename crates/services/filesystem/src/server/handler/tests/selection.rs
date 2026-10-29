use std::path::Path;

use anyhow::Context;
use filesystem_native::NativeSelection;
use filesystem_protocol::{FileError, Request, Response};

use crate::{picker::PickMode, server::handler::Handler};

use super::{directory_with_entries, selection_with_file};

/// Create a handler with the fixture's root directory and level-1-file selected.
///
/// The caller keeps the temporary directory alive while using the handler.
fn handler_with_directory_and_file(root_path: &Path) -> anyhow::Result<Handler> {
    let mut native_selection = NativeSelection::default();
    native_selection.select_directory(root_path)?;

    let level_1_file_entry_id = native_selection
        .entries()
        .iter()
        .find(|entry| entry.name == "level-1-file")
        .context("expected level-1-file in the root directory")?
        .id;

    // Opening a listed file retains its directory context.
    native_selection.open_file(level_1_file_entry_id)?;

    // These navigation tests do not request native dialogs.
    let (picker, _) = crate::picker::channel();

    Ok(Handler::new(picker, native_selection))
}

#[tokio::test]
async fn dismissed_pickers_preserve_selection() -> anyhow::Result<()> {
    for (mode, request, dismissed) in [
        (
            PickMode::File,
            Request::ChooseFile,
            Response::SelectedFile(None),
        ),
        (
            PickMode::Folder,
            Request::ChooseFolder,
            Response::SelectedDirectory(None),
        ),
        (
            PickMode::Application,
            Request::ChooseApplication,
            Response::SelectedApplication(None),
        ),
        (
            PickMode::Binary,
            Request::ChooseBinary,
            Response::SelectedBinary(None),
        ),
    ] {
        // 1. Create a real temporary file and retain it as the initial selection.
        let (picker, dispatcher) = crate::picker::channel();
        let native_selection = selection_with_file()?;
        let handler = Handler::new(picker, native_selection);
        let before = handler.dispatch(Request::CurrentSelection).await?;
        assert!(matches!(&before, Response::Selection(state) if state.file.is_some()));

        // 2. Simulate dismissing the picker without choosing a file or folder.
        // None means no new item was chosen; the initial file is already selected.
        let dispatcher_task = tokio::spawn(dispatcher.run_with(move |requested_mode| {
            assert_eq!(requested_mode, mode);
            None
        }));
        assert_eq!(handler.dispatch(request).await?, dismissed);

        // 3. Verify that dismissal preserved the selection established during setup.
        assert_eq!(handler.dispatch(Request::CurrentSelection).await?, before);

        // 4. Close the picker request channel so its dispatcher can finish.
        drop(handler);
        dispatcher_task.await?;
    }
    Ok(())
}

/// Verify that failed directory navigation preserves the existing selection.
///
/// ```text
/// Select the fixture's root directory (level 0)
///   directory = root, file = none
///       │
///       ├─ Open "level-1-file" as a file → succeeds
///       │    directory = root, file = level-1-file
///       │
///       ├─ Open "level-1-file" as a directory → fails
///       │
///       └─ Verify preservation
///            The directory and file selection are unchanged.
///            The existing file identifier still permits querying its length.
/// ```
#[tokio::test]
async fn failed_directory_navigation_preserves_selection() -> anyhow::Result<()> {
    // 1. Establish the initial file and directory selection.
    let root_directory = directory_with_entries()?;
    let handler = handler_with_directory_and_file(root_directory.path())?;

    let response = handler.dispatch(Request::CurrentSelection).await?;
    let Response::Selection(initial_selection) = response else {
        panic!("expected the initial selection, got {response:?}");
    };
    let selected_root_directory = initial_selection
        .directory
        .as_ref()
        .context("expected the root directory")?;
    let level_1_file_entry_id = initial_selection
        .entries
        .iter()
        .find(|entry| entry.name == "level-1-file")
        .context("expected level-1-file in the root directory")?
        .id;

    // 2. Request directory navigation to a regular file; the request must fail.
    let response = handler
        .dispatch(Request::OpenDirectory {
            resource: selected_root_directory.resource.clone(),
            entry_id: level_1_file_entry_id,
        })
        .await?;
    assert!(
        matches!(&response, Response::Failed(FileError::Io { .. })),
        "{response:?}"
    );

    // 3. Verify that both selections are unchanged and the original file
    // identifier remains usable.
    let response = handler.dispatch(Request::CurrentSelection).await?;
    let Response::Selection(selection_after_failure) = response else {
        panic!("expected selection after failed navigation, got {response:?}");
    };
    assert_eq!(selection_after_failure, initial_selection);

    let selected_file = initial_selection
        .file
        .context("expected the initially selected file")?;
    assert_eq!(
        handler
            .dispatch(Request::ByteLength {
                resource: selected_file.resource,
            })
            .await?,
        Response::ByteLength(16)
    );
    Ok(())
}

/// Successful cursor navigation clears the selected file while retaining the root.
#[tokio::test]
async fn successful_directory_navigation_keeps_root_resources() -> anyhow::Result<()> {
    // 1. Establish the initial file and directory selection.
    let root_directory = directory_with_entries()?;
    let handler = handler_with_directory_and_file(root_directory.path())?;

    let response = handler.dispatch(Request::CurrentSelection).await?;
    let Response::Selection(initial_selection) = response else {
        panic!("expected the initial selection, got {response:?}");
    };
    let root_directory_id = initial_selection
        .directory
        .context("expected the root directory")?
        .resource;
    let initial_file_id = initial_selection
        .file
        .context("expected the initially selected file")?
        .resource;
    let level_1_directory_entry_id = initial_selection
        .entries
        .iter()
        .find(|entry| entry.name == "level-1-directory")
        .context("expected level-1-directory in the root directory")?
        .id;

    // 2. Enter the child directory and require a replacement directory identifier.
    let response = handler
        .dispatch(Request::OpenDirectory {
            resource: root_directory_id.clone(),
            entry_id: level_1_directory_entry_id,
        })
        .await?;
    let Response::OpenedDirectory(child_directory_id) = response else {
        panic!("expected the child directory to open, got {response:?}");
    };
    assert_ne!(child_directory_id, root_directory_id);

    // 3. Verify the child listing and that the initial file is no longer selected.
    let response = handler.dispatch(Request::CurrentSelection).await?;
    let Response::Selection(child_selection) = response else {
        panic!("expected the child directory selection, got {response:?}");
    };
    assert!(child_selection.file.is_none());
    let selected_child_directory = child_selection
        .directory
        .as_ref()
        .context("expected the child directory")?;
    assert_eq!(selected_child_directory.resource, child_directory_id);
    assert_eq!(selected_child_directory.name, "level-1-directory");
    let [level_2_file_entry] = child_selection.entries.as_slice() else {
        panic!(
            "expected exactly one child-directory entry, got {:?}",
            child_selection.entries
        );
    };
    assert_eq!(level_2_file_entry.name, "level-2-file");

    // 4. The old file was replaced, but its root directory remains addressable.
    let response = handler
        .dispatch(Request::ByteLength {
            resource: initial_file_id,
        })
        .await?;
    assert!(
        matches!(&response, Response::Failed(FileError::Io { .. })),
        "{response:?}"
    );

    assert_eq!(
        child_selection.root.as_ref().unwrap().resource,
        root_directory_id
    );
    let response = handler
        .dispatch(Request::ListDirectory {
            resource: root_directory_id,
        })
        .await?;
    let Response::Directory(root_listing) = response else {
        panic!("expected retained root listing, got {response:?}");
    };
    assert_eq!(root_listing.entries, initial_selection.entries);
    assert_eq!(root_listing.parent, None);
    assert_eq!(
        handler.dispatch(Request::CurrentSelection).await?,
        Response::Selection(child_selection)
    );
    Ok(())
}

#[tokio::test]
async fn lazy_expansion_keeps_selection_and_addresses_files_in_loaded_siblings()
-> anyhow::Result<()> {
    // 1. Select a root/file and add another sibling directory before capture.
    let root = directory_with_entries()?;
    std::fs::create_dir(root.path().join("sibling"))?;
    std::fs::write(root.path().join("sibling/file"), b"sibling bytes")?;
    let handler = handler_with_directory_and_file(root.path())?;
    let Response::Selection(before) = handler.dispatch(Request::CurrentSelection).await? else {
        panic!("expected selection");
    };
    let root_resource = before.root.as_ref().unwrap().resource.clone();
    let child_entry = before
        .entries
        .iter()
        .find(|entry| entry.name == "level-1-directory")
        .unwrap()
        .id;
    let sibling_entry = before
        .entries
        .iter()
        .find(|entry| entry.name == "sibling")
        .unwrap()
        .id;

    // 2. Lazy acquisition returns stable child capabilities without changing selection.
    let child_request = Request::ExpandDirectory {
        resource: root_resource.clone(),
        entry_id: child_entry,
    };
    let child_response = handler.dispatch(child_request.clone()).await?;
    assert_eq!(handler.dispatch(child_request).await?, child_response);
    let Response::Directory(child) = child_response else {
        panic!("expected child listing");
    };
    let Response::Directory(sibling) = handler
        .dispatch(Request::ExpandDirectory {
            resource: root_resource.clone(),
            entry_id: sibling_entry,
        })
        .await?
    else {
        panic!("expected sibling listing");
    };
    assert_ne!(child.directory.resource, sibling.directory.resource);
    assert_eq!(child.parent.as_ref().unwrap().directory, root_resource);
    assert_eq!(
        handler.dispatch(Request::CurrentSelection).await?,
        Response::Selection(before)
    );

    // 3. Select a file from each retained sibling, preserving the same root identity.
    for listing in [child, sibling] {
        let entry_id = listing.entries[0].id;
        let response = handler
            .dispatch(Request::OpenFile {
                resource: listing.directory.resource.clone(),
                entry_id,
            })
            .await?;
        assert!(matches!(response, Response::OpenedFile(_)));
        let Response::Selection(selected) = handler.dispatch(Request::CurrentSelection).await?
        else {
            panic!("expected file selection");
        };
        assert_eq!(selected.root.as_ref().unwrap().resource, root_resource);
        let origin = selected.file_entry.unwrap();
        assert_eq!(origin.directory, listing.directory.resource);
        assert_eq!(origin.entry_id, entry_id);
    }
    Ok(())
}

#[tokio::test]
async fn application_picker_installs_only_validated_application_scope() -> anyhow::Result<()> {
    // 1. Retain an existing file and prepare a generic folder plus one app candidate.
    let fixture = tempfile::tempdir()?;
    let app = fixture.path().join("Chosen.app");
    std::fs::create_dir_all(app.join("Contents"))?;
    std::fs::write(app.join("Contents/Info.plist"), b"unparsed metadata")?;
    let (picker, dispatcher) = crate::picker::channel();
    let handler = Handler::new(picker, selection_with_file()?);
    let before = handler.dispatch(Request::CurrentSelection).await?;
    let mut choices = std::collections::VecDeque::from([fixture.path().to_path_buf(), app]);
    let task = tokio::spawn(dispatcher.run_with(move |mode| {
        assert_eq!(mode, PickMode::Application);
        choices.pop_front()
    }));

    // 2. The picker cannot bypass native/core policy with an arbitrary directory.
    assert!(matches!(
        handler.dispatch(Request::ChooseApplication).await?,
        Response::Failed(_)
    ));
    assert_eq!(handler.dispatch(Request::CurrentSelection).await?, before);

    // 3. A valid root commits typed application scope with a fresh root capability.
    let Response::SelectedApplication(Some(selected)) =
        handler.dispatch(Request::ChooseApplication).await?
    else {
        panic!("expected application acquisition");
    };
    let Response::Selection(state) = handler.dispatch(Request::CurrentSelection).await? else {
        panic!("expected application state");
    };
    assert_eq!(state.root.unwrap(), selected);
    assert_eq!(
        state.scope,
        Some(filesystem_protocol::SelectionScope::Application)
    );
    assert!(state.file.is_none());
    assert_eq!(state.entries[0].name, "Contents");

    // 4. Release the request channel so the fake dialog dispatcher can finish.
    drop(handler);
    task.await?;
    Ok(())
}
