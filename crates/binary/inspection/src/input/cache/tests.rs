use std::io;

use object::read::ReadRef;

use crate::input::SourceError;

use super::*;

/// Verify that short successful reads fill the complete requested range.
///
/// Production code:
///   ReadCache and our SourceCursor.
///
/// Test control:
///   An in-memory byte source that supplies at most three bytes per call.
///   Ordinary byte access delegates to the existing slice implementation.
///
/// 1. Source contents and the range being requested
///
/// Ranges exclude their end offset. Source offsets and destination indexes
/// are different: the requested source range begins at offset 4, while the
/// destination begins at index 0.
///
/// ```text
/// Source contents: b"skipABCDEFG"                 total length: 11
///
/// Source range     Contents     Used by this request?
/// ──────────────────────────────────────────────────
///  0..4            skip         No: before the requested range
///  4..7            ABC          Yes: first fragment
///  7..10           DEF          Yes: second fragment
/// 10..11           G            Yes: final fragment
///
/// Requested range: 4..11
/// Required result: ABCDEFG
///
/// Source offset:       4  5  6  7  8  9 10
/// Source byte:         A  B  C  D  E  F  G
/// Destination index:   0  1  2  3  4  5  6
/// ```
///
/// Starting at a nonzero offset makes incorrect positioning visible:
/// reading from offset 0 would include "skip" instead of the requested bytes.
///
/// 2. Who performs the operation
///
/// ```text
/// Test
///   │ requests source range 4..11
///   ▼
/// ReadCache
///   │ positions the cursor at source offset 4
///   │ prepares a seven-byte destination
///   │ asks the cursor to fill the destination
///   ▼
/// SourceCursor                         PRODUCTION COMPLETION LOGIC
///   │ supplies the remaining destination and the next source offset
///   ▼
/// ShortReadSource                      CONTROLLED TEST INPUT
///     supplies at most three bytes
///
/// SourceCursor receives the actual count and continues until all seven
/// destination bytes have been filled.
/// ```
///
/// 3. Read sequence for this source
///
/// The requested length is the size of the destination slice supplied
/// to the source. The source's three-byte limit is a separate constraint.
///
/// ```text
/// Iteration  Source offset  Destination slice  Requested  Returned
/// ───────────────────────────────────────────────────────────────
///     1            4             [0..7]            7      ABC: 3
///     2            7             [3..7]            4      DEF: 3
///     3           10             [6..7]            1        G: 1
///
///                  ▲                  ▲
///                  │                  │
///          advance by actual   continue after bytes
///          bytes returned      already supplied
/// ```
///
/// 4. How the destination becomes complete
///
/// Dots mean "not yet supplied by the source"; they do not indicate
/// uninitialized memory.
///
/// ```text
/// Destination index:   0  1  2  3  4  5  6
///
/// Before reading:     [ .  .  .  .  .  .  . ]   filled = 0
/// After ABC:          [ A  B  C  .  .  .  . ]   filled = 3
/// After DEF:          [ A  B  C  D  E  F  . ]   filled = 6
/// After G:            [ A  B  C  D  E  F  G ]   filled = 7
///
///                      └──── complete ─────┘
/// ```
///
/// While filling this range, the cursor's base position remains 4.
/// Each source call uses:
///
/// ```text
/// source offset = base position + filled
///
/// first call:      4 + 0 = 4
/// second call:     4 + 3 = 7
/// third call:      4 + 6 = 10
///
/// after completion:
/// cursor position = 4 + 7 = 11
/// ```
///
/// 5. Evidence checked by the test
///
/// The operation must succeed and the complete returned range must equal
/// b"ABCDEFG".
///
/// This detects missing fragments, incorrect source offsets, and fragments
/// copied into the wrong destination positions. The assertion concerns the
/// complete bytes, not a required number of source calls.
#[test]
fn short_reads_fill_the_requested_range() {
    struct ShortReadSource<'bytes> {
        contents: &'bytes [u8],
    }

    impl ByteSource for ShortReadSource<'_> {
        fn byte_length(&self) -> u64 {
            self.contents.byte_length()
        }

        fn read_at(&mut self, offset: u64, destination: &mut [u8]) -> Result<usize, SourceError> {
            let length = destination.len().min(3);
            ByteSource::read_at(&mut self.contents, offset, &mut destination[..length])
        }
    }

    // 1. Put b"skipABCDEFG" in ShortReadSource and create a cache over it.
    let source_contents: &[u8] = b"skipABCDEFG";
    let mut short_read_source = ShortReadSource {
        contents: source_contents,
    };
    let cache = SourceCache::new(&mut short_read_source);

    // 2. Ask the cache for source range 4..11 and require the read to succeed.
    let range_bytes = cache
        .cache()
        .read_bytes_at(4, 7)
        .expect("short reads must fill the requested range");

    // 3. Compare the complete returned range with the expected b"ABCDEFG".
    assert_eq!(range_bytes, b"ABCDEFG");
}

/// All requested ranges are within the source's declared length.
/// Reads starting at offsets 2 and 6 fail; other reads use the source bytes.
#[test]
fn reads_continue_after_failure_and_preserve_first_error() {
    struct SourceWithReadErrors<'bytes> {
        contents: &'bytes [u8],
    }

    impl ByteSource for SourceWithReadErrors<'_> {
        fn byte_length(&self) -> u64 {
            self.contents.byte_length()
        }

        fn read_at(&mut self, offset: u64, destination: &mut [u8]) -> Result<usize, SourceError> {
            match offset {
                2 => Err(io::Error::from(io::ErrorKind::PermissionDenied).into()),
                6 => Err(io::Error::from(io::ErrorKind::TimedOut).into()),
                _ => ByteSource::read_at(&mut self.contents, offset, destination),
            }
        }
    }

    // 1. Create a cache over ordinary bytes with two source reads set to fail.
    let mut source_with_read_errors = SourceWithReadErrors {
        contents: b"ABCDEFGH",
    };
    let cache = SourceCache::new(&mut source_with_read_errors);
    let view = cache.cache();

    // 2. Read 0..2 successfully to populate the cache with b"AB".
    let initial_range_bytes = view
        .read_bytes_at(0, 2)
        .expect("the initial range must be readable");
    assert_eq!(initial_range_bytes, b"AB");

    // 3. Request 2..4; the source returns PermissionDenied for this read.
    let first_failing_read_result = view.read_bytes_at(2, 2);
    assert!(first_failing_read_result.is_err());

    // 4. Read the uncached range 4..6 despite the earlier acquisition failure.
    let later_range_bytes = view
        .read_bytes_at(4, 2)
        .expect("an earlier failure must not block a later read");
    assert_eq!(later_range_bytes, b"EF");

    // 5. Request 6..8; the source returns a different error, TimedOut.
    let later_failing_read_result = view.read_bytes_at(6, 2);
    assert!(later_failing_read_result.is_err());

    // 6. Verify that the later success and failure did not replace the first error.
    let retained_input_error = cache.into_error();
    let Some(InputError::Source {
        offset: 2,
        error: SourceError::Io(io_error),
    }) = retained_input_error
    else {
        panic!("expected the original I/O failure at offset 2, got {retained_input_error:?}");
    };
    assert_eq!(io_error.kind(), io::ErrorKind::PermissionDenied);
}
