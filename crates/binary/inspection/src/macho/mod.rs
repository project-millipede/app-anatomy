//! Public inspection entry points using object parsers and caller-owned input.

mod report;
mod source;

use crate::{
    AnalysisError, BinaryReport,
    input::{ByteSource, SourceCache},
};

use report::{inspect_bytes, inspect_cached};
pub use source::InspectionError;

/// Inspect thin or universal Mach-O bytes.
///
/// Reports own their facts. Format detection and decoding follow `object`'s
/// supported encodings and parser behavior; successful inspection is not complete
/// Mach-O, signature or execution validation.
///
/// # Errors
///
/// Returns upstream decoding errors or bounded-range failures. No partial report
/// is returned. Upstream failures retain their original cause.
pub fn inspect(bytes: &[u8]) -> Result<BinaryReport, AnalysisError> {
    inspect_bytes(bytes)
}

/// Inspect an offset-readable source.
///
/// The upstream parser requests headers and complete architecture/command tables.
/// Signature ranges are checked against their image without reading payloads.
/// `object` bounds parser reads through cache views.
///
/// 1. **Reading.**
///    The cache completes short successful reads until the requested range is full.
///
/// 2. **Cache behavior after acquisition failure.**
///    The current read fails. The cache remains available for later read requests
///    within the same inspection, including requests for the failed range.
///    It does not automatically retry a failed read.
///
/// 3. **Mach-O analysis after a required read fails.**
///    The current analysis stops and returns an error without a partial report.
///    In a universal binary, that failure also prevents inspection of the remaining
///    images. Cache availability does not make analysis continue.
///
/// 4. **Inspection completion.**
///    If acquisition failures were recorded, return all of them in occurrence order,
///    taking precedence over the analysis result. Only failures from reads actually
///    attempted are included. Otherwise, return the analysis report or analysis error.
///
/// 5. **Ownership on return.**
///    The cache and source borrow are released before returning.
///    The caller still owns the source; a successful report owns its data.
///
/// 6. **Later inspection.**
///    A later call creates a new cache with no failures retained from earlier calls.
///    It can read from the same source again; successful reads are not guaranteed.
///
/// The source determines consistency; inspection does not establish a snapshot.
pub fn inspect_source<Source: ByteSource>(
    source: &mut Source,
) -> Result<BinaryReport, InspectionError> {
    let cache = SourceCache::new(source);
    // 1. Keep the parser result without `?` until acquisition errors are checked.
    let parser_result = inspect_cached(cache.cache(), cache.byte_length());
    // 2. Return all acquisition failures, or the original parser result if none occurred.
    cache.finish(parser_result)
}
