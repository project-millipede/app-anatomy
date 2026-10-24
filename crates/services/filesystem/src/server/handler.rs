//! Filesystem request dispatch, native acquisition and retained-owner cleanup.

use std::{fs::File, path::Path, sync::Arc};

use binary_inspection::input::{ByteSource, SourceError};
use filesystem_native::{NativeDirectory, NativeFileSource, NativeSelection};
use filesystem_protocol::{FileError, Request, Response, SelectedResource};
use tokio::sync::{Mutex, OwnedMutexGuard};

use crate::{
    picker::{PickMode, Picker},
    read::read_at,
    selection::Selection,
};

#[derive(Clone)]
pub(super) struct Handler {
    selection: Arc<Mutex<Selection>>,
    picker: Picker,
}

/// An opened native resource that has not replaced the retained selection.
enum AcquiredResource {
    File {
        name: String,
        source: NativeFileSource,
    },
    Directory {
        name: String,
        directory: NativeDirectory,
    },
}

/// Return the acquisition result with the native access lock still held.
struct Acquisition {
    // Fields drop in declaration order. Clean up an unused resource before
    // releasing the lock, so shutdown waits for that cleanup too.
    resource: Result<AcquiredResource, SourceError>,
    selection: OwnedMutexGuard<Selection>,
}

impl Handler {
    pub(super) fn new(picker: Picker, native: NativeSelection) -> Self {
        Self {
            selection: Arc::new(Mutex::new(Selection::new(native))),
            picker,
        }
    }

    pub(super) async fn dispatch(&self, request: Request) -> anyhow::Result<Response> {
        let result = match request {
            Request::ChooseFile => self.choose(PickMode::File).await?,
            Request::ChooseFolder => self.choose(PickMode::Folder).await?,
            request => {
                // Await the mutex before submitting blocking work: waiting requests
                // must not occupy blocking workers. Dropping this future while waiting
                // submits no job; after submission, the job owns the guard until done.
                let mut selection_guard = Arc::clone(&self.selection).lock_owned().await;
                tokio::task::spawn_blocking(move || operate(&mut selection_guard, request)).await?
            }
        };
        result.map_or_else(failure, Ok)
    }

    /// Release the owner after the server has stopped its connection tasks.
    pub(super) async fn shutdown(&self) -> anyhow::Result<()> {
        let selection = Arc::clone(&self.selection);
        tokio::task::spawn_blocking(move || selection.blocking_lock().shutdown()).await?;
        Ok(())
    }

    async fn choose(&self, mode: PickMode) -> anyhow::Result<Result<Response, SourceError>> {
        // 1. Check owner availability before opening a native dialog.
        if let Err(error) = self.selection.lock().await.ensure_available() {
            return Ok(Err(error));
        }

        // 2. Await the dialog without holding the native access lock.
        // Cancel leaves the retained selection unchanged.
        let path = match self.picker.choose(mode).await {
            Ok(Some(path)) => path,
            Ok(None) => return Ok(Ok(selected(mode, None))),
            Err(error) => return Ok(Err(error)),
        };

        // 3. Await native access before submitting blocking work, then recheck
        // availability: shutdown may have invalidated the dialog's result.
        // Abandoning this wait submits no job and opens no resource.
        let selection = Arc::clone(&self.selection).lock_owned().await;
        if let Err(error) = selection.ensure_available() {
            return Ok(Err(error));
        }

        // 4. Open the resource on a blocking worker without replacing the owner.
        // Holding the lock through acquisition lets shutdown wait for native
        // access; the previous selection remains installed until step 5.
        let mut acquisition = tokio::task::spawn_blocking(move || Acquisition {
            resource: acquire_resource(mode, &path),
            selection,
        })
        .await?;

        // 5. Transfer the acquired resource into the retained selection here.
        // There is no further await before installation. If the request is
        // dropped while awaiting the worker, its unused result is discarded
        // with the lock still held; the worker never installs a selection.
        let resource = match acquisition.resource {
            Ok(resource) => resource,
            Err(error) => return Ok(Err(error)),
        };
        Ok(resource
            .install(&mut acquisition.selection)
            .map(|resource| selected(mode, Some(resource))))
    }
}

/// Open and validate a replacement without changing the retained selection.
fn acquire_resource(mode: PickMode, path: &Path) -> Result<AcquiredResource, SourceError> {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    Ok(match mode {
        PickMode::File => AcquiredResource::File {
            name,
            source: NativeFileSource::new(File::open(path)?)?,
        },
        PickMode::Folder => AcquiredResource::Directory {
            name,
            directory: NativeDirectory::open(path)?,
        },
    })
}

impl AcquiredResource {
    /// Consume this resource, replacing the previous selection on success.
    fn install(self, selection: &mut Selection) -> Result<SelectedResource, SourceError> {
        match self {
            Self::File { name, source } => selection.install_file(name, source),
            Self::Directory { name, directory } => selection.install_directory(name, directory),
        }
    }
}

fn selected(mode: PickMode, resource: Option<SelectedResource>) -> Response {
    match mode {
        PickMode::File => Response::SelectedFile(resource),
        PickMode::Folder => Response::SelectedDirectory(resource),
    }
}

fn operate(selection: &mut Selection, request: Request) -> Result<Response, SourceError> {
    Ok(match request {
        Request::CurrentSelection => Response::Selection(selection.current()?),
        Request::ByteLength { resource } => {
            Response::ByteLength(selection.file(&resource)?.byte_length())
        }
        Request::ReadAt {
            resource,
            offset,
            length,
        } => Response::Read(read_at(selection.file(&resource)?, offset, length)?),
        Request::OpenFile { resource, entry_id } => {
            Response::OpenedFile(selection.open_file(&resource, entry_id)?)
        }
        Request::OpenDirectory { resource, entry_id } => {
            Response::OpenedDirectory(selection.open_directory(&resource, entry_id)?)
        }
        Request::ChooseFile | Request::ChooseFolder => {
            unreachable!("picker requests are dispatched asynchronously")
        }
    })
}

fn failure(error: SourceError) -> anyhow::Result<Response> {
    Ok(Response::Failed(match error {
        SourceError::Cancelled => FileError::Cancelled,
        SourceError::Io(error) => FileError::Io {
            message: error.to_string(),
        },
        error @ SourceError::Provider(_) => {
            return Err(anyhow::Error::from(error)
                .context("Unexpected provider error in native filesystem service"));
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::super::stop_service;
    use super::*;
    use std::{io::Write, time::Duration};
    use tokio::{sync::oneshot, task::JoinSet, time::timeout};

    const TEST_TIMEOUT: Duration = Duration::from_secs(5);

    fn seeded() -> (Handler, String) {
        let mut file = tempfile::tempfile().unwrap();
        file.write_all(b"native bytes").unwrap();
        let mut native = NativeSelection::default();
        native.install_file("seed".into(), NativeFileSource::new(file).unwrap());
        let selection = Selection::new(native);
        let resource = selection.current().unwrap().file.unwrap().resource;
        let (picker, _) = crate::picker::channel();
        (
            Handler {
                selection: Arc::new(Mutex::new(selection)),
                picker,
            },
            resource,
        )
    }

    #[tokio::test]
    async fn cleanup_stops_connections_before_waiting_for_native_state() {
        let (handler, resource) = seeded();
        let selection = Arc::clone(&handler.selection);
        let mut connections = JoinSet::new();
        let (started, ready) = oneshot::channel();
        let (stopped, observed) = oneshot::channel::<()>();
        connections.spawn(async move {
            // Dropping this sender lets the test observe connection-future destruction.
            let _stopped = stopped;
            started.send(()).unwrap();
            std::future::pending::<anyhow::Result<()>>().await
        });
        ready.await.unwrap();
        // An admitted read owns the native lock while shutdown stops connections.
        let mut held = selection.lock().await;
        let cleanup = tokio::spawn(async move {
            stop_service(&mut connections, &handler).await.unwrap();
            assert!(connections.is_empty());
        });
        assert!(timeout(TEST_TIMEOUT, observed).await.unwrap().is_err());
        assert!(!cleanup.is_finished());
        assert_eq!(
            read_at(held.file(&resource).unwrap(), 0, 4).unwrap(),
            b"nati"
        );
        drop(held);
        timeout(TEST_TIMEOUT, cleanup).await.unwrap().unwrap();
        assert!(selection.lock().await.file(&resource).is_err());
        assert!(matches!(
            selection.lock().await.current(),
            Err(SourceError::Cancelled)
        ));
    }

    #[test]
    fn abandoned_native_admission_does_not_occupy_blocking_workers() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .max_blocking_threads(1)
            .build()
            .unwrap();
        runtime.block_on(async {
            let (handler, resource) = seeded();
            let held = handler.selection.lock().await;
            let mut request = Box::pin(handler.dispatch(Request::ByteLength { resource }));
            assert!(futures::poll!(&mut request).is_pending());
            drop(request);
            let probe = tokio::task::spawn_blocking(|| ());
            let completed = timeout(TEST_TIMEOUT, probe).await;
            // Also release on failure, so runtime shutdown cannot wait forever
            // for an abandoned worker that still needs native access.
            drop(held);
            completed
                .expect("Abandoned native admission occupied the blocking worker")
                .unwrap();
        });
    }

    #[tokio::test]
    async fn file_dialog_uses_basename_and_shutdown_discards_late_results() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("sample");
        std::fs::write(&path, b"data").unwrap();
        let (mut handler, _) = seeded();
        let selection = Arc::clone(&handler.selection);
        let (picker, main) = crate::picker::channel();
        let mut calls = 0;
        let task = tokio::spawn(main.run_with(move |mode| {
            assert_eq!(mode, PickMode::File);
            calls += 1;
            if calls == 2 {
                // Stop the owner while the dialog is open, before returning its path.
                selection.try_lock().unwrap().shutdown();
            }
            Some(path.clone())
        }));
        handler.picker = picker;
        let Response::SelectedFile(Some(selected)) =
            handler.dispatch(Request::ChooseFile).await.unwrap()
        else {
            panic!("expected selected file");
        };
        assert_eq!(selected.name, "sample");
        assert_eq!(
            handler
                .dispatch(Request::ReadAt {
                    resource: selected.resource,
                    offset: 0,
                    length: 4
                })
                .await
                .unwrap(),
            Response::Read(b"data".to_vec())
        );
        assert_eq!(
            handler.dispatch(Request::ChooseFile).await.unwrap(),
            Response::Failed(FileError::Cancelled)
        );
        drop(handler);
        task.await.unwrap();
    }

    #[tokio::test]
    async fn directory_navigation_preserves_state_on_failure_and_replaces_on_success() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("nested")).unwrap();
        std::fs::write(root.path().join("sample"), b"parent").unwrap();
        std::fs::write(root.path().join("nested/inner"), b"child").unwrap();
        let (handler, _) = seeded();
        let parent = handler
            .selection
            .lock()
            .await
            .install_directory("parent".into(), NativeDirectory::open(root.path()).unwrap())
            .unwrap()
            .resource;
        let Response::Selection(state) = handler.dispatch(Request::CurrentSelection).await.unwrap()
        else {
            panic!("expected directory entries");
        };
        let file_id = state
            .entries
            .iter()
            .find(|entry| entry.name == "sample")
            .unwrap()
            .id;
        let nested_id = state
            .entries
            .iter()
            .find(|entry| entry.name == "nested")
            .unwrap()
            .id;
        let Response::OpenedFile(file) = handler
            .dispatch(Request::OpenFile {
                resource: parent.clone(),
                entry_id: file_id,
            })
            .await
            .unwrap()
        else {
            panic!("expected opened file");
        };
        assert!(matches!(
            handler
                .dispatch(Request::OpenDirectory {
                    resource: parent.clone(),
                    entry_id: file_id
                })
                .await
                .unwrap(),
            Response::Failed(FileError::Io { .. })
        ));
        assert_eq!(
            handler
                .dispatch(Request::ByteLength {
                    resource: file.clone()
                })
                .await
                .unwrap(),
            Response::ByteLength(6)
        );
        let Response::OpenedDirectory(child) = handler
            .dispatch(Request::OpenDirectory {
                resource: parent.clone(),
                entry_id: nested_id,
            })
            .await
            .unwrap()
        else {
            panic!("expected child directory");
        };
        assert!(matches!(
            handler
                .dispatch(Request::ByteLength { resource: file })
                .await
                .unwrap(),
            Response::Failed(FileError::Io { .. })
        ));
        assert!(matches!(
            handler
                .dispatch(Request::OpenFile {
                    resource: parent,
                    entry_id: file_id
                })
                .await
                .unwrap(),
            Response::Failed(FileError::Io { .. })
        ));
        let Response::Selection(state) = handler.dispatch(Request::CurrentSelection).await.unwrap()
        else {
            panic!("expected current selection");
        };
        assert!(state.file.is_none());
        assert_eq!(
            state.directory,
            Some(SelectedResource {
                resource: child,
                name: "nested".into()
            })
        );
        assert_eq!(state.entries.len(), 1);
        assert_eq!(state.entries[0].name, "inner");
    }

    #[tokio::test]
    async fn cancelled_and_failed_file_and_folder_acquisition_preserve_selection() {
        for mode in [PickMode::File, PickMode::Folder] {
            let (mut handler, _) = seeded();
            let before = handler.dispatch(Request::CurrentSelection).await.unwrap();
            let (picker, main) = crate::picker::channel();
            let mut calls = 0;
            let root = tempfile::tempdir().unwrap();
            let missing = root.path().join("missing");
            let task = tokio::spawn(main.run_with(move |requested| {
                assert_eq!(requested, mode);
                calls += 1;
                (calls == 2).then(|| missing.clone())
            }));
            handler.picker = picker;
            let request = match mode {
                PickMode::File => Request::ChooseFile,
                PickMode::Folder => Request::ChooseFolder,
            };
            assert_eq!(
                handler.dispatch(request.clone()).await.unwrap(),
                selected(mode, None)
            );
            assert!(matches!(
                handler.dispatch(request).await.unwrap(),
                Response::Failed(FileError::Io { .. })
            ));
            assert_eq!(
                handler.dispatch(Request::CurrentSelection).await.unwrap(),
                before
            );
            drop(handler);
            task.await.unwrap();
        }
    }

    #[test]
    fn abandoned_picker_acquisition_cannot_replace_the_owner_after_waiting_for_access() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("late");
        std::fs::write(&path, b"late").unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let (selection, before) = runtime.block_on(async {
            let (mut handler, _) = seeded();
            let before = handler.dispatch(Request::CurrentSelection).await.unwrap();
            let (picker, main) = crate::picker::channel();
            handler.picker = picker;
            let mut panel = Box::pin(main.run_with(move |_| Some(path.clone())));
            let mut request = Box::pin(handler.dispatch(Request::ChooseFile));
            assert!(futures::poll!(&mut request).is_pending());
            // Deliver the panel result while native access remains held, then
            // abandon the request while it awaits access, before submitting a worker.
            let held = handler.selection.lock().await;
            assert!(futures::poll!(&mut panel).is_pending());
            assert!(futures::poll!(&mut request).is_pending());
            drop(request);
            drop(held);
            let selection = Arc::clone(&handler.selection);
            drop(handler);
            panel.await;
            (selection, before)
        });
        // Drain any blocking work before checking the retained selection, so a
        // regression that submits a detached worker cannot hide a late replacement.
        drop(runtime);
        assert_eq!(
            Response::Selection(selection.blocking_lock().current().unwrap()),
            before
        );
    }
}
