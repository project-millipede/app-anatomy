//! WebAssembly component bindings for ordinary Rust APIs.
//!
//! This crate owns WIT bindings, boundary conversion and environment adapters.
//! Binary interpretation, analysis errors and Mach-O identities belong
//! to `binary-inspection`. Remote filesystem workflow and resource lifecycle belong to
//! `workbench-operations`.

wit_bindgen::generate!({
    path: [
        "../../../wkg/wit/deps/polymorph-websocket-0.1.0",
        "wit",
    ],
    world: "apple-code:analysis/analysis@0.5.0",
    with: {
        // Output enums: Rust discriminants must match WIT case order.
        // Accepting these types as inputs would require compatible lifting support.
        "apple-code:analysis/native@0.5.0/step-kind": workbench_operations::StepKind,
        "apple-code:analysis/native@0.5.0/entry-kind": filesystem_data::DirectoryEntryKind,
        "apple-code:analysis/native@0.5.0/failure-kind": workbench_operations::FailureKind,
        "apple-code:analysis/binary@0.5.0/container-kind": binary_inspection::ContainerKind,
        "apple-code:analysis/binary@0.5.0/header-format": binary_inspection::MachOHeaderFormat,
        "apple-code:analysis/binary@0.5.0/analysis-scope": binary_inspection::AnalysisScope,

        // Records: generated bindings access the ordinary Rust fields directly.
        // Public field names and types must match the WIT record.
        "apple-code:analysis/native@0.5.0/selected-resource": filesystem_protocol::SelectedResource,
        "apple-code:analysis/native@0.5.0/directory-entry": filesystem_data::DirectoryEntry,
        "apple-code:analysis/native@0.5.0/selection-state": filesystem_protocol::SelectionState,
    },
    generate_all,
});

mod conversion;
mod inspection_error;
mod native;
#[path = "../../../../config/native_service.rs"]
mod native_service;
mod websocket;

use exports::apple_code::analysis::binary;

struct Component;

export!(Component);
