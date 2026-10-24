//! Cached source bytes for upstream parsers, with acquisition errors kept intact.

use object::read::{ReadCache, ReadCacheOps};

use super::{ByteSource, InputError};

/// Adapt offset-based source reads to the cursor interface required by `object`.
pub(crate) struct SourceCursor<'source, Source> {
    source: &'source mut Source,
    byte_length: u64,
    /// First failure while filling a requested range; `object` receives only `()`.
    failure: Option<InputError>,
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
        // 1. Preserve the first failure without calling the source again.
        if self.failure.is_some() {
            return Err(());
        }
        // 2. Complete short reads at advancing offsets; stop on the first failure.
        let mut filled = 0;
        while filled < destination.len() {
            // The object cache view bounds this read before acquiring bytes.
            let offset = self.position + filled as u64;
            let remaining = &mut destination[filled..];
            let error = match self.source.read_at(offset, remaining) {
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
            self.failure = Some(error);
            return Err(());
        }
        // 3. Advance the cursor only after the entire buffer has been filled.
        self.position += destination.len() as u64;
        Ok(())
    }
}

/// Owns cached bytes borrowed during one inspection.
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
            failure: None,
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

    /// Consume the cache and recover the first failure while acquiring bytes.
    ///
    /// `ReadCache::into_inner()` releases cached bytes and returns `SourceCursor`,
    /// including its retained failure. Parser borrows must end before this call.
    /// `None` means acquisition did not fail; parsing may still have failed.
    pub(crate) fn into_error(self) -> Option<InputError> {
        self.cache.into_inner().failure
    }
}

#[cfg(test)]
mod tests {
    use std::{error::Error, io};

    use object::read::ReadRef;

    use crate::input::SourceError;

    use super::*;

    #[test]
    fn failed_provider_error_keeps_its_original_chain_and_stops_the_cache() {
        struct Unavailable {
            failure: Option<io::Error>,
        }

        impl ByteSource for Unavailable {
            fn byte_length(&self) -> u64 {
                4
            }

            fn read_at(&mut self, _: u64, _: &mut [u8]) -> Result<usize, SourceError> {
                Err(self
                    .failure
                    .take()
                    .expect("failed read must not be retried")
                    .into())
            }
        }

        let mut source = Unavailable {
            failure: Some(io::Error::from(io::ErrorKind::PermissionDenied)),
        };
        let cache = SourceCache::new(&mut source);
        let view = cache.cache().range(0, 4);
        assert!(view.read_bytes_at(0, 4).is_err());
        assert!(view.read_bytes_at(0, 4).is_err());
        let failure = cache.into_error().unwrap();
        let mut cause: &(dyn Error + 'static) = &failure;
        while let Some(source) = cause.source() {
            cause = source;
        }
        assert_eq!(
            cause.downcast_ref::<io::Error>().unwrap().kind(),
            io::ErrorKind::PermissionDenied
        );
    }
}
