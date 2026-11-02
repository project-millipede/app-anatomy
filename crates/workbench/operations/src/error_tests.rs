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

// TODO: Simplify this test around the source failure, read offset and original
// client/I/O cause. Use the typed provider payload instead of fixed-depth source
// traversal; remove pointer, duplicate message and exact request-order assertions.
#[test]
fn inspection_keeps_core_read_diagnostics_and_the_detailed_client_cause() {
    let (mut session, observed) = session([
        reply(Response::Selection(SelectionState {
            file: Some(SelectedResource {
                name: "file".into(),
                resource: resource(),
            }),
            ..SelectionState::default()
        })),
        reply(Response::ByteLength(32)),
        Err(backend_failure()),
    ]);
    let resource_id = resource();
    let outcome = session.inspect(&resource_id);
    let [step] = outcome.steps.as_slice() else {
        panic!("expected one inspection step");
    };
    let failure = step.result.as_ref().unwrap_err();
    let InspectionFailure::Inspection(error) = failure else {
        panic!("expected a detailed inspection failure: {failure:?}");
    };
    assert!(matches!(
        error,
        InspectionError::Input(InputError::Source {
            offset: 0,
            error: SourceError::Provider(_),
        })
    ));
    assert_eq!(failure.to_string(), error.to_string());
    let core = failure
        .source()
        .unwrap()
        .downcast_ref::<InspectionError>()
        .unwrap();
    assert!(std::ptr::eq(core, error));
    let input = core.source().unwrap().downcast_ref::<InputError>().unwrap();
    let provider = input
        .source()
        .unwrap()
        .downcast_ref::<SourceError>()
        .unwrap();
    let source = provider
        .source()
        .unwrap()
        .downcast_ref::<Failure>()
        .unwrap();
    assert_eq!(source.operation(), Some(TransportOperation::Receive));
    assert_eq!(
        source
            .source()
            .unwrap()
            .downcast_ref::<io::Error>()
            .unwrap()
            .raw_os_error(),
        Some(13)
    );
    assert!(matches!(
        observed.borrow().requests.as_slice(),
        [
            Request::CurrentSelection,
            Request::ByteLength { .. },
            Request::ReadAt { .. }
        ]
    ));
}
