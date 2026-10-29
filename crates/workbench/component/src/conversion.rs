//! Explicit, exhaustive conversion from core facts into the versioned WIT contract.

use crate::binary;
use binary_inspection as core;
use object::{
    Wrap,
    read::{ImportFlags, ImportLibraryFlags},
};

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
        dependencies: image
            .dependencies
            .map(|value| dependency_evidence(value, image.header_flags)),
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

fn byte_string(bytes: Vec<u8>) -> binary::ByteString {
    let display = core::display_bytes(&bytes);
    binary::ByteString { bytes, display }
}

fn dependency_evidence(
    value: core::DependencyEvidence,
    header_flags: u32,
) -> binary::DependencyEvidence {
    let groups = value.group_imports(header_flags);
    binary::DependencyEvidence {
        libraries: value
            .libraries
            .into_iter()
            .zip(groups.libraries)
            .map(|(library, indices)| declared_library(library, indices))
            .collect(),
        imports: value
            .imports
            .into_iter()
            .map(|value| imported_symbol(value, header_flags))
            .collect(),
        unassociated_import_indices: import_indices(groups.unassociated),
        runpaths: value.runpaths.into_iter().map(byte_string).collect(),
        install_names: value.install_names.into_iter().map(byte_string).collect(),
    }
}

fn import_indices(indices: Vec<usize>) -> Vec<u32> {
    indices
        .into_iter()
        .map(|index| {
            u32::try_from(index).expect("component import indices fit the WIT list index width")
        })
        .collect()
}

fn declared_library(value: core::DeclaredLibrary, indices: Vec<usize>) -> binary::DeclaredLibrary {
    let ImportLibraryFlags::MachO {
        ordinal,
        cmd,
        current_version,
        compatibility_version,
        use_flags,
    } = value.flags
    else {
        unreachable!("Mach-O dependency inspection supplies Mach-O library flags");
    };
    binary::DeclaredLibrary {
        name: byte_string(value.name),
        import_indices: import_indices(indices),
        ordinal,
        command: macho_value(cmd.into_inner(), cmd.name()),
        current_version: current_version.to_string(),
        compatibility_version: compatibility_version.to_string(),
        use_flags: use_flags.map(|flags| binary::MachoValue {
            value: flags.into_inner(),
            name: Some(format!("{flags:?}")),
        }),
    }
}

fn imported_symbol(value: core::ImportedSymbol, header_flags: u32) -> binary::ImportedSymbol {
    let association = value.association_label(header_flags);
    let flags = match value.flags {
        ImportFlags::None => binary::ImportFlags::None,
        ImportFlags::MachO { n_type, n_desc } => {
            binary::ImportFlags::MachO(binary::SymbolImportFlags {
                n_type: n_type.into_inner(),
                n_desc: n_desc.into_inner(),
            })
        }
        ImportFlags::MachOBind { dylib, flags } => {
            binary::ImportFlags::MachOBind(binary::BindImportFlags {
                dylib: dylib.into_inner(),
                flags: flags.into_inner(),
            })
        }
        flags => binary::ImportFlags::Other(format!("{flags:?}")),
    };
    binary::ImportedSymbol {
        name: byte_string(value.name),
        library: byte_string(value.library),
        weak: value.weak,
        association,
        flags,
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

#[cfg(test)]
mod tests {
    use super::*;
    use object::macho;

    #[test]
    fn dependency_projection_keeps_non_utf8_names_and_special_signed_associations() {
        let projected = dependency_evidence(
            core::DependencyEvidence {
                libraries: Vec::new(),
                imports: vec![core::ImportedSymbol {
                    name: vec![b'_', 0xff],
                    library: Vec::new(),
                    weak: true,
                    flags: ImportFlags::MachOBind {
                        dylib: macho::BIND_SPECIAL_DYLIB_FLAT_LOOKUP,
                        flags: macho::BIND_SYMBOL_FLAGS_WEAK_IMPORT,
                    },
                }],
                runpaths: Vec::new(),
                install_names: Vec::new(),
            },
            0,
        );
        assert_eq!(projected.unassociated_import_indices, [0]);
        let import = &projected.imports[0];
        assert_eq!(import.name.bytes, [b'_', 0xff]);
        assert_eq!(import.name.display, "_\\xff");
        assert_eq!(import.association, "BIND_SPECIAL_DYLIB_FLAT_LOOKUP");
        assert!(import.weak);
        let binary::ImportFlags::MachOBind(flags) = &import.flags else {
            panic!("special bind association was narrowed to a library name");
        };
        assert_eq!(flags.dylib, -2);
        assert_eq!(flags.flags, 1);
    }
}
