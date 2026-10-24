//! Select report evidence from object-parsed headers and commands.

use object::{
    FileKind, Wrap, macho,
    read::{
        ReadCache, ReadCacheOps, ReadRef,
        macho::{FatArch, LoadCommandVariant, MachHeader, MachOFatFile},
    },
};

use crate::{
    AnalysisError, AnalysisScope, BinaryReport, CommandLocation, ContainerKind, CpuIdentity,
    Endianness, ErrorKind, FileRange, MachOHeaderFormat, MachOImage, PlatformDeclaration,
    SignatureCommand,
};

/// Inspect resident bytes by borrowing each architecture directly from the slice.
pub(super) fn inspect_bytes(bytes: &[u8]) -> Result<BinaryReport, AnalysisError> {
    let byte_length = bytes.len() as u64;
    let file_range =
        FileRange::new(0, byte_length).expect("a range starting at zero cannot overflow");
    let kind = FileKind::parse(bytes).map_err(decode_error)?;
    let (container, container_endianness, images) = match kind {
        FileKind::MachO32 | FileKind::MachO64 => {
            let image = inspect_image(bytes, kind, file_range)?;
            (ContainerKind::Thin, image.endianness, vec![image])
        }
        FileKind::MachOFat32 => (
            ContainerKind::Universal32,
            Endianness::Big,
            inspect_universal_bytes::<macho::FatArch32>(bytes, file_range)?,
        ),
        FileKind::MachOFat64 => (
            ContainerKind::Universal64,
            Endianness::Big,
            inspect_universal_bytes::<macho::FatArch64>(bytes, file_range)?,
        ),
        _ => return Err(AnalysisError::new(ErrorKind::UnsupportedImage)),
    };
    Ok(BinaryReport {
        container,
        container_endianness,
        byte_length,
        images,
        scope: AnalysisScope::HeadersOnly,
    })
}

/// Inspect requested source ranges while all architectures share one cache.
pub(super) fn inspect_cached<Reader: ReadCacheOps>(
    cache: &ReadCache<Reader>,
    byte_length: u64,
) -> Result<BinaryReport, AnalysisError> {
    let file_range =
        FileRange::new(0, byte_length).expect("a range starting at zero cannot overflow");
    let kind = FileKind::parse(cache).map_err(decode_error)?;
    let (container, container_endianness, images) = match kind {
        FileKind::MachO32 | FileKind::MachO64 => {
            let image = inspect_image(cache, kind, file_range)?;
            (ContainerKind::Thin, image.endianness, vec![image])
        }
        FileKind::MachOFat32 => (
            ContainerKind::Universal32,
            Endianness::Big,
            inspect_universal_cached::<macho::FatArch32, _>(cache, file_range)?,
        ),
        FileKind::MachOFat64 => (
            ContainerKind::Universal64,
            Endianness::Big,
            inspect_universal_cached::<macho::FatArch64, _>(cache, file_range)?,
        ),
        _ => return Err(AnalysisError::new(ErrorKind::UnsupportedImage)),
    };
    Ok(BinaryReport {
        container,
        container_endianness,
        byte_length,
        images,
        scope: AnalysisScope::HeadersOnly,
    })
}

fn inspect_universal_bytes<Arch: FatArch>(
    bytes: &[u8],
    file_range: FileRange,
) -> Result<Vec<MachOImage>, AnalysisError> {
    let file = MachOFatFile::<Arch>::parse(bytes).map_err(decode_error)?;
    let mut images = Vec::new();
    for arch in file.arches() {
        let (offset, size) = arch.file_range();
        let range = absolute_range(file_range, offset, size)?;
        // FatArch::data borrows this already-resident member without copying it.
        let member = arch.data(bytes).map_err(decode_error)?;
        let kind = FileKind::parse(member).map_err(decode_error)?;
        images.push(inspect_image(member, kind, range)?);
    }
    Ok(images)
}

fn inspect_universal_cached<Arch: FatArch, Reader: ReadCacheOps>(
    cache: &ReadCache<Reader>,
    file_range: FileRange,
) -> Result<Vec<MachOImage>, AnalysisError> {
    let file = MachOFatFile::<Arch>::parse(cache).map_err(decode_error)?;
    let mut images = Vec::new();
    for arch in file.arches() {
        let (offset, size) = arch.file_range();
        let range = absolute_range(file_range, offset, size)?;
        // Offset zero in this view is the member's first byte. The view shares
        // the existing cache; creating it acquires no bytes.
        let member = cache.range(offset, size);
        let kind = FileKind::parse(member).map_err(decode_error)?;
        images.push(inspect_image(member, kind, range)?);
    }
    Ok(images)
}

fn inspect_image<'data, Data: ReadRef<'data>>(
    input: Data,
    kind: FileKind,
    file_range: FileRange,
) -> Result<MachOImage, AnalysisError> {
    match kind {
        FileKind::MachO32 => {
            inspect_header::<macho::MachHeader32<Endianness>, _>(input, file_range)
        }
        FileKind::MachO64 => {
            inspect_header::<macho::MachHeader64<Endianness>, _>(input, file_range)
        }
        _ => Err(AnalysisError::new(ErrorKind::UnsupportedImage)),
    }
}

/// Parse with image-relative offsets and record absolute file ranges.
/// The returned image owns its values; no parser borrow escapes this call.
fn inspect_header<'data, Header: MachHeader<Endian = Endianness>, Data: ReadRef<'data>>(
    input: Data,
    file_range: FileRange,
) -> Result<MachOImage, AnalysisError> {
    let header = Header::parse(input, 0).map_err(decode_error)?;
    let endian = header.endian().map_err(decode_error)?;
    let commands = header
        .load_commands(endian, input, 0)
        .map_err(decode_error)?;
    let mut image = MachOImage {
        cpu: CpuIdentity {
            cpu_type: header.cputype(endian),
            cpu_subtype: header.cpusubtype(endian),
        },
        header_format: if header.is_type_64() {
            MachOHeaderFormat::MachO64
        } else {
            MachOHeaderFormat::MachO32
        },
        endianness: endian,
        file_range,
        file_type: header.filetype(endian),
        header_flags: header.flags(endian).into_inner(),
        platforms: Vec::new(),
        signature_commands: Vec::new(),
    };
    for command in commands {
        let command = command.map_err(decode_error)?;
        let command_range =
            absolute_range(file_range, command.offset(), u64::from(command.cmdsize()))?;
        let source = CommandLocation {
            kind: command.cmd(),
            file_range: command_range,
        };
        match command.variant().map_err(decode_error)? {
            LoadCommandVariant::BuildVersion(fields, tools) => {
                fields.tools(endian, tools).map_err(decode_error)?;
                image.platforms.push(PlatformDeclaration {
                    platform: Some(fields.platform.get(endian)),
                    minimum_os: fields.minos.get(endian),
                    sdk: fields.sdk.get(endian),
                    source,
                });
            }
            LoadCommandVariant::VersionMin(fields) => {
                image.platforms.push(PlatformDeclaration {
                    platform: None,
                    minimum_os: fields.version.get(endian),
                    sdk: fields.sdk.get(endian),
                    source,
                });
            }
            LoadCommandVariant::LinkeditData(fields)
                if command.cmd() == macho::LC_CODE_SIGNATURE =>
            {
                image.signature_commands.push(SignatureCommand {
                    command_range,
                    data_range: absolute_range(
                        file_range,
                        u64::from(fields.dataoff.get(endian)),
                        u64::from(fields.datasize.get(endian)),
                    )?,
                });
            }
            _ => {}
        }
    }
    Ok(image)
}

/// Convert relative coordinates to an absolute range within its containing input.
fn absolute_range(
    container: FileRange,
    offset: u64,
    size: u64,
) -> Result<FileRange, AnalysisError> {
    let absolute_offset = container
        .offset()
        .checked_add(offset)
        .ok_or_else(|| AnalysisError::new(ErrorKind::RangeOverflow))?;
    let range = FileRange::new(absolute_offset, size)
        .ok_or_else(|| AnalysisError::new(ErrorKind::RangeOverflow))?;
    if range.end() > container.end() {
        return Err(AnalysisError::new(ErrorKind::Truncated {
            requested_size: size,
            available_size: container.size().saturating_sub(offset),
        }));
    }
    Ok(range)
}

fn decode_error(error: object::Error) -> AnalysisError {
    AnalysisError::new(ErrorKind::Decode(error))
}
