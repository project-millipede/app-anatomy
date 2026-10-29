//! Owned analysis facts, independent of presentation and transport.

use object::{
    Endianness, Wrap,
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
    /// Header facts, declared libraries and upstream-associated imported symbols.
    Dependencies,
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

/// A declared library, as enumerated by the upstream Mach-O reader.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeclaredLibrary {
    /// Original install-name bytes, without path expansion or UTF-8 conversion.
    pub name: Vec<u8>,
    /// Upstream ordinal, command, versions and optional dylib-use flags.
    pub flags: object::read::ImportLibraryFlags,
}

/// An imported symbol and the recorded library association supplied by `object`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportedSymbol {
    /// Original symbol-name bytes.
    pub name: Vec<u8>,
    /// Recorded library-name bytes. Empty means special, flat or unspecified lookup;
    /// the upstream flags preserve the available ordinal/context distinction.
    pub library: Vec<u8>,
    /// Whether the upstream reader identifies a weak import.
    pub weak: bool,
    /// Owned upstream Mach-O symbol-table or dyld-bind flags.
    ///
    /// These Mach-O variants contain no borrowed values. Their reconstruction at
    /// the ownership boundary preserves raw flags and special library ordinals.
    pub flags: object::read::ImportFlags<'static>,
}

impl ImportedSymbol {
    /// Describe the recorded provider association without selecting a provider file.
    ///
    /// Symbol-table ordinals are interpreted only when the image declares
    /// `MH_TWOLEVEL`; flat namespace imports retain unspecified-provider wording.
    /// Special ordinal names come from the pinned upstream types.
    pub fn association_label(&self, header_flags: u32) -> String {
        if !self.library.is_empty() {
            return display_bytes(&self.library);
        }
        match self.flags {
            object::read::ImportFlags::MachO { n_desc, .. } => {
                if !macho::FileFlags::from_inner(header_flags).contains(macho::MH_TWOLEVEL) {
                    return "Flat namespace lookup (provider unspecified)".into();
                }
                let ordinal = n_desc.library();
                ordinal.name().map(str::to_owned).unwrap_or_else(|| {
                    format!(
                        "Library ordinal {} (recorded name empty)",
                        ordinal.into_inner()
                    )
                })
            }
            object::read::ImportFlags::MachOBind { dylib, .. } => {
                dylib.name().map(str::to_owned).unwrap_or_else(|| {
                    format!(
                        "Library ordinal {} (recorded name empty)",
                        dylib.into_inner()
                    )
                })
            }
            _ => "Unspecified library association".into(),
        }
    }
}

/// Format binary name bytes as lossless ASCII escapes for a display boundary.
///
/// Raw byte fields remain authoritative. Non-ASCII and control bytes are escaped
/// rather than replaced or interpreted as filesystem paths.
pub fn display_bytes(bytes: &[u8]) -> String {
    bytes.escape_ascii().to_string()
}

/// Upstream-derived dependency evidence, without selecting acquired provider files.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DependencyEvidence {
    /// Declared libraries in upstream command/ordinal order.
    pub libraries: Vec<DeclaredLibrary>,
    /// Imported symbols and their recorded library names, associated by `object`.
    pub imports: Vec<ImportedSymbol>,
    /// Original `LC_RPATH` strings in command order, without inherited-context inference.
    pub runpaths: Vec<Vec<u8>>,
    /// Every `LC_ID_DYLIB` string, retaining duplicates without choosing an identity.
    pub install_names: Vec<Vec<u8>>,
}

/// Imported-symbol indices grouped by recorded declaration identity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportGroups {
    /// One index list per `DependencyEvidence::libraries` entry, in the same order.
    /// Each index addresses the original `DependencyEvidence::imports` list.
    pub libraries: Vec<Vec<usize>>,
    /// Imports with special, flat, unspecified or absent declaration associations.
    pub unassociated: Vec<usize>,
}

impl DependencyEvidence {
    /// Group imports by their upstream ordinary library ordinal, never by names.
    ///
    /// Symbol-table ordinals require `MH_TWOLEVEL`; dyld-bind ordinals carry their
    /// own context. Special/unspecified lookups and ordinals without a matching
    /// declaration remain unassociated. Duplicate library names stay distinct.
    /// This groups recorded evidence and does not select provider files.
    pub fn group_imports(&self, header_flags: u32) -> ImportGroups {
        let twolevel = macho::FileFlags::from_inner(header_flags).contains(macho::MH_TWOLEVEL);
        let mut groups = ImportGroups {
            libraries: vec![Vec::new(); self.libraries.len()],
            unassociated: Vec::new(),
        };
        for (index, import) in self.imports.iter().enumerate() {
            let ordinal = match import.flags {
                object::read::ImportFlags::MachO { n_desc, .. } if twolevel => {
                    n_desc.library().index().map(u32::from)
                }
                object::read::ImportFlags::MachOBind { dylib, .. } => dylib.index(),
                _ => None,
            };
            let library = ordinal.and_then(|ordinal| self.libraries.iter().position(|library| {
                matches!(library.flags, object::read::ImportLibraryFlags::MachO { ordinal: declared, .. } if declared == ordinal)
            }));
            if let Some(library) = library {
                groups.libraries[library].push(index);
            } else {
                groups.unassociated.push(index);
            }
        }
        groups
    }
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
    /// Additional dependency evidence; absent when only header inspection was requested.
    pub dependencies: Option<DependencyEvidence>,
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
