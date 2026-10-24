//! Local protocol diagnostics, separate from serializable provider failures.

/// A protocol allowance whose validation failed.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProtocolLimit {
    ReadRequestBytes,
    ReadResponseBytes,
    RequestedReadBytes,
    ErrorMessageBytes,
    SelectionNameBytes,
    DirectoryEntries,
    DirectoryNameBytes,
    RequestMessageBytes,
    ResponseMessageBytes,
}

/// Project-owned reasons and numeric evidence for caller policy.
///
/// Codec failures remain `Encode` or `Decode`.
/// Their underlying errors are available through [`std::error::Error::source`],
/// but concrete codec error types and message wording are not stable policy APIs.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProtocolErrorKind {
    InvalidResource {
        length: u64,
    },
    LimitExceeded {
        resource: ProtocolLimit,
        limit: u64,
        actual: u64,
    },
    RangeOverflow {
        offset: u64,
        length: u32,
    },
    DuplicateDirectoryEntry {
        id: u32,
    },
    DirectoryNamesOverflow {
        used: u64,
        additional: u64,
    },
    ResponseMismatch,
    TrailingBytes {
        remaining: u64,
    },
    Encode,
    Decode,
}

/// An owned local validation or codec failure.
///
/// This is not a wire payload. Its representation and codec dependency remain
/// private; use [`Self::kind`] for decisions and `source()` for diagnostics.
#[derive(Debug, thiserror::Error)]
#[error(transparent)]
pub struct ProtocolError {
    /// Validation details or the original codec failure, used for classification
    /// and transparent error forwarding.
    representation: ErrorRepr,
}

#[derive(Debug, thiserror::Error)]
enum ErrorRepr {
    #[error("{message}")]
    Validation {
        kind: ProtocolErrorKind,
        message: &'static str,
    },
    #[error("encode filesystem {message}")]
    Encode {
        message: &'static str,
        #[source]
        source: rmp_serde::encode::Error,
    },
    #[error("decode filesystem message")]
    Decode {
        #[source]
        source: rmp_serde::decode::Error,
    },
}

impl ProtocolError {
    pub const fn kind(&self) -> ProtocolErrorKind {
        match &self.representation {
            ErrorRepr::Validation { kind, .. } => *kind,
            ErrorRepr::Encode { .. } => ProtocolErrorKind::Encode,
            ErrorRepr::Decode { .. } => ProtocolErrorKind::Decode,
        }
    }

    pub(crate) fn validation(kind: ProtocolErrorKind, message: &'static str) -> Self {
        Self {
            representation: ErrorRepr::Validation { kind, message },
        }
    }

    pub(crate) fn encode(message: &'static str, source: rmp_serde::encode::Error) -> Self {
        Self {
            representation: ErrorRepr::Encode { message, source },
        }
    }

    pub(crate) fn decode(source: rmp_serde::decode::Error) -> Self {
        Self {
            representation: ErrorRepr::Decode { source },
        }
    }
}
