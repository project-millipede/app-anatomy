//! WebAssembly component for ordinary Rust APIs.
//!
//! The boundary is generated from the Rust types and operations by
//! `cargo run -p app-anatomy-xtask -- contract generate`:
//!
//! - `wit/analysis.wit`, the contract;
//! - `src/bindings.rs`, the contract's part of the `wit_bindgen::generate!` call;
//! - `src/forwarding.rs`, the implementation of the binding traits.
//!
//! This crate adds only the environment: the WebSocket transport over the
//! imported Polymorph operations, and the session factory that uses it.
//! Binary interpretation, analysis errors and Mach-O identities belong to
//! `binary-inspection`. Remote filesystem workflow and resource lifecycle belong
//! to `workbench-operations`.

// Defines `generate_bindings!`, which knows the world, the Rust types that
// cross the boundary unchanged and the derive that forwarding needs.
include!("bindings.rs");

generate_bindings! {
    path: [
        "../../../wkg/wit/deps/polymorph-websocket-0.1.0",
        "wit",
    ],
    generate_all,
}

// Generated text is not formatted; `contract check` compares it byte for byte.
#[rustfmt::skip]
mod forwarding;
#[path = "../../../../config/native_service.rs"]
mod native_service;
mod websocket;

// `export!` takes the type by name, not by path.
use forwarding::Component;

export!(Component);

/// Create a session connected to the native filesystem service.
///
/// The contract's `create-selection-session`. It is implemented here, not in
/// `workbench-operations`, because the transport is this environment's: the
/// component's imported WebSocket operations. The generated forwarding calls
/// it by this path.
fn create_selection_session() -> workbench_operations::Session {
    let transport = websocket::transport();
    workbench_operations::Session::new(transport)
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;

    use filesystem_data::{DirectoryEntry, DirectoryEntryKind};
    use filesystem_protocol::{Response, SelectedResource, SelectionState, encode_response};
    use wit_reflect::component::ResourceCell;
    use workbench_operations::{Failure, Session, StepKind, Transport, TransportOperation};

    use crate::exports::apple_code::analysis::inspection::{
        InputError, InspectionError, SourceError,
    };
    use crate::exports::native::{GuestSession, InspectionFailureKind};

    /// Answers each request with the next prepared reply.
    struct Replies(VecDeque<Result<Vec<u8>, Failure>>);

    impl Transport for Replies {
        fn exchange(&mut self, _request: Vec<u8>) -> Result<Vec<u8>, Failure> {
            self.0.pop_front().expect("a reply for every request")
        }

        fn reset(&mut self) {}
    }

    fn session(replies: impl IntoIterator<Item = Result<Vec<u8>, Failure>>) -> Session {
        let transport = Replies(replies.into_iter().collect());
        Session::new(Box::new(transport))
    }

    fn reply(response: &Response) -> Result<Vec<u8>, Failure> {
        let encoded_response = encode_response(response).expect("an encodable response");
        Ok(encoded_response)
    }

    fn resource() -> String {
        "a".repeat(64)
    }

    /// A selected file whose first read fails in the transport.
    fn failing_read_replies() -> [Result<Vec<u8>, Failure>; 3] {
        let selection = SelectionState {
            file: Some(SelectedResource {
                name: "file".into(),
                resource: resource(),
            }),
            ..SelectionState::default()
        };
        let read_failure = Failure::transport(
            TransportOperation::Receive,
            std::io::Error::from_raw_os_error(13),
        );
        [
            reply(&Response::Selection(selection)),
            reply(&Response::ByteLength(32)),
            Err(read_failure),
        ]
    }

    /// The boundary is where a failure could lose information: its message is
    /// computed, its stage is an enum case and its cause is a foreign error.
    /// The same failure is produced twice, once for the ordinary Rust API and
    /// once through the generated forwarding, and the binding value must carry
    /// what the Rust value says.
    #[test]
    fn a_failed_inspection_keeps_its_message_stage_and_cause_across_the_boundary() {
        // 1. The failure as ordinary Rust reports it.
        let mut owner_session = session(failing_read_replies());
        let mut owner_outcome = owner_session.inspect(&resource());
        let owner_failure = owner_outcome
            .steps
            .remove(0)
            .result
            .expect_err("the read fails");
        let workbench_operations::InspectionFailure::Inspection(
            binary_inspection::InspectionError::Input(owner_input_errors),
        ) = &owner_failure
        else {
            panic!("expected acquisition failures, got {owner_failure:?}");
        };
        let [
            binary_inspection::input::InputError::Source {
                error: owner_source_error,
                ..
            },
        ] = owner_input_errors.errors()
        else {
            panic!("expected one failed read, got {owner_input_errors:?}");
        };
        let binary_inspection::input::SourceError::Provider(owner_cause) = owner_source_error
        else {
            panic!("expected a provider failure, got {owner_source_error:?}");
        };

        // 2. The same failure through the generated forwarding.
        let component_session = ResourceCell::new(session(failing_read_replies()));
        let outcome = component_session.inspect(resource());

        // 3. One step of the unchanged kind, with the complete message.
        let [step] = outcome.steps.as_slice() else {
            panic!("expected one inspection step");
        };
        assert_eq!(step.kind, StepKind::Inspect);
        let failure = step.result.as_ref().expect_err("the read fails");
        assert_eq!(failure.message, owner_failure.to_string());

        // 4. The stage, the failed read's offset and the cause's own text.
        let InspectionFailureKind::Inspection(InspectionError::Input(input_errors)) = &failure.kind
        else {
            panic!("expected acquisition failures, got {:?}", failure.kind);
        };
        let [InputError::Source(failed_read)] = input_errors.errors.as_slice() else {
            panic!("expected one failed read, got {input_errors:?}");
        };
        assert_eq!(failed_read.offset, 0);
        let SourceError::Provider(cause) = &failed_read.error else {
            panic!("expected a provider failure, got {:?}", failed_read.error);
        };
        assert_eq!(*cause, owner_cause.to_string());
    }

    /// Selection data crosses unchanged: the bindings hand out the Rust value
    /// the filesystem client decoded.
    #[test]
    fn a_selection_crosses_the_boundary_as_the_value_the_client_decoded() {
        let selection = SelectionState {
            file: None,
            directory: Some(SelectedResource {
                name: "Applications".into(),
                resource: resource(),
            }),
            entries: vec![DirectoryEntry {
                id: 7,
                name: "Example.app".into(),
                kind: DirectoryEntryKind::Directory,
            }],
        };
        let component_session =
            ResourceCell::new(session([reply(&Response::Selection(selection.clone()))]));

        let outcome = component_session.query_selection();

        let [step] = outcome.steps.as_slice() else {
            panic!("expected one query step");
        };
        assert_eq!(step.kind, StepKind::QuerySelection);
        // The annotation compiles only while the binding uses the Rust type.
        let observed: &Option<SelectionState> = step.result.as_ref().expect("the query succeeds");
        assert_eq!(observed.as_ref(), Some(&selection));
    }
}
