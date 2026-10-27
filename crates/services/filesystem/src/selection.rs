//! Name current resources around the ordinary native selection owner.

use std::io;

use binary_inspection::input::SourceError;
use filesystem_native::{NativeDirectory, NativeFileSource, NativeSelection};
use filesystem_protocol::{SelectedResource, SelectionState};

/// One persistent owner. Identifiers name only its current resources.
pub struct Selection {
    /// An available owner may be empty; `None` means it has been shut down.
    native: Option<NativeSelection>,
    file_id: Option<String>,
    directory_id: Option<String>,
}

fn resource_identifier() -> String {
    rand::random::<[u8; 32]>()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn unknown_resource() -> SourceError {
    io::Error::new(io::ErrorKind::NotFound, "Unknown resource identifier").into()
}

impl Selection {
    pub fn new(native: NativeSelection) -> Self {
        Self {
            file_id: native.file().map(|_| resource_identifier()),
            directory_id: native.directory_name().map(|_| resource_identifier()),
            native: Some(native),
        }
    }

    /// Check owner availability before opening a picker or acquiring its result.
    pub fn ensure_available(&self) -> Result<(), SourceError> {
        if self.native.is_none() {
            return Err(SourceError::Cancelled);
        }
        Ok(())
    }

    pub fn current(&self) -> Result<SelectionState, SourceError> {
        let native = self.native.as_ref().ok_or(SourceError::Cancelled)?;
        Ok(SelectionState {
            file: self.file_id.as_ref().map(|resource| SelectedResource {
                resource: resource.clone(),
                name: native
                    .file_name()
                    .expect("file identifier has an owner")
                    .into(),
            }),
            directory: self.directory_id.as_ref().map(|resource| SelectedResource {
                resource: resource.clone(),
                name: native
                    .directory_name()
                    .expect("directory identifier has an owner")
                    .into(),
            }),
            entries: native.entries().to_vec(),
        })
    }

    /// Shutdown only: callers first stop connections and wait for native access.
    pub fn shutdown(&mut self) {
        self.file_id = None;
        self.directory_id = None;
        self.native = None;
    }

    /// Recheck after acquisition; shutdown may have invalidated the dialog.
    pub fn install_file(
        &mut self,
        name: String,
        source: NativeFileSource,
    ) -> Result<SelectedResource, SourceError> {
        let native = self.native.as_mut().ok_or(SourceError::Cancelled)?;
        let resource = resource_identifier();
        native.install_file(name.clone(), source);
        self.file_id = Some(resource.clone());
        self.directory_id = None;
        Ok(SelectedResource { name, resource })
    }

    pub fn install_directory(
        &mut self,
        name: String,
        directory: NativeDirectory,
    ) -> Result<SelectedResource, SourceError> {
        let native = self.native.as_mut().ok_or(SourceError::Cancelled)?;
        let resource = resource_identifier();
        native.install_directory(name.clone(), directory);
        self.directory_id = Some(resource.clone());
        self.file_id = None;
        Ok(SelectedResource { name, resource })
    }

    fn check_directory(&self, resource: &str) -> Result<(), SourceError> {
        if self.directory_id.as_deref() != Some(resource) {
            return Err(unknown_resource());
        }
        Ok(())
    }

    pub fn open_file(&mut self, directory: &str, entry_id: u32) -> Result<String, SourceError> {
        self.check_directory(directory)?;
        let native = self.native.as_mut().ok_or(SourceError::Cancelled)?;
        native.open_file(entry_id)?;
        let resource = resource_identifier();
        self.file_id = Some(resource.clone());
        Ok(resource)
    }

    pub fn open_directory(
        &mut self,
        directory: &str,
        entry_id: u32,
    ) -> Result<String, SourceError> {
        self.check_directory(directory)?;
        let native = self.native.as_mut().ok_or(SourceError::Cancelled)?;
        native.open_directory(entry_id)?;
        let resource = resource_identifier();
        self.directory_id = Some(resource.clone());
        self.file_id = None;
        Ok(resource)
    }

    pub fn file(&mut self, resource: &str) -> Result<&mut NativeFileSource, SourceError> {
        if self.file_id.as_deref() != Some(resource) {
            return Err(unknown_resource());
        }
        let native = self.native.as_mut().ok_or(SourceError::Cancelled)?;
        native.file_mut().ok_or_else(unknown_resource)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_replacement_rejects_previous_identifier() -> anyhow::Result<()> {
        let mut selection = Selection::new(NativeSelection::default());
        let first = selection.install_file(
            "first".into(),
            NativeFileSource::new(tempfile::tempfile()?)?,
        )?;
        let second = selection.install_file(
            "second".into(),
            NativeFileSource::new(tempfile::tempfile()?)?,
        )?;

        // The previous identifier must be rejected after replacement.
        assert!(selection.file(&first.resource).is_err());

        // The replacement identifier must allow access to the selected file.
        assert!(selection.file(&second.resource).is_ok());

        Ok(())
    }
}
