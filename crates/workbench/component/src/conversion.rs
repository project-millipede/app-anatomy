//! Explicit, exhaustive conversion from core facts into the versioned WIT contract.

use crate::binary;
use binary_inspection as core;
use object::Wrap;

pub(crate) fn report(report: core::BinaryReport) -> binary::Report {
    binary::Report {
        container: report.container,
        container_endianness: endianness(report.container_endianness),
        byte_length: report.byte_length,
        images: report.images.into_iter().map(image).collect(),
        scope: report.scope,
    }
}

fn image(image: core::MachOImage) -> binary::Image {
    binary::Image {
        cpu: cpu_identity(image.cpu),
        header_format: image.header_format,
        endianness: endianness(image.endianness),
        file_range: file_range(image.file_range),
        file_type: macho_value(image.file_type.into_inner(), image.file_type.name()),
        header_flags: image.header_flags,
        platforms: image
            .platforms
            .into_iter()
            .map(platform_declaration)
            .collect(),
        signature_commands: image
            .signature_commands
            .into_iter()
            .map(signature_command)
            .collect(),
    }
}

fn endianness(endianness: core::Endianness) -> binary::Endianness {
    match endianness {
        core::Endianness::Little => binary::Endianness::Little,
        core::Endianness::Big => binary::Endianness::Big,
    }
}

fn file_range(range: core::FileRange) -> binary::FileRange {
    binary::FileRange {
        offset: range.offset(),
        size: range.size(),
    }
}

fn cpu_identity(cpu: core::CpuIdentity) -> binary::CpuIdentity {
    binary::CpuIdentity {
        cpu_type: macho_value(cpu.cpu_type.into_inner(), cpu.cpu_type.name()),
        cpu_subtype: macho_value(cpu.cpu_subtype.into_inner(), cpu.subtype_name()),
    }
}

fn macho_value(value: u32, name: Option<&str>) -> binary::MachoValue {
    binary::MachoValue {
        value,
        name: name.map(str::to_owned),
    }
}

fn platform_declaration(platform: core::PlatformDeclaration) -> binary::PlatformDeclaration {
    binary::PlatformDeclaration {
        platform: platform
            .platform
            .map(|value| macho_value(value.into_inner(), value.name())),
        minimum_os: platform.minimum_os.to_string(),
        sdk: platform.sdk.to_string(),
        source: binary::CommandLocation {
            kind: macho_value(
                platform.source.kind.into_inner(),
                platform.source.kind.name(),
            ),
            file_range: file_range(platform.source.file_range),
        },
    }
}

fn signature_command(command: core::SignatureCommand) -> binary::SignatureCommand {
    binary::SignatureCommand {
        command_range: file_range(command.command_range),
        data_range: file_range(command.data_range),
    }
}

pub(crate) fn analysis_error(error: core::AnalysisError) -> binary::AnalysisError {
    binary::AnalysisError {
        message: error.to_string(),
        kind: error_kind(error.kind),
    }
}

fn error_kind(kind: core::ErrorKind) -> binary::ErrorKind {
    match kind {
        core::ErrorKind::Truncated {
            requested_size,
            available_size,
        } => binary::ErrorKind::Truncated(binary::TruncatedRange {
            requested_size,
            available_size,
        }),
        core::ErrorKind::RangeOverflow => binary::ErrorKind::RangeOverflow,
        core::ErrorKind::UnsupportedImage => binary::ErrorKind::UnsupportedImage,
        core::ErrorKind::Decode(error) => binary::ErrorKind::Decode(error.to_string()),
    }
}
