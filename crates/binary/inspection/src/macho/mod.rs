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
/// `object` bounds parser reads through cache views. Cache borrows remain local
/// to this call; the returned report owns its data.
///
/// Acquisition failures retain their original causes. Providers own consistency:
/// inspection does not establish a snapshot. Short successful reads are completed;
/// failed source reads are not retried. A retained acquisition failure takes
/// precedence over the parser result.
pub fn inspect_source<Source: ByteSource>(
    source: &mut Source,
) -> Result<BinaryReport, InspectionError> {
    let cache = SourceCache::new(source);
    // 1. Keep the parser result without `?` until acquisition errors are checked.
    let report = inspect_cached(cache.cache(), cache.byte_length());
    // 2. Consume the cache and recover the cursor's first acquisition failure.
    // This takes precedence even if object produced a report.
    if let Some(error) = cache.into_error() {
        return Err(error.into());
    }
    // 3. Otherwise, return the owned report or upstream parsing error.
    report.map_err(InspectionError::Analysis)
}
