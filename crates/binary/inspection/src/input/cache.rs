//! Cached source bytes for upstream parsers, with acquisition errors kept intact.

#[cfg(test)]
mod tests;

use object::read::{ReadCache, ReadCacheOps};

use crate::{AnalysisError, InspectionError};

use super::{ByteSource, InputError, InputErrors};

/// Adapt offset-based source reads to the cursor interface required by `object`.
pub(crate) struct SourceCursor<'source, Source> {
    source: &'source mut Source,
    byte_length: u64,
    /// Acquisition failures in occurrence order; `ReadCacheOps` returns only `()`.
    retained_input_errors: Vec<InputError>,
    position: u64,
}

impl<Source: ByteSource> ReadCacheOps for SourceCursor<'_, Source> {
    fn len(&mut self) -> Result<u64, ()> {
        Ok(self.byte_length)
    }

    fn seek(&mut self, position: u64) -> Result<u64, ()> {
        self.position = position;
        Ok(position)
    }

    fn read(&mut self, destination: &mut [u8]) -> Result<usize, ()> {
        let remaining = self.byte_length.saturating_sub(self.position);
        let count = remaining.min(destination.len() as u64) as usize;
        if count == 0 {
            return Ok(0);
        }
        self.read_exact(&mut destination[..count])?;
        Ok(count)
    }

    /// Complete short successful reads until the requested buffer is filled.
    fn read_exact(&mut self, destination: &mut [u8]) -> Result<(), ()> {
        // 1. Complete short reads at advancing offsets for this request.
        let mut filled = 0;
        while filled < destination.len() {
            // The object cache view bounds this read before acquiring bytes.
            let offset = self.position + filled as u64;
            let remaining = &mut destination[filled..];
            let source_read_result = self.source.read_at(offset, remaining);
            let error = match source_read_result {
                Ok(0) => InputError::UnexpectedEof {
                    offset,
                    remaining: remaining.len() as u64,
                },
                Ok(count) if count > remaining.len() => InputError::InvalidReadCount {
                    reported: count,
                    capacity: remaining.len(),
                },
                Ok(count) => {
                    filled += count;
                    continue;
                }
                Err(error) => InputError::Source { offset, error },
            };
            // 2. Append this acquisition failure; fail only the current read.
            self.retained_input_errors.push(error);
            return Err(());
        }
        // 3. Advance the cursor only after the entire buffer has been filled.
        self.position += destination.len() as u64;
        Ok(())
    }
}

/// Caches source bytes for one inspection.
///
/// 1. **Ownership.**
///    The caller owns the source; this cache borrows it mutably.
///    All parser views share the same cache and cursor, including views of
///    individual images in a universal binary.
///
/// 2. **Reading.**
///    The cursor completes short successful reads until the requested range is full.
///    The cache stores the completed range.
///
/// 3. **Acquisition failure.**
///    The cursor retains every source error, premature EOF and invalid read count
///    in occurrence order, including repeated failures of the same range.
///    Only the current read fails. Later requests can use cached bytes or acquire
///    missing ranges, including a range whose earlier read failed.
///    Successful reads do not clear recorded failures or add diagnostics.
///
/// 4. **Completion.**
///    After parsing returns, `finish()` consumes the cache and releases cached
///    bytes and the source borrow. Any acquisition failures are returned together,
///    taking precedence over the parser result. Otherwise that result is returned.
///
/// 5. **Later inspection.**
///    A later inspection creates a new cache with no retained input errors.
///    Read success and metadata freshness still depend on the source.
///    The cache does not establish a snapshot.
///
/// # Example
///
/// Declared source length: 8 bytes. Range ends are excluded.
/// These requests illustrate cache behavior.
/// The parser determines the actual read order.
///
/// ```text
/// Inspection A
///
///   Range    Calls read_at?   Result
///   -----------------------------------------------------------------
///   0..2     Yes              Returns and caches b"AB"
///   2..4     Yes              Supplied failure A; retain A
///   4..6     Yes              Returns and caches b"EF"
///   6..8     Yes              Supplied failure B; retain B
///   2..4     Yes              Supplied failure A again; retain another A
///   0..2     No               Returns cached b"AB"
///
///   After parsing: consume the cache, then return failures [A, B, A].
///
/// Inspection B: new cache, same source
///
///   0..2     Yes              Depends on the source
/// ```
///
/// A cache miss is normal. Cache bounds checks, allocation and parsing failures
/// do not add acquisition diagnostics. The parser chooses which requests occur;
/// this adapter neither retries failed reads nor requests extra ranges.
pub(crate) struct SourceCache<'source, Source: ByteSource> {
    byte_length: u64,
    cache: ReadCache<SourceCursor<'source, Source>>,
}

impl<'source, Source: ByteSource> SourceCache<'source, Source> {
    pub(crate) fn new(source: &'source mut Source) -> Self {
        let byte_length = source.byte_length();
        let cache = ReadCache::new(SourceCursor {
            source,
            byte_length,
            retained_input_errors: Vec::new(),
            position: 0,
        });
        Self { byte_length, cache }
    }

    pub(crate) fn byte_length(&self) -> u64 {
        self.byte_length
    }

    pub(crate) fn cache(&self) -> &ReadCache<SourceCursor<'source, Source>> {
        &self.cache
    }

    /// Consume the cache and give acquisition failures precedence over parsing.
    ///
    /// Parser borrows must end before this call. Consuming the cache releases
    /// cached bytes and the source borrow. All observed acquisition failures are
    /// returned together, even when parsing produced a report. With none, return
    /// the original report or parsing error.
    pub(crate) fn finish<Report>(
        self,
        parser_result: Result<Report, AnalysisError>,
    ) -> Result<Report, InspectionError> {
        let source_cursor = self.cache.into_inner();
        let acquisition_errors = InputErrors::from_errors(source_cursor.retained_input_errors);
        if let Some(errors) = acquisition_errors {
            return Err(InspectionError::Input(errors));
        }
        parser_result.map_err(InspectionError::Analysis)
    }
}
