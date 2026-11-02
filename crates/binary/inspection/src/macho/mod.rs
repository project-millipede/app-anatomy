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
/// 1. **Reading.** The cache completes short successful reads.
/// 2. **Acquisition failure.** A failed read does not prevent later parser reads.
///    The first acquisition error is preserved and takes precedence over the
///    parser result, even if later reads succeed.
/// 3. **Return.** The cache and source borrow are released before returning.
///    The caller still owns the source; a successful report owns its data.
/// 4. **Reuse.** A later call creates a new cache and can read from the source again.
///    Successful reads are not guaranteed.
///
/// The source determines consistency; inspection does not establish a snapshot.
pub fn inspect_source<Source: ByteSource>(
    source: &mut Source,
) -> Result<BinaryReport, InspectionError> {
    let cache = SourceCache::new(source);
    // 1. Keep the parser result without `?` until acquisition errors are checked.
    let report = inspect_cached(cache.cache(), cache.byte_length());
    // 2. Consume the cache and recover the cursor's first acquisition failure.
    // This takes precedence even if object produced a report.
    let retained_input_error = cache.into_error();
    if let Some(error) = retained_input_error {
        return Err(error.into());
    }
    // 3. Otherwise, return the owned report or upstream parsing error.
    report.map_err(InspectionError::Analysis)
}
