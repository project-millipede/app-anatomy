//! Bound each remote read before allocating its buffer; selection owns the file.

use std::io;

use binary_inspection::input::{ByteSource, SourceError};
use filesystem_native::NativeFileSource;

const READ_CHUNK_BYTES: usize = 64 * 1024;

/// Read up to `length` bytes from a retained native file, starting at the
/// zero-based byte `offset`. The caller retains ownership of the file.
///
/// # Example
///
/// For a file containing `0123456789abcdef`, the available bytes are:
///
/// ```text
/// offset  length  available bytes
///      8       4  89ab
///     14       4  ef       (range extends beyond EOF)
///     16       4  <empty>  (starts at EOF)
/// ```
///
/// The returned vector contains at most 64 KiB from one native read, even when
/// `length` is larger. Short reads are successful; the caller decides whether
/// to read further. The protocol decoder validates the requested range before
/// dispatch calls this internal reader.
/// Zero-length requests return an empty vector without allocation or native I/O.
/// Reads observe live file contents, including growth beyond the source's
/// captured length. The analyzer owns parsing and its cache.
///
/// # Errors
///
/// Buffer-allocation and native I/O failures are returned.
pub fn read_at(
    source: &mut NativeFileSource,
    offset: u64,
    length: u32,
) -> Result<Vec<u8>, SourceError> {
    if length == 0 {
        return Ok(Vec::new());
    }
    let requested_length_conversion = usize::try_from(length);
    let response_length = match requested_length_conversion {
        Ok(requested_length) => requested_length.min(READ_CHUNK_BYTES),
        Err(_) => {
            // The requested length exceeds usize::MAX, so it also exceeds
            // the service chunk.
            READ_CHUNK_BYTES
        }
    };
    let mut bytes = Vec::new();
    bytes
        .try_reserve_exact(response_length)
        .map_err(|error| io::Error::new(io::ErrorKind::OutOfMemory, error))?;
    bytes.resize(response_length, 0);
    let count = source.read_at(offset, &mut bytes)?;
    bytes.truncate(count);
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use std::{fs::File, io::Write};

    use super::*;

    fn file_with_bytes(bytes: &[u8]) -> io::Result<File> {
        let mut file = tempfile::tempfile()?;
        file.write_all(bytes)?;
        Ok(file)
    }

    #[test]
    fn in_bounds_reads_return_only_the_requested_subranges() -> anyhow::Result<()> {
        // 1. Keep bytes beyond every requested range so oversized responses are visible.
        let mut source = NativeFileSource::new(file_with_bytes(b"0123456789abcdef")?)?;

        // 2. Vary both offset and length to catch misplaced or fixed-size reads.
        let cases = [
            (0, 1, b"0".as_slice()),
            (8, 4, b"89ab".as_slice()),
            (4, 6, b"456789".as_slice()),
        ];

        // 3. Exercise the service wrapper and require the complete result to match.
        for (offset, length, expected) in cases {
            let bytes = read_at(&mut source, offset, length)?;

            assert_eq!(bytes, expected, "offset={offset}, length={length}");
        }
        Ok(())
    }

    #[test]
    fn large_requested_ranges_return_bounded_prefixes() -> anyhow::Result<()> {
        // Keep data beyond the request so an oversized response is visible.
        let contents: Vec<u8> = (0_u8..=250).cycle().take(READ_CHUNK_BYTES + 32).collect();
        let mut source = NativeFileSource::new(file_with_bytes(&contents)?)?;
        let requested_length = u32::try_from(READ_CHUNK_BYTES + 8)?;

        let bytes = read_at(&mut source, 4, requested_length)?;

        assert!(
            !bytes.is_empty(),
            "a valid read before EOF must make progress"
        );
        assert!(bytes.len() <= READ_CHUNK_BYTES);
        assert_eq!(bytes, contents[4..4 + bytes.len()]);
        Ok(())
    }

    #[test]
    fn eof_boundary_reads_return_only_available_bytes() -> anyhow::Result<()> {
        // 1. Retain a sixteen-byte file; EOF is at offset 16.
        let mut source = NativeFileSource::new(file_with_bytes(b"0123456789abcdef")?)?;

        // 2. A range crossing EOF returns only the remaining bytes, without padding.
        let tail = read_at(&mut source, 14, 4)?;
        assert_eq!(tail, b"ef");

        // 3. A nonempty request starting exactly at EOF returns no bytes.
        let at_eof = read_at(&mut source, 16, 4)?;
        assert!(at_eof.is_empty());

        Ok(())
    }
}
