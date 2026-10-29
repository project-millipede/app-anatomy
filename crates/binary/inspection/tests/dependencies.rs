//! Qualify upstream association ownership, explicit read scope and image bounds.

mod support;

use std::io;

use binary_inspection::{
    AnalysisScope, ErrorKind, InspectionError,
    input::{ByteSource, InputError, SourceError},
    inspect, inspect_dependencies, inspect_dependencies_source, inspect_source,
};
use object::{macho, read::ImportFlags};
use support::*;

fn string_command(kind: u32, fixed: usize, name: &[u8]) -> Vec<u8> {
    let size = (fixed + name.len() + 8) & !7;
    let mut bytes = command(ByteOrder::Little, kind, size);
    ByteOrder::Little.write_u32(&mut bytes, 8, fixed as u32);
    bytes[fixed..fixed + name.len()].copy_from_slice(name);
    bytes
}

fn image_with_imports(twolevel: bool) -> Vec<u8> {
    let strings = b"\0_regular\xff\0_special\0";
    let mut commands = vec![
        string_command(0x0c, 24, b"@rpath/lib\xff.dylib"),
        string_command(0x0d, 24, b"@rpath/First.dylib"),
        string_command(0x8000_001c, 12, b"@loader_path/Frameworks"),
        string_command(0x0d, 24, b"@rpath/Second.dylib"),
        string_command(0x8000_001c, 12, b"/raw/\xff"),
    ];
    let symbols_offset = 32 + commands.iter().map(Vec::len).sum::<usize>() + 24;
    let mut symtab = command(ByteOrder::Little, 0x02, 24);
    for (offset, value) in [
        (8, symbols_offset),
        (12, 2),
        (16, symbols_offset + 32),
        (20, strings.len()),
    ] {
        ByteOrder::Little.write_u32(&mut symtab, offset, value as u32);
    }
    commands.push(symtab);
    let mut bytes = MachOFixture {
        commands,
        flags: if twolevel { 0x80 } else { 0 },
        ..Default::default()
    }
    .encode();
    for (name_offset, description) in [(1u32, 0x0100u16), (11u32, 0xff40u16)] {
        let mut nlist = [0u8; 16];
        nlist[..4].copy_from_slice(&name_offset.to_le_bytes());
        nlist[4] = 1; // Undefined external symbol.
        nlist[6..8].copy_from_slice(&description.to_le_bytes());
        bytes.extend_from_slice(&nlist);
    }
    bytes.extend_from_slice(strings);
    bytes
}

#[test]
fn upstream_association_survives_ownership_and_preserves_special_and_flat_context() {
    let bytes = image_with_imports(true);
    let header = inspect(&bytes).unwrap();
    assert_eq!(header.scope, AnalysisScope::HeadersOnly);
    assert!(header.images[0].dependencies.is_none());
    let mut source = bytes.as_slice();
    let report = inspect_dependencies_source(&mut source).unwrap();
    assert_eq!(report, inspect_dependencies(&bytes).unwrap());
    assert_eq!(report.scope, AnalysisScope::Dependencies);
    let image = report.images.into_iter().next().unwrap();
    let dependencies = image.dependencies.unwrap();
    assert_eq!(dependencies.imports[0].name, b"_regular\xff");
    assert_eq!(dependencies.imports[0].library, b"@rpath/lib\xff.dylib");
    assert_eq!(
        dependencies.imports[0].association_label(image.header_flags),
        "@rpath/lib\\xff.dylib"
    );
    assert!(dependencies.imports[1].library.is_empty());
    assert!(dependencies.imports[1].weak);
    assert_eq!(
        dependencies.imports[1].association_label(image.header_flags),
        "EXECUTABLE_ORDINAL"
    );
    assert!(
        matches!(dependencies.imports[1].flags, ImportFlags::MachO { n_desc, .. } if n_desc.library() == macho::EXECUTABLE_ORDINAL)
    );
    assert_eq!(
        dependencies.install_names,
        [
            b"@rpath/First.dylib".to_vec(),
            b"@rpath/Second.dylib".to_vec()
        ]
    );
    assert_eq!(dependencies.runpaths[1], b"/raw/\xff");

    let flat = inspect_dependencies(&image_with_imports(false)).unwrap();
    let flat_image = &flat.images[0];
    let flat_import = &flat_image.dependencies.as_ref().unwrap().imports[0];
    assert!(flat_import.library.is_empty());
    assert_eq!(
        flat_import.association_label(flat_image.header_flags),
        "Flat namespace lookup (provider unspecified)"
    );
}

fn image_with_symbols(symbol_offset: u32) -> Vec<u8> {
    let mut symbols = command(ByteOrder::Little, 0x02, 24);
    for (offset, value) in [
        (8, symbol_offset),
        (12, 1),
        (16, symbol_offset + 16),
        (20, 1),
    ] {
        ByteOrder::Little.write_u32(&mut symbols, offset, value);
    }
    MachOFixture {
        commands: vec![symbols],
        ..Default::default()
    }
    .encode()
}

#[test]
fn deeper_dependency_reads_cannot_borrow_symbol_bytes_from_another_member() {
    let first = image_with_symbols(56);
    let second = MachOFixture::default().encode();
    let (bytes, _) = universal(
        UniversalFormat::Fat32,
        ByteOrder::Big,
        &[
            UniversalMember {
                cpu_type: CPU_ARM64,
                cpu_subtype: 0,
                image: &first,
            },
            UniversalMember {
                cpu_type: CPU_ARM64,
                cpu_subtype: 0,
                image: &second,
            },
        ],
    );
    inspect(&bytes).unwrap();
    assert!(matches!(
        inspect_dependencies(&bytes).unwrap_err().kind,
        ErrorKind::Decode(_)
    ));
    let mut source = bytes.as_slice();
    assert!(matches!(
        inspect_dependencies_source(&mut source),
        Err(InspectionError::Analysis(_))
    ));
}

#[test]
fn additional_metadata_reads_preserve_the_original_provider_failure() {
    struct UnavailableSymbols {
        bytes: Vec<u8>,
    }
    impl ByteSource for UnavailableSymbols {
        fn byte_length(&self) -> u64 {
            self.bytes.len() as u64
        }
        fn read_at(&mut self, offset: u64, destination: &mut [u8]) -> Result<usize, SourceError> {
            if offset >= 1024 {
                return Err(io::Error::from(io::ErrorKind::PermissionDenied).into());
            }
            self.bytes.as_slice().read_at(offset, destination)
        }
    }
    let mut bytes = image_with_symbols(1024);
    bytes.resize(1041, 0);
    let mut source = UnavailableSymbols { bytes };
    inspect_source(&mut source).unwrap();
    let error = inspect_dependencies_source(&mut source).unwrap_err();
    let InspectionError::Input(InputError::Source {
        offset,
        error: SourceError::Io(cause),
    }) = error
    else {
        panic!("original acquisition failure was lost: {error}");
    };
    assert_eq!(offset, 1024);
    assert_eq!(cause.kind(), io::ErrorKind::PermissionDenied);
}
