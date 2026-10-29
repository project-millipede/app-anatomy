//! Own dependency evidence while delegating binary interpretation to `object`.

use object::{
    Object, macho,
    read::{
        ImportFlags, NameOrOrdinal, ReadRef,
        macho::{LoadCommandVariant, MachHeader, MachOFile},
    },
};

use super::report::{inspect_bytes, inspect_cached};
use crate::{
    AnalysisError, AnalysisScope, BinaryReport, DeclaredLibrary, DependencyEvidence, Endianness,
    ErrorKind, ImportedSymbol, InspectionError, MachOHeaderFormat,
    input::{ByteSource, SourceCache},
};

/// Inspect thin or universal Mach-O dependency declarations and imported symbols.
///
/// Includes the existing header report and reuses `Object::import_libraries` and
/// `Object::imports` for ordinals, import-source selection and associations with
/// recorded library names. Raw names, flags, special lookup ordinals and duplicate
/// ID/runpath declarations remain evidence. An empty recorded library name does
/// not establish a missing provider: it can represent special or flat lookup.
///
/// Unlike [`crate::inspect`], this operation can read section, symbol, bind and
/// chained-import tables. Resident members are borrowed without copying complete
/// images. It does not open dependent files, expand runpaths, evaluate candidate
/// policy, follow reexports or perform runtime symbol lookup/binding.
///
/// # Errors
///
/// Returns existing header/member diagnostics or original upstream parsing errors.
/// No partial report is returned; success is not complete file validation.
pub fn inspect_dependencies(bytes: &[u8]) -> Result<BinaryReport, AnalysisError> {
    let mut report = inspect_bytes(bytes)?;
    for image in &mut report.images {
        // Header traversal has already validated every member against this slice.
        let range = image.file_range;
        let member = &bytes[range.offset() as usize..range.end() as usize];
        image.dependencies = Some(inspect_image(member, image.header_format)?);
    }
    report.scope = AnalysisScope::Dependencies;
    Ok(report)
}

/// Inspect dependency evidence through a caller-owned bounded byte source.
///
/// Header validation and deeper reads share one cache. Each image uses a bounded
/// cache view, including symbol and bind-table reads. Original acquisition failures
/// take precedence over upstream results, even where a reader tolerates an
/// unavailable optional table. Providers own consistency; this is not a snapshot.
///
/// # Errors
///
/// Preserves the first original input failure, or returns an analysis diagnostic.
pub fn inspect_dependencies_source<Source: ByteSource>(
    source: &mut Source,
) -> Result<BinaryReport, InspectionError> {
    let cache = SourceCache::new(source);
    let report = (|| {
        let mut report = inspect_cached(cache.cache(), cache.byte_length())?;
        for image in &mut report.images {
            let range = image.file_range;
            image.dependencies = Some(inspect_image(
                cache.cache().range(range.offset(), range.size()),
                image.header_format,
            )?);
        }
        report.scope = AnalysisScope::Dependencies;
        Ok(report)
    })();
    if let Some(error) = cache.into_error() {
        return Err(error.into());
    }
    report.map_err(InspectionError::Analysis)
}

fn inspect_image<'data, Data: ReadRef<'data>>(
    data: Data,
    format: MachOHeaderFormat,
) -> Result<DependencyEvidence, AnalysisError> {
    match format {
        MachOHeaderFormat::MachO32 => collect::<macho::MachHeader32<Endianness>, _>(data),
        MachOHeaderFormat::MachO64 => collect::<macho::MachHeader64<Endianness>, _>(data),
    }
}

fn collect<'data, Header: MachHeader<Endian = Endianness>, Data: ReadRef<'data>>(
    data: Data,
) -> Result<DependencyEvidence, AnalysisError> {
    let file = MachOFile::<Header, _>::parse(data).map_err(decode_error)?;
    let libraries = file
        .import_libraries()
        .map_err(decode_error)?
        .map(|library| {
            library.map(|library| DeclaredLibrary {
                name: library.name().to_vec(),
                flags: library.flags(),
            })
        })
        .collect::<object::read::Result<Vec<_>>>()
        .map_err(decode_error)?;
    let imports = file
        .imports()
        .map_err(decode_error)?
        .map(|import| {
            let import = import.map_err(decode_error)?;
            // The concrete pinned Mach-O reader always emits named imports.
            let NameOrOrdinal::Name(name) = import.name() else {
                unreachable!("the pinned Mach-O reader emits named imports");
            };
            Ok(ImportedSymbol {
                name: name.to_vec(),
                library: import.library().to_vec(),
                weak: import.is_weak(),
                flags: owned_macho_flags(import.flags()),
            })
        })
        .collect::<Result<Vec<_>, AnalysisError>>()?;
    let mut runpaths = Vec::new();
    let mut install_names = Vec::new();
    let endian = file.endian();
    for command in file.macho_load_commands().map_err(decode_error)? {
        let command = command.map_err(decode_error)?;
        match command.variant().map_err(decode_error)? {
            LoadCommandVariant::Rpath(fields) => runpaths.push(
                command
                    .string(endian, fields.path)
                    .map_err(decode_error)?
                    .to_vec(),
            ),
            LoadCommandVariant::IdDylib(fields) => install_names.push(
                command
                    .string(endian, fields.dylib.name)
                    .map_err(decode_error)?
                    .to_vec(),
            ),
            _ => {}
        }
    }
    Ok(DependencyEvidence {
        libraries,
        imports,
        runpaths,
        install_names,
    })
}

fn owned_macho_flags(flags: ImportFlags<'_>) -> ImportFlags<'static> {
    // Both variants emitted by the pinned Mach-O reader contain scalar values.
    // No provider/ordinal interpretation is performed at this ownership boundary.
    match flags {
        ImportFlags::MachO { n_type, n_desc } => ImportFlags::MachO { n_type, n_desc },
        ImportFlags::MachOBind { dylib, flags } => ImportFlags::MachOBind { dylib, flags },
        _ => unreachable!("the pinned Mach-O reader emits Mach-O import flags"),
    }
}

fn decode_error(error: object::Error) -> AnalysisError {
    AnalysisError::new(ErrorKind::Decode(error))
}
