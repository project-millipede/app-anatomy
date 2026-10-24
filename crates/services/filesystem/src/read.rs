//! Bound each remote read before allocating its buffer; selection owns the file.

use std::io;

use binary_inspection::input::{ByteSource, SourceError};
use filesystem_native::NativeFileSource;

use filesystem_protocol::MAX_REQUEST_BYTES;

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
/// The returned vector contains only bytes supplied by one native read.
/// Short reads are passed through; the caller decides whether to read further.
/// Zero-length requests return an empty vector without allocation or native I/O.
/// Reads observe live file contents, including growth beyond the source's
/// captured length. The analyzer owns parsing and its cache.
///
/// # Errors
///
/// Rejects requests exceeding 64 KiB and ranges where `offset + length`
/// overflows. Buffer-allocation and native I/O failures are returned.
pub fn read_at(
    source: &mut NativeFileSource,
    offset: u64,
    length: u32,
) -> Result<Vec<u8>, SourceError> {
    if offset.checked_add(u64::from(length)).is_none() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Read range overflows").into());
    }
    if length > MAX_REQUEST_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Read exceeds the 64 KiB request limit",
        )
        .into());
    }
    if length == 0 {
        return Ok(Vec::new());
    }
    let mut bytes = Vec::new();
    bytes
        .try_reserve_exact(length as usize)
        .map_err(|error| io::Error::new(io::ErrorKind::OutOfMemory, error))?;
    bytes.resize(length as usize, 0);
    let count = source.read_at(offset, &mut bytes)?;
    bytes.truncate(count);
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use std::{fs::File, io::Write};

    use super::*;

    fn file_with_bytes(bytes: &[u8]) -> File {
        let mut file = tempfile::tempfile().unwrap();
        file.write_all(bytes).unwrap();
        file
    }

    fn assert_invalid_input(result: Result<Vec<u8>, SourceError>) {
        let Err(SourceError::Io(error)) = result else {
            panic!("expected an invalid-input error, got {result:?}");
        };
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
    }

    #[test]
    fn in_bounds_reads_return_only_the_requested_subranges() {
        // 1. Keep bytes beyond every requested range so oversized responses are visible.
        let mut source = NativeFileSource::new(file_with_bytes(b"0123456789abcdef")).unwrap();

        // 2. Vary both offset and length to catch misplaced or fixed-size reads.
        let cases = [
            (0, 1, b"0".as_slice()),
            (8, 4, b"89ab".as_slice()),
            (4, 6, b"456789".as_slice()),
        ];

        // 3. Exercise the service wrapper and require the complete result to match.
        for (offset, length, expected) in cases {
            let bytes = read_at(&mut source, offset, length).unwrap();

            assert_eq!(bytes, expected, "offset={offset}, length={length}");
        }
    }

    #[test]
    fn invalid_ranges_are_rejected_and_later_reads_still_succeed() {
        // 1. Retain one file for the invalid requests and subsequent valid read.
        let mut source = NativeFileSource::new(file_with_bytes(b"0123456789abcdef")).unwrap();

        // 2. Reject a range whose offset plus length cannot fit in u64.
        let overflowing_read = read_at(&mut source, u64::MAX, 1);
        assert_invalid_input(overflowing_read);

        // 3. Reject a length exceeding the per-request byte limit.
        let oversized_read = read_at(&mut source, 0, MAX_REQUEST_BYTES + 1);
        assert_invalid_input(oversized_read);

        // 4. Confirm a valid read still succeeds after both rejections.
        let bytes = read_at(&mut source, 0, 4).unwrap();
        assert_eq!(bytes, b"0123");
    }

    #[test]
    fn eof_boundary_reads_return_only_available_bytes() {
        // 1. Retain a sixteen-byte file; EOF is at offset 16.
        let mut source = NativeFileSource::new(file_with_bytes(b"0123456789abcdef")).unwrap();

        // 2. A range crossing EOF returns only the remaining bytes, without padding.
        let tail = read_at(&mut source, 14, 4).unwrap();
        assert_eq!(tail, b"ef");

        // 3. A nonempty request starting exactly at EOF returns no bytes.
        let at_eof = read_at(&mut source, 16, 4).unwrap();
        assert!(at_eof.is_empty());

        // 4. A nonempty request starting beyond EOF also returns no bytes.
        let beyond_eof = read_at(&mut source, 17, 4).unwrap();
        assert!(beyond_eof.is_empty());
    }
}
