use std::{fs::File, io, path::Path};

use filesystem_data::DirectoryEntry;

use crate::{NativeDirectory, NativeFileSource};

/// Maximum captured directories retained under one selected root, including the root.
pub const MAX_RETAINED_DIRECTORIES: usize = 64;

/// Identity of a captured directory in one native owner.
///
/// Identities are not reused after replacement. They are not native paths or
/// persistent filesystem identities.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct DirectoryId(u64);

/// A listing-scoped entry within a retained native directory.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct NativeDirectoryEntryRef {
    /// Retained directory owning the entry.
    pub directory: DirectoryId,
    /// Identifier in that directory's captured listing.
    pub entry_id: u32,
}

/// Borrowed presentation and listing data for a retained directory.
#[derive(Clone, Copy, Debug)]
pub struct NativeDirectoryInfo<'a> {
    /// Stable identity while this root remains retained.
    pub id: DirectoryId,
    /// Captured display name, never used to resolve a path.
    pub name: &'a str,
    /// Entry from which this child was loaded; absent for the selected root.
    pub parent: Option<NativeDirectoryEntryRef>,
    /// Captured bounded immediate listing.
    pub entries: &'a [DirectoryEntry],
}

#[derive(Debug)]
struct Selected<T> {
    name: String,
    resource: T,
}

#[derive(Debug)]
struct RetainedDirectory {
    id: DirectoryId,
    parent: Option<NativeDirectoryEntryRef>,
    selected: Selected<NativeDirectory>,
}

impl RetainedDirectory {
    fn info(&self) -> NativeDirectoryInfo<'_> {
        NativeDirectoryInfo {
            id: self.id,
            name: &self.selected.name,
            parent: self.parent,
            entries: self.selected.resource.entries(),
        }
    }
}

/// One retained file and a lazily captured directory tree with a stable root.
///
/// External file/folder replacement drops the previous tree only after successful
/// acquisition. Loading an immediate child retains all loaded siblings and changes
/// neither the file nor the current listing cursor. Listed file selection retains
/// the tree. Legacy directory navigation moves the cursor and drops the file.
/// Failed acquisition or an exceeded directory limit leaves ownership unchanged.
///
/// This is ordinary native ownership without dialogs or a host runtime. Captured
/// listings are not a filesystem snapshot or confinement boundary; later opens
/// retain [`NativeDirectory`]'s ordinary path-resolution semantics.
#[derive(Debug, Default)]
pub struct NativeSelection {
    file: Option<Selected<NativeFileSource>>,
    file_entry: Option<NativeDirectoryEntryRef>,
    directories: Vec<RetainedDirectory>,
    root: Option<DirectoryId>,
    current_directory: Option<DirectoryId>,
    next_directory_id: u64,
}

impl NativeSelection {
    /// Open a regular external file before replacing the file and directory tree.
    pub fn select_file(&mut self, path: impl AsRef<Path>) -> io::Result<()> {
        let path = path.as_ref();
        let source = NativeFileSource::new(File::open(path)?)?;
        self.install_file(display_name(path), source);
        Ok(())
    }

    /// Capture a root listing before replacing the directory tree and file.
    pub fn select_directory(&mut self, path: impl AsRef<Path>) -> io::Result<()> {
        let path = path.as_ref();
        let directory = NativeDirectory::open(path)?;
        self.install_directory(display_name(path), directory)?;
        Ok(())
    }

    /// Install an acquired external file, dropping the entire directory tree.
    /// The caller completes its acquisition policy before transferring ownership.
    pub fn install_file(&mut self, name: String, source: NativeFileSource) {
        self.file = Some(Selected {
            name,
            resource: source,
        });
        self.file_entry = None;
        self.directories.clear();
        self.root = None;
        self.current_directory = None;
    }

    /// Install an acquired root and listing, dropping the old tree and file.
    pub fn install_directory(
        &mut self,
        name: String,
        directory: NativeDirectory,
    ) -> io::Result<DirectoryId> {
        let id = self.allocate_directory_id()?;
        self.directories = vec![RetainedDirectory {
            id,
            parent: None,
            selected: Selected {
                name,
                resource: directory,
            },
        }];
        self.root = Some(id);
        self.current_directory = Some(id);
        self.file = None;
        self.file_entry = None;
        Ok(id)
    }

    /// Load one immediate child without moving the cursor or replacing the file.
    /// Repeated loads return the same identity and captured listing without I/O.
    pub fn load_child(&mut self, parent: DirectoryId, entry_id: u32) -> io::Result<DirectoryId> {
        let origin = NativeDirectoryEntryRef {
            directory: parent,
            entry_id,
        };
        if let Some(child) = self
            .directories
            .iter()
            .find(|value| value.parent == Some(origin))
        {
            return Ok(child.id);
        }
        let parent = self.retained_directory(parent)?;
        if self.directories.len() == MAX_RETAINED_DIRECTORIES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Retained directory limit reached (64)",
            ));
        }
        let directory = parent.selected.resource.open_directory(entry_id)?;
        let name = parent.selected.resource.entries()[entry_id as usize]
            .name
            .clone();
        let id = self.allocate_directory_id()?;
        self.directories.push(RetainedDirectory {
            id,
            parent: Some(origin),
            selected: Selected {
                name,
                resource: directory,
            },
        });
        Ok(id)
    }

    /// Open a captured file from any retained directory, preserving the root/tree.
    /// The current listing cursor becomes its parent only after acquisition succeeds.
    pub fn open_file_from(&mut self, directory: DirectoryId, entry_id: u32) -> io::Result<()> {
        let parent = self.retained_directory(directory)?;
        let source = NativeFileSource::new(parent.selected.resource.open_file(entry_id)?)?;
        let name = parent.selected.resource.entries()[entry_id as usize]
            .name
            .clone();
        self.file = Some(Selected {
            name,
            resource: source,
        });
        self.file_entry = Some(NativeDirectoryEntryRef {
            directory,
            entry_id,
        });
        self.current_directory = Some(directory);
        Ok(())
    }

    /// Open a captured file from the current listing, retaining the directory tree.
    pub fn open_file(&mut self, entry_id: u32) -> io::Result<()> {
        self.open_file_from(self.current_directory.ok_or_else(no_directory)?, entry_id)
    }

    /// Navigate to an immediate child of any retained parent, preserving the root.
    /// Successful cursor navigation clears the file; lazy loading alone does not.
    pub fn open_directory_from(
        &mut self,
        parent: DirectoryId,
        entry_id: u32,
    ) -> io::Result<DirectoryId> {
        let id = self.load_child(parent, entry_id)?;
        self.current_directory = Some(id);
        self.file = None;
        self.file_entry = None;
        Ok(id)
    }

    /// Navigate from the current listing to a captured child, retaining the root.
    pub fn open_directory(&mut self, entry_id: u32) -> io::Result<()> {
        self.open_directory_from(self.current_directory.ok_or_else(no_directory)?, entry_id)?;
        Ok(())
    }

    /// Identity of the selected root, if a directory tree is retained.
    pub fn root_directory(&self) -> Option<DirectoryId> {
        self.root
    }

    /// Identity of the listing cursor used by legacy navigation.
    pub fn current_directory(&self) -> Option<DirectoryId> {
        self.current_directory
    }

    /// Captured origin of a listed file; absent for external file selection.
    pub fn file_entry(&self) -> Option<NativeDirectoryEntryRef> {
        self.file_entry
    }

    /// Return a retained directory's captured data without filesystem I/O.
    pub fn directory(&self, id: DirectoryId) -> Option<NativeDirectoryInfo<'_>> {
        self.directories
            .iter()
            .find(|value| value.id == id)
            .map(RetainedDirectory::info)
    }

    /// Iterate loaded directories in acquisition order without filesystem I/O.
    pub fn directories(&self) -> impl Iterator<Item = NativeDirectoryInfo<'_>> {
        self.directories.iter().map(RetainedDirectory::info)
    }

    /// Display name captured for the selected file, if any.
    pub fn file_name(&self) -> Option<&str> {
        self.file.as_ref().map(|file| file.name.as_str())
    }

    /// Borrow the retained file without transferring ownership.
    pub fn file(&self) -> Option<&NativeFileSource> {
        self.file.as_ref().map(|file| &file.resource)
    }

    /// Borrow the retained file for native reads or analysis.
    pub fn file_mut(&mut self) -> Option<&mut NativeFileSource> {
        self.file.as_mut().map(|file| &mut file.resource)
    }

    /// Display name captured for the current directory cursor, if any.
    pub fn directory_name(&self) -> Option<&str> {
        self.current_directory
            .and_then(|id| self.directory(id))
            .map(|value| value.name)
    }

    /// Captured listing at the current cursor, empty without a retained directory.
    pub fn entries(&self) -> &[DirectoryEntry] {
        self.current_directory
            .and_then(|id| self.directory(id))
            .map_or(&[], |value| value.entries)
    }

    fn retained_directory(&self, id: DirectoryId) -> io::Result<&RetainedDirectory> {
        self.directories
            .iter()
            .find(|value| value.id == id)
            .ok_or_else(no_directory)
    }

    fn allocate_directory_id(&mut self) -> io::Result<DirectoryId> {
        let next = self
            .next_directory_id
            .checked_add(1)
            .ok_or_else(|| io::Error::other("Native directory identifiers exhausted"))?;
        self.next_directory_id = next;
        Ok(DirectoryId(next))
    }
}

fn no_directory() -> io::Error {
    io::Error::new(io::ErrorKind::NotFound, "Unknown retained native directory")
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}
