use std::{
    ffi::OsString,
    fs::{self, File},
    io,
    path::{Path, PathBuf, absolute},
};

use filesystem_data::{DirectoryEntry, DirectoryEntryKind};

/// Maximum number of immediate entries retained for one directory.
pub const MAX_DIRECTORY_ENTRIES: usize = 512;
/// Maximum aggregate UTF-8 display-name bytes retained for one directory.
pub const MAX_DIRECTORY_NAME_BYTES: usize = 64 * 1024;

/// An absolute directory path and a bounded listing of its immediate children.
///
/// Acquisition captures the listing once. Later opens resolve the stored path
/// again, so renaming or replacing the directory can change their outcome.
/// Entry IDs identify captured names, not persistent filesystem objects.
/// This resource provides ordinary native path access, not a filesystem snapshot
/// or a directory confinement boundary.
#[derive(Debug)]
pub struct NativeDirectory {
    path: PathBuf,
    /// Entry IDs index this listing and the corresponding original native names.
    entries: Vec<DirectoryEntry>,
    native_names: Vec<OsString>,
}

impl NativeDirectory {
    /// List a directory chosen by the caller and retain its absolute path.
    ///
    /// Rejects the entire listing when either limit is exceeded. No partial
    /// listing is exposed. All native I/O errors are preserved.
    pub fn open(path: impl AsRef<Path>) -> io::Result<Self> {
        let path = absolute(path)?;
        let mut entries = Vec::new();
        let mut native_names = Vec::new();
        let mut name_bytes = 0;
        for child in fs::read_dir(&path)? {
            let child = child?;
            if entries.len() == MAX_DIRECTORY_ENTRIES {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "Directory exceeds the 512-entry limit",
                ));
            }
            let native_name = child.file_name();
            let name = native_name.to_string_lossy().into_owned();
            if name.len() > MAX_DIRECTORY_NAME_BYTES - name_bytes {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "Directory exceeds the 64 KiB display-name limit",
                ));
            }
            name_bytes += name.len();
            let file_type = child.file_type()?;
            let kind = if file_type.is_symlink() {
                DirectoryEntryKind::Symlink
            } else if file_type.is_file() {
                DirectoryEntryKind::File
            } else if file_type.is_dir() {
                DirectoryEntryKind::Directory
            } else {
                DirectoryEntryKind::Other
            };
            entries.push(DirectoryEntry {
                id: entries.len() as u32,
                name,
                kind,
            });
            native_names.push(native_name);
        }
        Ok(Self {
            path,
            entries,
            native_names,
        })
    }

    /// Return the captured bounded listing; IDs remain stable for this resource.
    pub fn entries(&self) -> &[DirectoryEntry] {
        &self.entries
    }

    /// Open the current path of one listed immediate directory child.
    ///
    /// Uses the original native name and rejects entries not captured as
    /// directories. A non-following metadata check also rejects a child replaced
    /// by a symlink or another type before opening its bounded listing.
    ///
    /// The check is not atomic with listing: concurrent replacement can redirect
    /// the open through a symlink. Ordinary native path resolution applies, and
    /// the returned directory owns its path and captured listing independently.
    pub fn open_directory(&self, entry_id: u32) -> io::Result<Self> {
        let index = entry_id as usize;
        let entry = self.entries.get(index).ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidInput, "Unknown directory entry ID")
        })?;
        if entry.kind != DirectoryEntryKind::Directory {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Directory entry is not a directory",
            ));
        }
        let path = self.path.join(&self.native_names[index]);
        if !fs::symlink_metadata(&path)?.file_type().is_dir() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Directory entry is no longer a directory",
            ));
        }
        Self::open(path)
    }

    /// Open the current path of one listed regular child.
    ///
    /// Display names are never used to construct paths. A non-following metadata
    /// check rejects observed symlinks and other nonregular entries before open;
    /// the opened handle must also report a regular file.
    ///
    /// These checks are not atomic with the open. Concurrent replacement can
    /// redirect the open through a symlink or make it block on a special file.
    /// Successful opens return an owned file handle for subsequent reads.
    pub fn open_file(&self, entry_id: u32) -> io::Result<File> {
        let index = entry_id as usize;
        let entry = self.entries.get(index).ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidInput, "Unknown directory entry ID")
        })?;
        if entry.kind != DirectoryEntryKind::File {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Directory entry is not a regular file",
            ));
        }
        let path = self.path.join(&self.native_names[index]);
        if !fs::symlink_metadata(&path)?.file_type().is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Directory entry is no longer a regular file",
            ));
        }
        let file = File::open(path)?;
        if !file.metadata()?.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Directory entry is no longer a regular file",
            ));
        }
        Ok(file)
    }
}
