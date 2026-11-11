//! Explicit projection policy, retained from the production component.
//! This whole file is handwritten adoption cost, including matching-field copies.

use crate::dto::*;
use binary_inspection as core;
use binary_inspection::input::{InputError, SourceError};
use object::Wrap;
use workbench_operations as client;

// usize-to-u64 projection is lossless on the qualified native64/Wasm32 targets.
// Reject a wider pointer target rather than narrowing its diagnostic counts.
const _: () = assert!(usize::BITS <= u64::BITS);

pub fn outcome(value: client::InspectionOutcome) -> InspectionOutcome {
    InspectionOutcome {
        steps: value
            .steps
            .into_iter()
            .map(|step| InspectionStepOutcome {
                kind: step.kind,
                step_result: step.result.map(report).map_err(inspection_failure),
            })
            .collect(),
    }
}
fn report(value: core::BinaryReport) -> Report {
    Report {
        container: value.container,
        container_endianness: endianness(value.container_endianness),
        byte_length: value.byte_length,
        images: value.images.into_iter().map(image).collect(),
        scope: value.scope,
    }
}
fn image(value: core::MachOImage) -> Image {
    Image {
        cpu: CpuIdentity {
            cpu_type: macho_value(value.cpu.cpu_type.into_inner(), value.cpu.cpu_type.name()),
            cpu_subtype: macho_value(value.cpu.cpu_subtype.into_inner(), value.cpu.subtype_name()),
        },
        header_format: value.header_format,
        endianness: endianness(value.endianness),
        file_range: file_range(value.file_range),
        file_type: macho_value(value.file_type.into_inner(), value.file_type.name()),
        header_flags: value.header_flags,
        platforms: value.platforms.into_iter().map(platform).collect(),
        signature_commands: value
            .signature_commands
            .into_iter()
            .map(|command| SignatureCommand {
                command_range: file_range(command.command_range),
                data_range: file_range(command.data_range),
            })
            .collect(),
    }
}
fn platform(value: core::PlatformDeclaration) -> PlatformDeclaration {
    PlatformDeclaration {
        platform: value
            .platform
            .map(|platform| macho_value(platform.into_inner(), platform.name())),
        minimum_os: value.minimum_os.to_string(),
        sdk: value.sdk.to_string(),
        source: CommandLocation {
            kind: macho_value(value.source.kind.into_inner(), value.source.kind.name()),
            file_range: file_range(value.source.file_range),
        },
    }
}
fn macho_value(value: u32, name: Option<&str>) -> MachoValue {
    MachoValue {
        value,
        name: name.map(str::to_owned),
    }
}
fn file_range(value: core::FileRange) -> FileRange {
    FileRange {
        offset: value.offset(),
        size: value.size(),
    }
}
fn endianness(value: core::Endianness) -> Endianness {
    match value {
        core::Endianness::Little => Endianness::Little,
        core::Endianness::Big => Endianness::Big,
    }
}
fn inspection_failure(value: client::InspectionFailure) -> InspectionFailure {
    let message = value.to_string();
    let details = match value {
        client::InspectionFailure::Selection(error) => {
            vec![InspectionError::Source(SourceFailure {
                operation: SourceOperation::Selection,
                offset: None,
                cause: client_failure(error),
            })]
        }
        client::InspectionFailure::Metadata(error) => {
            vec![InspectionError::Source(SourceFailure {
                operation: SourceOperation::ByteLength,
                offset: None,
                cause: client_failure(error),
            })]
        }
        client::InspectionFailure::Inspection(core::InspectionError::Analysis(error)) => {
            vec![InspectionError::Analysis(analysis_error(error))]
        }
        client::InspectionFailure::Inspection(core::InspectionError::Input(errors)) => {
            errors.into_errors().into_iter().map(input_error).collect()
        }
    };
    InspectionFailure { message, details }
}
fn client_failure(value: client::Failure) -> ReadError {
    ReadError::IoFailure(IoFailure {
        message: value.to_string(),
    })
}
fn input_error(value: InputError) -> InspectionError {
    match value {
        InputError::UnexpectedEof { offset, remaining } => {
            InspectionError::UnexpectedEof(IncompleteRead { offset, remaining })
        }
        InputError::InvalidReadCount { reported, capacity } => {
            InspectionError::InvalidReadCount(InvalidReadCount {
                reported: reported as u64,
                capacity: capacity as u64,
            })
        }
        InputError::Source { offset, error } => InspectionError::Source(SourceFailure {
            operation: SourceOperation::ReadAt,
            offset: Some(offset),
            cause: match error {
                SourceError::Cancelled => ReadError::Cancelled,
                SourceError::Io(error) => ReadError::IoFailure(IoFailure {
                    message: error.to_string(),
                }),
                SourceError::Provider(error) => ReadError::IoFailure(IoFailure {
                    message: error.to_string(),
                }),
            },
        }),
    }
}
fn analysis_error(value: core::AnalysisError) -> AnalysisError {
    let message = value.to_string();
    let kind = match value.kind {
        core::ErrorKind::Truncated {
            requested_size,
            available_size,
        } => ErrorKind::Truncated(TruncatedRange {
            requested_size,
            available_size,
        }),
        core::ErrorKind::RangeOverflow => ErrorKind::RangeOverflow,
        core::ErrorKind::UnsupportedImage => ErrorKind::UnsupportedImage,
        core::ErrorKind::Decode(message) => ErrorKind::Decode(message.to_string()),
    };
    AnalysisError { message, kind }
}
