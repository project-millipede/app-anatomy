//! Behavioral tests for the portable public API, using specification fixtures.

mod support;

use binary_inspection::{AnalysisScope, inspect};
use support::*;

#[test]
fn signature_locations_use_absolute_offsets_inside_universal_files() {
    // The four arbitrary payload bytes are deliberately not a valid signature.
    // Inspection reports a bounded location without asserting validity.
    let mut member = MachOFixture {
        commands: vec![code_signature(ByteOrder::Little, 48, 4)],
        ..Default::default()
    }
    .encode();
    member.extend_from_slice(&[0xde, 0xad, 0xbe, 0xef]);
    let (bytes, offsets) = universal(
        UniversalFormat::Fat64,
        ByteOrder::Big,
        &[UniversalMember {
            cpu_type: CPU_ARM64,
            cpu_subtype: 0,
            image: &member,
        }],
    );
    let report = inspect(&bytes).unwrap();
    let signature = &report.images[0].signature_commands[0];
    assert_eq!(signature.command_range.offset(), offsets[0] as u64 + 32);
    assert_eq!(signature.command_range.size(), 16);
    assert_eq!(signature.data_range.offset(), offsets[0] as u64 + 48);
    assert_eq!(signature.data_range.size(), 4);
    assert_eq!(signature.data_range.end(), bytes.len() as u64);
    assert_eq!(report.scope, AnalysisScope::HeadersOnly);
}
