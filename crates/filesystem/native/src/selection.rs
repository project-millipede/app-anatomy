use std::{fs::File, io, path::Path};

use filesystem_data::DirectoryEntry;

use crate::{NativeDirectory, NativeFileSource};

#[derive(Debug)]
struct Selected<T> {
    name: String,
    resource: T,
}

/// One retained native file and its optional directory context.
///
/// Acquisition and bounded listing complete before a successful replacement
/// drops the previous resources. An external file replaces the whole selection;
/// a listed file retains its parent; a directory replaces both. Failed
/// acquisition leaves the selection unchanged. Dropping the owner closes its
/// file and discards its captured directory listing.
///
/// This is ordinary native ownership, without dialogs, authorization or a host
/// runtime. Reads have [`NativeFileSource`]'s live-file semantics, and child
/// opens have [`NativeDirectory`]'s ordinary path-resolution semantics.
#[derive(Debug, Default)]
pub struct NativeSelection {
    file: Option<Selected<NativeFileSource>>,
    directory: Option<Selected<NativeDirectory>>,
}

impl NativeSelection {
    /// Open a regular file before replacing the file and directory context.
    pub fn select_file(&mut self, path: impl AsRef<Path>) -> io::Result<()> {
        let path = path.as_ref();
        let source = NativeFileSource::new(File::open(path)?)?;
        self.install_file(display_name(path), source);
        Ok(())
    }

    /// Capture a bounded listing before replacing the directory and file.
    pub fn select_directory(&mut self, path: impl AsRef<Path>) -> io::Result<()> {
        let path = path.as_ref();
        let directory = NativeDirectory::open(path)?;
        self.install_directory(display_name(path), directory);
        Ok(())
    }

    /// Install an already-acquired external file, dropping the directory context.
    ///
    /// The caller supplies the display name and completes its acquisition policy
    /// before handing ownership to this method.
    pub fn install_file(&mut self, name: String, source: NativeFileSource) {
        self.file = Some(Selected {
            name,
            resource: source,
        });
        self.directory = None;
    }

    /// Install an already-acquired directory and listing, dropping the file.
    pub fn install_directory(&mut self, name: String, directory: NativeDirectory) {
        self.directory = Some(Selected {
            name,
            resource: directory,
        });
        self.file = None;
    }

    /// Open one captured file entry before replacing the file, retaining its parent.
    pub fn open_file(&mut self, entry_id: u32) -> io::Result<()> {
        let directory = self.directory.as_ref().ok_or_else(no_directory)?;
        let source = NativeFileSource::new(directory.resource.open_file(entry_id)?)?;
        let name = directory.resource.entries()[entry_id as usize].name.clone();
        self.file = Some(Selected {
            name,
            resource: source,
        });
        Ok(())
    }

    /// List a captured child directory before replacing the directory and file.
    pub fn open_directory(&mut self, entry_id: u32) -> io::Result<()> {
        let parent = self.directory.as_ref().ok_or_else(no_directory)?;
        let directory = parent.resource.open_directory(entry_id)?;
        let name = parent.resource.entries()[entry_id as usize].name.clone();
        self.install_directory(name, directory);
        Ok(())
    }

    /// Display name captured for the selected file, if any.
    pub fn file_name(&self) -> Option<&str> {
        self.file.as_ref().map(|file| file.name.as_str())
    }

    /// Borrow the retained file without transferring its ownership.
    pub fn file(&self) -> Option<&NativeFileSource> {
        self.file.as_ref().map(|file| &file.resource)
    }

    /// Borrow the retained file for native reads or analysis.
    pub fn file_mut(&mut self) -> Option<&mut NativeFileSource> {
        self.file.as_mut().map(|file| &mut file.resource)
    }

    /// Display name captured for the selected directory, if any.
    pub fn directory_name(&self) -> Option<&str> {
        self.directory
            .as_ref()
            .map(|directory| directory.name.as_str())
    }

    /// The captured bounded listing, empty when no directory is selected.
    pub fn entries(&self) -> &[DirectoryEntry] {
        self.directory
            .as_ref()
            .map_or(&[], |directory| directory.resource.entries())
    }
}

fn no_directory() -> io::Error {
    io::Error::new(io::ErrorKind::NotFound, "No native directory is selected")
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}
