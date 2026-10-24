//! Signature ranges stay within their containing universal member.

mod support;

use binary_inspection::{ErrorKind, inspect};
use support::*;

#[test]
fn signatures_cannot_borrow_bytes_from_the_following_universal_member() {
    // The signature offset is exactly at the end of the first image. The
    // second image supplies bytes at that file offset, but not in this slice.
    let first = MachOFixture {
        commands: vec![code_signature(ByteOrder::Little, 48, 4)],
        ..Default::default()
    }
    .encode();
    let second = MachOFixture::default().encode();
    let (bytes, _) = universal(
        UniversalFormat::Fat32,
        ByteOrder::Big,
        &[
            UniversalMember {
                cpu_type: CPU_ARM64,
                cpu_subtype: 0,
                image: &first,
            },
            UniversalMember {
                cpu_type: CPU_ARM64,
                cpu_subtype: 0,
                image: &second,
            },
        ],
    );
    let error = inspect(&bytes).unwrap_err();
    assert!(matches!(error.kind, ErrorKind::Truncated { .. }));
}
