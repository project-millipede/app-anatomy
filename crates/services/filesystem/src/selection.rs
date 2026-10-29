//! Name retained resources around the ordinary native selection owner.

use std::io;

use binary_inspection::input::SourceError;
use filesystem_native::{
    DirectoryId, NativeApplication, NativeBinary, NativeDirectory, NativeDirectoryEntryRef,
    NativeFileSource, NativeSelection,
};
use filesystem_protocol::{DirectoryEntryRef, DirectoryListing, SelectedResource, SelectionState};

/// One persistent owner with opaque identities for all directories in its root.
pub struct Selection {
    /// An available owner may be empty; `None` means it has been shut down.
    native: Option<NativeSelection>,
    file_id: Option<String>,
    directories: Vec<(DirectoryId, String)>,
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
            directories: native
                .directories()
                .map(|directory| (directory.id, resource_identifier()))
                .collect(),
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
            directory: native
                .current_directory()
                .map(|id| self.selected_directory(native, id)),
            entries: native.entries().to_vec(),
            root: native
                .root_directory()
                .map(|id| self.selected_directory(native, id)),
            file_entry: native.file_entry().map(|entry| self.entry_ref(entry)),
            scope: Some(native.scope()),
        })
    }

    /// Return one already captured listing without additional filesystem I/O.
    pub fn list_directory(&self, resource: &str) -> Result<DirectoryListing, SourceError> {
        let id = self.directory_id(resource)?;
        let native = self.native.as_ref().ok_or(SourceError::Cancelled)?;
        let directory = native.directory(id).ok_or_else(unknown_resource)?;
        Ok(DirectoryListing {
            directory: self.selected_directory(native, id),
            parent: directory.parent.map(|entry| self.entry_ref(entry)),
            entries: directory.entries.to_vec(),
        })
    }

    /// Capture one immediate child without changing file selection or cursor.
    pub fn expand_directory(
        &mut self,
        resource: &str,
        entry_id: u32,
    ) -> Result<DirectoryListing, SourceError> {
        let parent = self.directory_id(resource)?;
        let native = self.native.as_mut().ok_or(SourceError::Cancelled)?;
        let id = native.load_child(parent, entry_id)?;
        let resource = self.publish_directory(id);
        self.list_directory(&resource)
    }

    /// Shutdown only: callers first stop connections and wait for native access.
    pub fn shutdown(&mut self) {
        self.file_id = None;
        self.directories.clear();
        self.native = None;
    }

    /// Install an application only through its validated native acquisition wrapper.
    pub fn install_application(
        &mut self,
        application: NativeApplication,
    ) -> Result<SelectedResource, SourceError> {
        let native = self.native.as_mut().ok_or(SourceError::Cancelled)?;
        let name = application.name().to_owned();
        let id = native.install_application(application)?;
        self.directories.clear();
        let resource = self.publish_directory(id);
        self.file_id = None;
        Ok(SelectedResource { name, resource })
    }

    /// Install a standalone binary only through its validated native wrapper.
    pub fn install_binary(
        &mut self,
        binary: NativeBinary,
    ) -> Result<SelectedResource, SourceError> {
        let native = self.native.as_mut().ok_or(SourceError::Cancelled)?;
        let name = binary.name().to_owned();
        native.install_binary(binary);
        let resource = resource_identifier();
        self.file_id = Some(resource.clone());
        self.directories.clear();
        Ok(SelectedResource { name, resource })
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
        self.directories.clear();
        Ok(SelectedResource { name, resource })
    }

    pub fn install_directory(
        &mut self,
        name: String,
        directory: NativeDirectory,
    ) -> Result<SelectedResource, SourceError> {
        let native = self.native.as_mut().ok_or(SourceError::Cancelled)?;
        let id = native.install_directory(name.clone(), directory)?;
        self.directories.clear();
        let resource = self.publish_directory(id);
        self.file_id = None;
        Ok(SelectedResource { name, resource })
    }

    pub fn open_file(&mut self, directory: &str, entry_id: u32) -> Result<String, SourceError> {
        let id = self.directory_id(directory)?;
        let native = self.native.as_mut().ok_or(SourceError::Cancelled)?;
        native.open_file_from(id, entry_id)?;
        let resource = resource_identifier();
        self.file_id = Some(resource.clone());
        Ok(resource)
    }

    pub fn open_directory(
        &mut self,
        directory: &str,
        entry_id: u32,
    ) -> Result<String, SourceError> {
        let parent = self.directory_id(directory)?;
        let native = self.native.as_mut().ok_or(SourceError::Cancelled)?;
        let id = native.open_directory_from(parent, entry_id)?;
        let resource = self.publish_directory(id);
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

    fn directory_id(&self, resource: &str) -> Result<DirectoryId, SourceError> {
        self.directories
            .iter()
            .find(|(_, value)| value == resource)
            .map(|(id, _)| *id)
            .ok_or_else(unknown_resource)
    }

    fn directory_resource(&self, id: DirectoryId) -> &str {
        &self
            .directories
            .iter()
            .find(|(value, _)| *value == id)
            .expect("retained directory has a service identifier")
            .1
    }

    fn publish_directory(&mut self, id: DirectoryId) -> String {
        if let Some((_, resource)) = self.directories.iter().find(|(value, _)| *value == id) {
            return resource.clone();
        }
        let resource = resource_identifier();
        self.directories.push((id, resource.clone()));
        resource
    }

    fn selected_directory(&self, native: &NativeSelection, id: DirectoryId) -> SelectedResource {
        SelectedResource {
            resource: self.directory_resource(id).into(),
            name: native
                .directory(id)
                .expect("retained directory has an owner")
                .name
                .into(),
        }
    }

    fn entry_ref(&self, entry: NativeDirectoryEntryRef) -> DirectoryEntryRef {
        DirectoryEntryRef {
            directory: self.directory_resource(entry.directory).into(),
            entry_id: entry.entry_id,
        }
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
        assert!(selection.file(&first.resource).is_err());
        assert!(selection.file(&second.resource).is_ok());
        Ok(())
    }

    #[test]
    fn external_replacement_invalidates_every_retained_directory_resource() -> anyhow::Result<()> {
        // 1. Publish a root and a lazy child under distinct opaque resources.
        let root = tempfile::tempdir()?;
        std::fs::create_dir(root.path().join("child"))?;
        let mut native = NativeSelection::default();
        native.select_directory(root.path())?;
        let mut selection = Selection::new(native);
        let state = selection.current()?;
        let root_resource = state.root.unwrap().resource;
        let child = selection.expand_directory(&root_resource, state.entries[0].id)?;
        let child_resource = child.directory.resource;
        assert!(selection.list_directory(&root_resource).is_ok());
        assert!(selection.list_directory(&child_resource).is_ok());

        // 2. External file replacement invalidates both capabilities together.
        selection.install_file(
            "external".into(),
            NativeFileSource::new(tempfile::tempfile()?)?,
        )?;
        assert!(selection.list_directory(&root_resource).is_err());
        assert!(selection.list_directory(&child_resource).is_err());
        let state = selection.current()?;
        assert_eq!(state.root, None);
        assert_eq!(state.file_entry, None);
        assert!(state.entries.is_empty());
        Ok(())
    }
}
