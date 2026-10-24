//! Portable byte acquisition, separate from binary interpretation.
//!
//! A source reports its declared length and fills caller-owned buffers at explicit
//! offsets. [`crate::inspect_source`] validates ranges and completes partial reads
//! while adapting this contract for incremental analysis;
//! the slice-based entry points continue to borrow already-resident bytes.
//!
//! Providers retain their own handles and permissions. A declared length is not
//! a snapshot: providers must report acquisition failures and later source changes
//! according to their consistency policy. No OS, WIT or browser types are required.

mod cache;
mod error;

pub(crate) use cache::SourceCache;
pub use error::{InputError, SourceError};

/// A byte source with a declared length and offset-based reads.
///
/// Successful reads initialize the returned number of bytes at the start of
/// `destination`; the count must not exceed its length. Short reads are progress,
/// and zero means EOF for a nonempty destination. An empty destination returns
/// zero without reading. On failure the destination may be partially modified.
/// Local cancellation is explicit. Provider errors retain their original owned
/// type through [`SourceError::Provider`], including provider cancellation.
/// There is no automatic retry of source errors.
///
/// Implementations must not read or allocate an entire input to satisfy a small
/// request. The caller controls buffer size; providers must respect that bound.
/// Synchronous methods also permit a component adapter suspended through JSPI.
pub trait ByteSource {
    /// Declared input length, fixed for this source session; not a snapshot guarantee.
    fn byte_length(&self) -> u64;

    /// Read at an absolute offset without depending on a shared sequential cursor.
    fn read_at(&mut self, offset: u64, destination: &mut [u8]) -> Result<usize, SourceError>;
}

/// Already-resident bytes need no source-side allocation or filesystem access.
impl ByteSource for &[u8] {
    fn byte_length(&self) -> u64 {
        self.len() as u64
    }

    fn read_at(&mut self, offset: u64, destination: &mut [u8]) -> Result<usize, SourceError> {
        let Ok(start) = usize::try_from(offset) else {
            return Ok(0);
        };
        let Some(remaining) = self.get(start..) else {
            return Ok(0);
        };
        let count = remaining.len().min(destination.len());
        destination[..count].copy_from_slice(&remaining[..count]);
        Ok(count)
    }
}
