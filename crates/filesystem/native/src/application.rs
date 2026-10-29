use std::{fs, fs::File, io, path::Path};

use binary_inspection::{
    ApplicationBundleRootFacts, inspect_source, validate_application_bundle_root,
};

use crate::{NativeDirectory, NativeFileSource};

/// An acquired modern `.app` root accepted by the ordinary Rust layout policy.
///
/// Fields stay private so callers cannot install application scope around an
/// unvalidated generic directory. This does not validate plist contents, signatures
/// or executable eligibility, and later opens retain ordinary live-path semantics.
#[derive(Debug)]
pub struct NativeApplication {
    pub(crate) name: String,
    pub(crate) directory: NativeDirectory,
}

impl NativeApplication {
    /// Validate the chosen root and capture its bounded immediate listing.
    /// Failed acquisition changes no existing native owner.
    pub fn open(path: impl AsRef<Path>) -> io::Result<Self> {
        let path = path.as_ref();
        let is_directory = is_kind(path, |kind| kind.is_dir())?;
        let contents = path.join("Contents");
        let contents_is_directory = is_directory && is_kind(&contents, |kind| kind.is_dir())?;
        let info_plist_is_file =
            contents_is_directory && is_kind(&contents.join("Info.plist"), |kind| kind.is_file())?;
        let name = path.file_name().unwrap_or_default();
        validate_application_bundle_root(
            name.as_encoded_bytes(),
            ApplicationBundleRootFacts {
                is_directory,
                contents_is_directory,
                info_plist_is_file,
            },
        )
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error))?;
        let directory = NativeDirectory::open(path)?;
        Ok(Self {
            name: name.to_string_lossy().into_owned(),
            directory,
        })
    }

    /// Captured display name of the chosen application.
    pub fn name(&self) -> &str {
        &self.name
    }
}

/// An acquired standalone file accepted by the supported Mach-O header inspector.
///
/// Acquisition does not perform dependency inspection or validate a signature.
/// Private fields prevent attaching binary scope to an unvalidated generic source.
#[derive(Debug)]
pub struct NativeBinary {
    pub(crate) name: String,
    pub(crate) source: NativeFileSource,
}

impl NativeBinary {
    /// Open a regular file and inspect its thin/universal Mach-O headers.
    /// Extensionless files are supported; no filename or executable-bit filter applies.
    pub fn open(path: impl AsRef<Path>) -> io::Result<Self> {
        let path = path.as_ref();
        let mut source = NativeFileSource::new(File::open(path)?)?;
        inspect_source(&mut source)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        Ok(Self {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            source,
        })
    }

    /// Captured display name of the chosen binary.
    pub fn name(&self) -> &str {
        &self.name
    }
}

fn is_kind(path: &Path, predicate: impl FnOnce(fs::FileType) -> bool) -> io::Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(predicate(metadata.file_type())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}
