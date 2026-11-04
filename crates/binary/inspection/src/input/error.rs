//! Acquisition errors remain distinct from malformed-binary diagnostics.

use std::{error::Error, fmt, io};

/// Failure reported by a source provider.
#[derive(Debug)]
pub enum SourceError {
    /// The operation was explicitly cancelled.
    Cancelled,
    /// Original I/O error, including its kind and any native error code.
    Io(io::Error),
    /// Original owned provider error, without requiring its type in the core.
    Provider(Box<dyn Error + Send + Sync>),
}

impl fmt::Display for SourceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Cancelled => formatter.write_str("Input read cancelled"),
            Self::Io(error) => error.fmt(formatter),
            Self::Provider(error) => fmt::Display::fmt(error, formatter),
        }
    }
}

impl Error for SourceError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Provider(error) => Some(error.as_ref()),
            Self::Cancelled => None,
        }
    }
}

impl From<io::Error> for SourceError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

/// Recoverable acquisition or source-contract failure.
#[derive(Debug)]
pub enum InputError {
    /// The source returned EOF before filling a validated range.
    UnexpectedEof {
        /// Offset at which the source stopped producing bytes.
        offset: u64,
        /// Bytes still needed to complete the read.
        remaining: u64,
    },
    /// A provider violated the read contract.
    InvalidReadCount {
        /// Count reported by the provider.
        reported: usize,
        /// Capacity of the destination given to that provider.
        capacity: usize,
    },
    /// A provider failed while serving the given absolute offset.
    Source {
        /// Offset of the failed provider call.
        offset: u64,
        /// Original provider failure.
        error: SourceError,
    },
}

impl fmt::Display for InputError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnexpectedEof { offset, remaining } => write!(
                formatter,
                "Input ended at {offset} with {remaining} bytes still required",
            ),
            Self::InvalidReadCount { reported, capacity } => write!(
                formatter,
                "Source reported {reported} bytes for a {capacity}-byte destination",
            ),
            Self::Source { offset, error } => write!(formatter, "Input read at {offset}: {error}"),
        }
    }
}

impl Error for InputError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Source { error, .. } => Some(error),
            _ => None,
        }
    }
}

/// Nonempty acquisition failures in the order observed during one inspection.
///
/// Repeated failures remain separate entries. Each [`InputError`] retains its
/// own cause chain; independent entries are not causes of one another.
/// This collection therefore has no [`Error::source`]. Enumerate [`Self::errors`]
/// to inspect each failure and its original cause.
#[derive(Debug)]
pub struct InputErrors {
    errors: Vec<InputError>,
}

impl InputErrors {
    /// Own the observed failures, or return `None` when no acquisition failed.
    pub fn from_errors(errors: Vec<InputError>) -> Option<Self> {
        if errors.is_empty() {
            None
        } else {
            Some(Self { errors })
        }
    }

    /// Borrow every acquisition failure in occurrence order.
    pub fn errors(&self) -> &[InputError] {
        &self.errors
    }

    /// Transfer every acquisition failure without cloning its original cause.
    pub fn into_errors(self) -> Vec<InputError> {
        self.errors
    }
}

impl From<InputError> for InputErrors {
    fn from(error: InputError) -> Self {
        Self {
            errors: vec![error],
        }
    }
}

impl fmt::Display for InputErrors {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let [error] = self.errors.as_slice() {
            return error.fmt(formatter);
        }

        write!(
            formatter,
            "Input acquisition failed with {} errors:",
            self.errors.len(),
        )?;
        for (index, error) in self.errors.iter().enumerate() {
            write!(formatter, "\n{}. {error}", index + 1)?;
        }
        Ok(())
    }
}

impl Error for InputErrors {}
