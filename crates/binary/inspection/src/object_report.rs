//! Owned file identity from object's unified parser and shared input access.

use object::{
    Architecture, BinaryFormat, Endianness, File, Object, ObjectKind, SubArchitecture,
    read::ReadRef,
};

use crate::{
    AnalysisError, ErrorKind, InspectionError,
    input::{ByteSource, SourceCache},
};

/// Common file identity supplied by `object`, without format-specific payloads.
///
/// This report owns its values. It does not contain sections, symbols or a
/// validation verdict, even though upstream parsing may read their tables.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObjectReport {
    /// Detected binary format.
    pub format: BinaryFormat,
    /// Target CPU architecture as classified by `object`.
    pub architecture: Architecture,
    /// Upstream sub-architecture, when recognized and specified.
    pub sub_architecture: Option<SubArchitecture>,
    /// Upstream file classification; this does not establish execution eligibility.
    pub kind: ObjectKind,
    /// Byte order of the parsed file.
    pub endianness: Endianness,
    /// Whether `object` classifies this file as 64-bit.
    pub is_64: bool,
}

/// Inspect an ELF, PE, COFF or thin Mach-O file already available in memory.
///
/// Uses `object::File::parse()` and borrows the supplied bytes during parsing.
/// Universal Mach-O containers use [`crate::inspect`] instead. Archives and
/// formats without an enabled upstream reader are not accepted by this API.
///
/// # Errors
///
/// Returns the upstream parsing error through [`ErrorKind::Decode`]. Parsing
/// scope and validation follow `object`; success is not complete file validation.
pub fn inspect_object(bytes: &[u8]) -> Result<ObjectReport, AnalysisError> {
    inspect_data(bytes)
}

/// Inspect an ELF, PE, COFF or thin Mach-O file through a caller-owned source.
///
/// Shares the byte adapter and `object::ReadCache` used by Mach-O inspection.
/// Upstream parsing determines which ranges are read, including section and
/// symbol tables where required. The cache is released before returning.
///
/// # Errors
///
/// Preserves the first acquisition failure, including failures in optional
/// upstream reads. Otherwise returns the upstream parsing error. No source
/// error is retried, and inspection does not establish a filesystem snapshot.
pub fn inspect_object_source<Source: ByteSource>(
    source: &mut Source,
) -> Result<ObjectReport, InspectionError> {
    let cache = SourceCache::new(source);
    // 1. Keep the parser result without `?` until acquisition errors are checked.
    let report = inspect_data(cache.cache());
    // 2. Consume the cache and recover the cursor's first acquisition failure.
    // This takes precedence even if object produced a report.
    if let Some(error) = cache.into_error() {
        return Err(error.into());
    }
    // 3. Otherwise, return the owned report or upstream parsing error.
    report.map_err(InspectionError::Analysis)
}

fn inspect_data<'data, Data: ReadRef<'data>>(data: Data) -> Result<ObjectReport, AnalysisError> {
    let file = File::parse(data).map_err(|error| AnalysisError::new(ErrorKind::Decode(error)))?;
    Ok(ObjectReport {
        format: file.format(),
        architecture: file.architecture(),
        sub_architecture: file.sub_architecture(),
        kind: file.kind(),
        endianness: file.endianness(),
        is_64: file.is_64(),
    })
}
