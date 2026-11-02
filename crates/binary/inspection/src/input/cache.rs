//! Cached source bytes for upstream parsers, with acquisition errors kept intact.

use object::read::{ReadCache, ReadCacheOps};

use super::{ByteSource, InputError};

/// Adapt offset-based source reads to the cursor interface required by `object`.
pub(crate) struct SourceCursor<'source, Source> {
    source: &'source mut Source,
    byte_length: u64,
    /// First acquisition failure; `ReadCacheOps` reports errors only as `()`.
    retained_input_error: Option<InputError>,
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
            // 2. Preserve the first acquisition error; fail the current read.
            self.retained_input_error.get_or_insert(error);
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
///    The cursor retains the first source error, premature EOF or invalid read count
///    in `retained_input_error`.
///    Only the current read fails. Later requests can use cached bytes or acquire
///    missing ranges, including a range whose earlier read failed.
///    Later results do not clear or replace the retained error.
///
/// 4. **Completion.**
///    After parsing returns, `into_error()` consumes the cache and returns any
///    retained input error. It also releases cached bytes and the source borrow.
///    The inspection entry point gives that error precedence over the parser result.
///
/// 5. **Later inspection.**
///    A later inspection creates a new cache with no retained input error.
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
///   2..4     Yes              PermissionDenied; first error retained
///   4..6     Yes              Returns and caches b"EF"
///   6..8     Yes              TimedOut; first error unchanged
///   0..2     No               Returns cached b"AB"
///
///   After parsing: consume the cache, then return the retained input error.
///
/// Inspection B: new cache, same source
///
///   0..2     Yes              Depends on the source
/// ```
///
/// Errors originating in cache bounds checks, allocation or parsing do not set
/// `retained_input_error`.
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
            retained_input_error: None,
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

    /// Consume the cache and return the first retained input error.
    ///
    /// Parser borrows must end before this call.
    /// Consuming the cache releases cached bytes and the source borrow.
    /// `None` means no acquisition error was retained; parsing may still have failed.
    pub(crate) fn into_error(self) -> Option<InputError> {
        self.cache.into_inner().retained_input_error
    }
}

#[cfg(test)]
mod tests;
