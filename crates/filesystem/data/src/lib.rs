//! Portable directory-listing data shared by filesystem implementations and consumers.
//!
//! These values describe entries; opening policy and native resource ownership
//! belong to their providers. The optional `serde` feature supports serialization.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

/// Kind of filesystem object represented by a child listed inside a directory.
///
/// Observed during listing without following symbolic links.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Deserialize, serde::Serialize))]
pub enum DirectoryEntryKind {
    /// A regular file.
    File,
    /// A directory.
    Directory,
    /// A symbolic link.
    Symlink,
    /// Another filesystem object, such as a socket or named pipe.
    Other,
}

/// One child listed inside a directory, including its identifier, display name and kind.
///
/// The child can be a file, directory, symbolic link or another filesystem object.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Deserialize, serde::Serialize))]
pub struct DirectoryEntry {
    /// Identifier scoped to the owning listing, not a path or global identity.
    pub id: u32,
    /// Display name, potentially lossy and nonunique; not a path for opening.
    pub name: String,
    /// Type observed when the entry was listed, without following symbolic links.
    pub kind: DirectoryEntryKind,
}

/// Acquisition scope established by the native owner, distinct from a file cursor.
/// Application scope survives choosing files or navigating within its retained root.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
#[repr(u8)]
#[cfg_attr(feature = "serde", derive(serde::Deserialize, serde::Serialize))]
pub enum SelectionScope {
    /// No native input has been acquired.
    #[default]
    Empty,
    /// A generic file chosen through the workbench's file control.
    File,
    /// A generic folder chosen through the workbench's folder control.
    Directory,
    /// One structurally eligible modern `.app` root, with its full contents in scope.
    Application,
    /// One standalone file accepted by the supported binary header inspector.
    Binary,
}
