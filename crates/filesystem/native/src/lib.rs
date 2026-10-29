//! Native file acquisition for the reusable `binary-inspection` analyzer.
//!
//! [`NativeFileSource`] owns an already-open regular file and supplies bounded
//! offset reads. The caller chooses how that handle is acquired and authorized;
//! [`NativeDirectory`] stores a selected directory path and an immediate listing;
//! child opens use ordinary native path resolution. This crate does not interpret
//! binaries or enforce directory confinement.
//! [`NativeSelection`] retains a selected file, a stable root and at most
//! [`MAX_RETAINED_DIRECTORIES`] captured directories. Immediate child loading is
//! lazy and preserves the file and loaded siblings. External replacement occurs
//! only after successful acquisition; ordinary Rust APIs need no remote service.
//! [`NativeApplication`] and [`NativeBinary`] validate their acquisition scopes
//! before installation. Generic file/folder acquisition keeps its generic scope.
//! It has no WIT, Wasm, browser or transport dependency.
//!
//! The source is available on Unix and Windows. Its synchronous operations do
//! not provide cancellation or a filesystem snapshot. Platform behavior is
//! documented on [`NativeFileSource`].

#![forbid(unsafe_code)]
#![warn(missing_docs)]

#[cfg(not(any(unix, windows)))]
compile_error!("filesystem-native requires a Unix or Windows host");

#[cfg(any(unix, windows))]
mod file;

#[cfg(any(unix, windows))]
mod directory;

#[cfg(any(unix, windows))]
mod selection;

#[cfg(any(unix, windows))]
mod application;

#[cfg(any(unix, windows))]
pub use application::{NativeApplication, NativeBinary};

#[cfg(any(unix, windows))]
pub use selection::{
    DirectoryId, MAX_RETAINED_DIRECTORIES, NativeDirectoryEntryRef, NativeDirectoryInfo,
    NativeSelection,
};

#[cfg(any(unix, windows))]
pub use file::NativeFileSource;

#[cfg(any(unix, windows))]
pub use directory::{MAX_DIRECTORY_ENTRIES, MAX_DIRECTORY_NAME_BYTES, NativeDirectory};
