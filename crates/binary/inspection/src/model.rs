//! Owned analysis facts, independent of presentation and transport.

use object::{
    Endianness,
    macho::{self, Version},
};

/// Outer file layout; universal entry width is independent of image header width.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ContainerKind {
    /// One Mach-O image at offset zero.
    Thin,
    /// Universal entries with 32-bit offsets and sizes.
    Universal32,
    /// Universal entries with 64-bit offsets and sizes.
    Universal64,
}

/// Mach-O header layout, not CPU instruction or ABI pointer width.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MachOHeaderFormat {
    /// The 28-byte mach_header layout.
    MachO32,
    /// The 32-byte mach_header_64 layout.
    MachO64,
}

/// Analysis performed; deeper verification is never implied by a report.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AnalysisScope {
    /// Headers, command envelopes, platform declarations and signature locations.
    HeadersOnly,
}

/// A non-overflowing absolute byte range with an exclusive end.
///
/// Construction checks arithmetic, not membership in an input. Inspection also
/// checks returned ranges against the containing image.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct FileRange {
    offset: u64,
    size: u64,
}

impl FileRange {
    /// Construct a range, returning None if offset + size overflows.
    ///
    /// ```
    /// use binary_inspection::FileRange;
    /// assert_eq!(FileRange::new(64, 56).map(FileRange::end), Some(120));
    /// assert!(FileRange::new(u64::MAX, 1).is_none());
    /// ```
    pub fn new(offset: u64, size: u64) -> Option<Self> {
        offset.checked_add(size)?;
        Some(Self { offset, size })
    }

    /// Absolute start offset in bytes.
    pub const fn offset(self) -> u64 {
        self.offset
    }

    /// Length in bytes.
    pub const fn size(self) -> u64 {
        self.size
    }

    /// Absolute exclusive end; construction guarantees no arithmetic overflow.
    pub const fn end(self) -> u64 {
        self.offset + self.size
    }
}

/// CPU identity exactly as declared by the image header, including subtype flags.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct CpuIdentity {
    /// Raw cputype bit pattern.
    pub cpu_type: macho::CpuType,
    /// Raw cpusubtype bit pattern, including capability bits.
    pub cpu_subtype: macho::CpuSubtype,
}

impl CpuIdentity {
    /// Canonical subtype identity name for this CPU family, when recognized by object.
    ///
    /// Capability bits are excluded from name lookup and remain in `cpu_subtype`.
    pub fn subtype_name(self) -> Option<&'static str> {
        let subtype_id = self.cpu_subtype.id();
        macho::machine_names(self.cpu_type)
            .cpusubtype
            .name(subtype_id.into())
            .map(|(_, name)| name)
    }
}

/// Source evidence for a platform declaration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CommandLocation {
    /// Command interpreted by the parser.
    pub kind: macho::LoadCommandType,
    /// Absolute range of the complete command, including any tool records.
    pub file_range: FileRange,
}

/// One declaration. Conflicting platform declarations remain separate evidence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlatformDeclaration {
    /// Platform identifier from LC_BUILD_VERSION, including unrecognized values.
    ///
    /// Legacy version commands have no platform field; their OS-family evidence
    /// remains in `source.kind`, without resolving device/simulator ambiguity.
    pub platform: Option<macho::Platform>,
    /// Declared minimum operating-system version.
    pub minimum_os: Version,
    /// Declared SDK version.
    pub sdk: Version,
    /// Command and absolute range supplying these values.
    pub source: CommandLocation,
}

/// Location metadata only; neither the blob nor its signature has been verified.
///
/// Duplicate commands are preserved and do not imply acceptance by Apple's tools.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SignatureCommand {
    /// Absolute range of the LC_CODE_SIGNATURE command.
    pub command_range: FileRange,
    /// Absolute signature-data range, checked within the containing image.
    pub data_range: FileRange,
}

/// One physical Mach-O image within the supplied bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MachOImage {
    /// CPU type and complete subtype bit pattern from the image header.
    pub cpu: CpuIdentity,
    /// Image header layout.
    pub header_format: MachOHeaderFormat,
    /// Image byte order, independent of the outer universal header.
    pub endianness: Endianness,
    /// Absolute range of this image.
    pub file_range: FileRange,
    /// Declared file role; the value does not establish execution eligibility.
    pub file_type: macho::FileType,
    /// Raw header flags, retained without runtime-policy interpretation.
    pub header_flags: u32,
    /// Platform declarations in command order.
    pub platforms: Vec<PlatformDeclaration>,
    /// Signature locations in command order; an empty list means absent.
    pub signature_commands: Vec<SignatureCommand>,
}

/// Owned facts from one successful inspection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BinaryReport {
    /// Outer file layout.
    pub container: ContainerKind,
    /// Outer header byte order.
    pub container_endianness: Endianness,
    /// Total supplied input length in bytes.
    pub byte_length: u64,
    /// Images in universal-table order, or one image for thin input.
    pub images: Vec<MachOImage>,
    /// Explicit boundary of performed analysis.
    pub scope: AnalysisScope,
}
