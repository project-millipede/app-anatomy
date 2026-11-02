use super::*;
use crate::tests::{reply, resource, session};
use filesystem_protocol::{Request, Response};

/// Verify that a short remote reply is copied into the destination and
/// reported using its actual byte count.
///
/// Production code:
///   RemoteSource, Session, and the shared protocol codec.
///
/// Test control:
///   The existing scripted transport records the request and returns one
///   arranged response containing b"ABC".
///
/// 1. Initial state
///
/// RemoteSource is constructed directly with a configured resource identifier
/// and a declared source length of 11. This deliberately bypasses selection
/// and metadata acquisition; those operations are outside this test.
///
/// ```text
/// Declared source length:      11
/// Requested source offset:     4
/// Destination capacity:        7
/// Requested source range:      4..11
///
/// Arranged provider reply:     ABC
/// Actual returned file bytes:  3
/// ```
///
/// There is no source file or source byte array behind this transport.
/// It supplies a prepared response. The request assertion independently
/// verifies which resource and range the adapter asked for.
///
/// 2. Request and response sequence
///
/// ```text
/// Test
///   │ RemoteSource::read_at(offset: 4, destination: seven bytes)
///   ▼
/// RemoteSource
///   │ Session::read_at(resource, offset: 4, length: 7)
///   ▼
/// Session
///   │ validates and encodes Request::ReadAt
///   ▼
/// Scripted transport
///   │ records the request
///   │ returns an encoded Response::Read containing ABC
///   ▼
/// Session
///   │ decodes the reply and checks it against the request
///   │ accepts three returned bytes for a request of up to seven
///   ▼
/// RemoteSource
///   │ copies ABC into the beginning of the supplied destination
///   │ returns the actual count: 3
///   ▼
/// Test
///     observes the copied prefix and returned count
/// ```
///
/// The three-byte count describes file data, not the size of the encoded
/// protocol message.
///
/// 3. Destination capacity versus returned data
///
/// ```text
/// Destination index:   0  1  2 | 3  4  5  6
///                      ────────┼────────────
/// Returned prefix:     A  B  C | outside returned prefix
///                      └──┬──┘ |
///                         │    └─ These bytes are not asserted.
///                         │
///                         └────── Returned count must be 3.
///
/// Destination capacity: 7
/// Successful read count: 3
/// ```
///
/// Bytes beyond the returned prefix are outside this read's result.
/// The test does not require those remaining bytes to stay unchanged.
///
/// 4. Evidence checked by the test
///
/// ```text
/// Recorded request
///   resource  == configured resource identifier
///   offset    == 4
///   length    == 7
///
/// Returned result
///   count             == 3
///   destination[..3]  == b"ABC"
/// ```
///
/// Reporting destination.len() would incorrectly return 7 after supplying
/// only three bytes. The count assertion directly detects that mistake.
///
/// This test ends after one remote read. SourceCursor is not involved:
/// completing the remaining range is covered separately by the cursor test.
#[test]
fn short_remote_reads_copy_bytes_and_return_their_count() -> Result<(), SourceError> {
    // 1. Build a remote source declaring 11 bytes, backed by a session
    // whose next reply contains b"ABC".
    let resource_id = resource();
    let reply_contents: &[u8] = b"ABC";
    let response_bytes = reply_contents.to_vec();
    let read_response = Response::Read(response_bytes);
    let encoded_reply = reply(read_response);
    let (mut session, transport_observations) = session([encoded_reply]);
    let mut remote_source = RemoteSource {
        session: &mut session,
        resource: &resource_id,
        byte_length: 11,
    };

    // 2. Read at offset four into a seven-byte destination.
    let mut destination = [0; 7];
    let returned_byte_count = remote_source.read_at(4, &mut destination)?;

    // 3. Verify the request uses the configured resource, offset 4, and length 7.
    assert_eq!(
        transport_observations.borrow().requests.as_slice(),
        [Request::ReadAt {
            resource: resource_id,
            offset: 4,
            length: 7,
        }]
    );

    // 4. Verify the read reports three bytes and places b"ABC" in that prefix.
    assert_eq!(returned_byte_count, 3);
    assert_eq!(&destination[..returned_byte_count], b"ABC");
    Ok(())
}
