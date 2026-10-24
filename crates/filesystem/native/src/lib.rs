//! Native file acquisition for the reusable `binary-inspection` analyzer.
//!
//! [`NativeFileSource`] owns an already-open regular file and supplies bounded
//! offset reads. The caller chooses how that handle is acquired and authorized;
//! [`NativeDirectory`] stores a selected directory path and an immediate listing;
//! child opens use ordinary native path resolution. This crate does not interpret
//! binaries or enforce directory confinement.
//! [`NativeSelection`] retains acquired resources and their presentation data
//! across reads and analyses, replacing them only after successful acquisition.
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
pub use selection::NativeSelection;

#[cfg(any(unix, windows))]
pub use file::NativeFileSource;

#[cfg(any(unix, windows))]
pub use directory::{MAX_DIRECTORY_ENTRIES, MAX_DIRECTORY_NAME_BYTES, NativeDirectory};
