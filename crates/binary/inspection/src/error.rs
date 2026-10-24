//! Structured diagnostics retain facts independently of human-readable wording.

use std::fmt;

/// Machine-readable reason and associated values.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ErrorKind {
    /// A requested range extends beyond its containing input region.
    Truncated {
        /// Number of bytes requested.
        requested_size: u64,
        /// Number of bytes available from the requested offset within the containing region.
        available_size: u64,
    },
    /// A file-offset calculation cannot be represented.
    RangeOverflow,
    /// The detected format is not a supported Mach-O image.
    UnsupportedImage,
    /// The upstream decoder's original error, without interpreting its message.
    Decode(object::Error),
}

/// Recoverable decode or input failure.
///
/// This implements the standard Error trait so native callers can propagate it
/// through ordinary error types. Match kind for policy; message wording
/// is for people and is not a stable machine interface.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnalysisError {
    /// Failure reason, numeric evidence or upstream decoding cause.
    pub kind: ErrorKind,
}

impl AnalysisError {
    pub(crate) fn new(kind: ErrorKind) -> Self {
        Self { kind }
    }
}

impl fmt::Display for ErrorKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Truncated {
                requested_size,
                available_size,
            } => write!(
                formatter,
                "Requested {requested_size} bytes, but only {available_size} remain in this region"
            ),
            Self::RangeOverflow => {
                formatter.write_str("The declared byte range overflows the supported offset space")
            }
            Self::UnsupportedImage => {
                formatter.write_str("The input is not a supported Mach-O image")
            }
            Self::Decode(error) => fmt::Display::fmt(error, formatter),
        }
    }
}

impl fmt::Display for AnalysisError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.kind, formatter)
    }
}

impl std::error::Error for AnalysisError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match &self.kind {
            ErrorKind::Decode(error) => Some(error),
            _ => None,
        }
    }
}
