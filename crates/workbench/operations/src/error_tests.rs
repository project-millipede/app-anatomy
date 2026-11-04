use crate::{
    Failure, FailureKind, InspectionFailure, StepKind, TransportOperation,
    tests::{reply, resource, session},
};
use binary_inspection::{
    InspectionError,
    input::{InputError, SourceError},
};
use filesystem_protocol::{
    ProtocolError, ProtocolErrorKind, Request, Response, SelectedResource, SelectionState,
};
use std::{error::Error, io};

fn backend_failure() -> Failure {
    Failure::transport(
        TransportOperation::Receive,
        io::Error::from_raw_os_error(13),
    )
}

#[test]
fn response_mismatch_and_backend_failure_remain_distinguishable() {
    let (mut session, observed) =
        session([reply(Response::Read(Vec::new())), Err(backend_failure())]);
    let resource_id = resource();
    let mismatch = session.byte_length(&resource_id).unwrap_err();
    assert_eq!(mismatch.kind, FailureKind::Transport);
    assert_eq!(
        mismatch.protocol_error().unwrap().kind(),
        ProtocolErrorKind::ResponseMismatch
    );
    assert!(mismatch.operation().is_none());
    assert!(mismatch.source().unwrap().is::<ProtocolError>());

    let backend = session.byte_length(&resource_id).unwrap_err();
    assert_eq!(backend.kind, FailureKind::Transport);
    assert!(backend.protocol_error().is_none());
    assert_eq!(backend.operation(), Some(TransportOperation::Receive));
    assert_eq!(
        backend
            .source()
            .unwrap()
            .downcast_ref::<io::Error>()
            .unwrap()
            .raw_os_error(),
        Some(13)
    );
    assert_eq!(observed.borrow().resets, 2);
}

#[test]
fn selection_and_query_failures_preserve_causes_without_replay() {
    let (mut session, observed) = session([
        Err(backend_failure()),
        Err(Failure::transport(
            TransportOperation::Send,
            io::Error::from_raw_os_error(32),
        )),
    ]);
    let outcome = session.select_file();
    let [action, query] = outcome.steps.as_slice() else {
        panic!("expected a file selection step followed by a selection query");
    };
    assert_eq!(action.kind, StepKind::SelectFile);
    assert_eq!(query.kind, StepKind::QuerySelection);
    let action_error = action.result.as_ref().unwrap_err();
    let query_error = query.result.as_ref().unwrap_err();
    assert_eq!(
        action_error
            .source()
            .unwrap()
            .downcast_ref::<io::Error>()
            .unwrap()
            .raw_os_error(),
        Some(13)
    );
    assert_eq!(
        query_error
            .source()
            .unwrap()
            .downcast_ref::<io::Error>()
            .unwrap()
            .raw_os_error(),
        Some(32)
    );
    assert!(matches!(
        observed.borrow().requests.as_slice(),
        [Request::ChooseFile, Request::CurrentSelection]
    ));
}

#[test]
fn inspection_keeps_core_read_diagnostics_and_the_detailed_client_cause() {
    // 1. Supply a selected file and its length, then fail its first source read.
    let resource_id = resource();
    let selection_response = Response::Selection(SelectionState {
        file: Some(SelectedResource {
            name: "file".into(),
            resource: resource_id.clone(),
        }),
        ..SelectionState::default()
    });
    let selection_reply = reply(selection_response);
    let byte_length_reply = reply(Response::ByteLength(32));
    let read_failure = backend_failure();
    let (mut session, _) = session([selection_reply, byte_length_reply, Err(read_failure)]);

    // 2. Inspect the file and obtain the acquisition errors from the failed step.
    let outcome = session.inspect(&resource_id);
    let [step] = outcome.steps.as_slice() else {
        panic!("expected one inspection step");
    };
    let failure = step.result.as_ref().unwrap_err();
    let InspectionFailure::Inspection(InspectionError::Input(input_errors)) = failure else {
        panic!("expected a detailed inspection failure: {failure:?}");
    };

    // 3. Require the failed read's offset and access its original client failure.
    let [
        InputError::Source {
            offset: 0,
            error: SourceError::Provider(provider_error),
        },
    ] = input_errors.errors()
    else {
        panic!("expected one provider failure at offset 0, got {input_errors:?}");
    };
    let client_failure = provider_error
        .downcast_ref::<Failure>()
        .expect("the source must retain the filesystem-client failure");

    // 4. Verify the receive operation and the original native I/O error code.
    assert_eq!(
        client_failure.operation(),
        Some(TransportOperation::Receive)
    );
    let native_io_error = client_failure
        .source()
        .unwrap()
        .downcast_ref::<io::Error>()
        .expect("the client failure must retain the native I/O error");
    assert_eq!(native_io_error.raw_os_error(), Some(13));
}
