//! Rust-to-WIT error conversion for acquisition and inspection failures.

use binary_inspection::{
    InspectionError,
    input::{InputError, SourceError},
};
use workbench_operations::Failure;

use crate::{
    apple_code::filesystem::source::{IoFailure, ReadError},
    conversion,
    exports::apple_code::analysis::inspection as wire,
};

pub(crate) fn selection(cause: ReadError) -> wire::InspectionError {
    wire::InspectionError::Source(wire::SourceFailure {
        operation: wire::SourceOperation::Selection,
        offset: None,
        cause,
    })
}

pub(crate) fn byte_length(cause: ReadError) -> wire::InspectionError {
    wire::InspectionError::Source(wire::SourceFailure {
        operation: wire::SourceOperation::ByteLength,
        offset: None,
        cause,
    })
}

pub(crate) fn inspection(error: InspectionError) -> wire::InspectionError {
    match error {
        InspectionError::Analysis(error) => {
            wire::InspectionError::Analysis(conversion::analysis_error(error))
        }
        InspectionError::Input(error) => input(error),
    }
}

fn input(error: InputError) -> wire::InspectionError {
    match error {
        InputError::UnexpectedEof { offset, remaining } => {
            wire::InspectionError::UnexpectedEof(wire::IncompleteRead { offset, remaining })
        }
        InputError::InvalidReadCount { reported, capacity } => {
            wire::InspectionError::InvalidReadCount(wire::InvalidReadCount {
                reported: reported as u64,
                capacity: capacity as u64,
            })
        }
        InputError::Source { offset, error } => {
            wire::InspectionError::Source(wire::SourceFailure {
                operation: wire::SourceOperation::ReadAt,
                offset: Some(offset),
                cause: source(error),
            })
        }
    }
}

fn source(error: SourceError) -> ReadError {
    match error {
        SourceError::Cancelled => ReadError::Cancelled,
        SourceError::Io(error) => ReadError::IoFailure(IoFailure {
            message: error.to_string(),
        }),
        SourceError::Provider(error) => ReadError::IoFailure(IoFailure {
            message: error.to_string(),
        }),
    }
}

pub(crate) fn client_failure(error: Failure) -> ReadError {
    ReadError::IoFailure(IoFailure {
        message: error.to_string(),
    })
}
