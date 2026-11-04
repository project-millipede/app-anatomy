//! Filesystem request dispatch, native acquisition and retained-owner cleanup.

#[cfg(test)]
mod tests;

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
        PickMode::File => {
            let opened_file = File::open(path)?;
            let file_source = NativeFileSource::new(opened_file)?;
            AcquiredResource::File {
                name,
                source: file_source,
            }
        }
        PickMode::Folder => {
            let native_directory = NativeDirectory::open(path)?;
            AcquiredResource::Directory {
                name,
                directory: native_directory,
            }
        }
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
        Request::CurrentSelection => {
            let current_selection = selection.current()?;
            Response::Selection(current_selection)
        }
        Request::ByteLength { resource } => {
            let file_source = selection.file(&resource)?;
            Response::ByteLength(file_source.byte_length())
        }
        Request::ReadAt {
            resource,
            offset,
            length,
        } => {
            let file_source = selection.file(&resource)?;
            let returned_bytes = read_at(file_source, offset, length)?;
            Response::Read(returned_bytes)
        }
        Request::OpenFile { resource, entry_id } => {
            let file_resource_id = selection.open_file(&resource, entry_id)?;
            Response::OpenedFile(file_resource_id)
        }
        Request::OpenDirectory { resource, entry_id } => {
            let directory_resource_id = selection.open_directory(&resource, entry_id)?;
            Response::OpenedDirectory(directory_resource_id)
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
