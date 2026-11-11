//! Explicit report projection policy, retained from the production component.
//! Matching-field copies are handwritten adoption cost.

use crate::dto::*;
use binary_inspection as core;
use object::Wrap;

fn report(value: core::BinaryReport) -> Report {
    Report {
        container: match value.container {
            core::ContainerKind::Thin => ContainerKind::Thin,
            core::ContainerKind::Universal32 => ContainerKind::Universal32,
            core::ContainerKind::Universal64 => ContainerKind::Universal64,
        },
        container_endianness: endianness(value.container_endianness),
        byte_length: value.byte_length,
        images: value.images.into_iter().map(image).collect(),
        scope: match value.scope {
            core::AnalysisScope::HeadersOnly => AnalysisScope::HeadersOnly,
        },
    }
}
fn image(value: core::MachOImage) -> Image {
    Image {
        cpu: CpuIdentity {
            cpu_type: macho_value(value.cpu.cpu_type.into_inner(), value.cpu.cpu_type.name()),
            cpu_subtype: macho_value(value.cpu.cpu_subtype.into_inner(), value.cpu.subtype_name()),
        },
        header_format: match value.header_format {
            core::MachOHeaderFormat::MachO32 => HeaderFormat::MachO32,
            core::MachOHeaderFormat::MachO64 => HeaderFormat::MachO64,
        },
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
