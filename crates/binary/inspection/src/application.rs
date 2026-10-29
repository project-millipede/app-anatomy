//! Application-root eligibility from caller-observed filesystem facts.

use std::fmt;

/// Filesystem observations required for the supported modern `.app` layout.
///
/// Providers gather these facts without following the final entry as a symlink.
/// This describes root shape, not plist contents, signature validity or execution.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ApplicationBundleRootFacts {
    /// The chosen root is a directory.
    pub is_directory: bool,
    /// Its immediate `Contents` entry is a directory.
    pub contents_is_directory: bool,
    /// `Contents/Info.plist` is a regular file.
    pub info_plist_is_file: bool,
}

/// Why a chosen root is outside the supported application acquisition scope.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApplicationBundleRootError {
    /// The raw root name has no `.app` suffix.
    NotApplicationName,
    /// The chosen root is not a directory.
    NotDirectory,
    /// The supported modern layout has no immediate `Contents` directory.
    MissingContents,
    /// The supported layout has no regular `Contents/Info.plist` file.
    MissingInfoPlist,
}

impl fmt::Display for ApplicationBundleRootError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::NotApplicationName => "Choose one application directory whose name ends in .app.",
            Self::NotDirectory => "The chosen application root is not a directory.",
            Self::MissingContents => "The application has no supported Contents directory.",
            Self::MissingInfoPlist => "The application has no regular Contents/Info.plist file.",
        })
    }
}

impl std::error::Error for ApplicationBundleRootError {}

/// Validate one chosen `.app` root using caller-observed layout facts.
///
/// Only the modern `Contents/Info.plist` layout is supported. Names remain raw
/// bytes; no UTF-8 conversion, path resolution or filesystem access occurs here.
/// Success establishes an acquisition scope, not plist or executable validity,
/// signature integrity, complete inventory coverage or a confinement boundary.
///
/// # Errors
/// Returns the first unsupported name or layout fact.
pub fn validate_application_bundle_root(
    name: &[u8],
    facts: ApplicationBundleRootFacts,
) -> Result<(), ApplicationBundleRootError> {
    if !name.ends_with(b".app") {
        return Err(ApplicationBundleRootError::NotApplicationName);
    }
    if !facts.is_directory {
        return Err(ApplicationBundleRootError::NotDirectory);
    }
    if !facts.contents_is_directory {
        return Err(ApplicationBundleRootError::MissingContents);
    }
    if !facts.info_plist_is_file {
        return Err(ApplicationBundleRootError::MissingInfoPlist);
    }
    Ok(())
}
