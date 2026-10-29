use crate::{
    Failure, FailureKind, InspectionFailure, Session, StepKind, Transport, TransportOperation,
};
use binary_inspection::{
    InspectionError,
    input::{InputError, SourceError},
};
use filesystem_protocol::{
    ProtocolError, ProtocolErrorKind, Request, Response, SelectedResource, SelectionState,
    decode_request, encode_response,
};
use std::{cell::RefCell, collections::VecDeque, error::Error, io, rc::Rc};

fn resource() -> String {
    "a".repeat(64)
}

#[derive(Default)]
struct Observed {
    requests: Vec<Request>,
    resets: usize,
}

struct Replies {
    replies: VecDeque<Result<Vec<u8>, Failure>>,
    observed: Rc<RefCell<Observed>>,
}

impl Transport for Replies {
    fn exchange(&mut self, bytes: Vec<u8>) -> Result<Vec<u8>, Failure> {
        self.observed
            .borrow_mut()
            .requests
            .push(decode_request(&bytes).unwrap());
        self.replies.pop_front().expect("unexpected exchange")
    }

    fn reset(&mut self) {
        self.observed.borrow_mut().resets += 1;
    }
}

fn session(
    replies: impl IntoIterator<Item = Result<Vec<u8>, Failure>>,
) -> (Session, Rc<RefCell<Observed>>) {
    let observed = Rc::new(RefCell::new(Observed::default()));
    let transport = Replies {
        replies: replies.into_iter().collect(),
        observed: observed.clone(),
    };
    (Session::new(Box::new(transport)), observed)
}

fn reply(response: Response) -> Result<Vec<u8>, Failure> {
    Ok(encode_response(&response).unwrap())
}

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
    let mismatch = session.byte_length(&resource()).unwrap_err();
    assert_eq!(mismatch.kind, FailureKind::Transport);
    assert_eq!(
        mismatch.protocol_error().unwrap().kind(),
        ProtocolErrorKind::ResponseMismatch
    );
    assert!(mismatch.operation().is_none());
    assert!(mismatch.source().unwrap().is::<ProtocolError>());

    let backend = session.byte_length(&resource()).unwrap_err();
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
    let outcome = session.inspect(&resource());
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

fn directory(
    resource_byte: char,
    name: &str,
    parent: Option<(char, u32)>,
    entries: Vec<filesystem_data::DirectoryEntry>,
) -> filesystem_protocol::DirectoryListing {
    filesystem_protocol::DirectoryListing {
        directory: SelectedResource {
            name: name.into(),
            resource: resource_byte.to_string().repeat(64),
        },
        parent: parent.map(
            |(directory, entry_id)| filesystem_protocol::DirectoryEntryRef {
                directory: directory.to_string().repeat(64),
                entry_id,
            },
        ),
        entries,
    }
}

fn entry(
    id: u32,
    name: &str,
    kind: filesystem_data::DirectoryEntryKind,
) -> filesystem_data::DirectoryEntry {
    filesystem_data::DirectoryEntry {
        id,
        name: name.into(),
        kind,
    }
}

fn mounted(
    root: &filesystem_protocol::DirectoryListing,
    cursor: &filesystem_protocol::DirectoryListing,
) -> SelectionState {
    SelectionState {
        root: Some(root.directory.clone()),
        directory: Some(cursor.directory.clone()),
        entries: cursor.entries.clone(),
        ..SelectionState::default()
    }
}

#[test]
fn hydration_restores_file_ancestry_and_preserves_loaded_branches_within_a_mount() {
    use filesystem_data::DirectoryEntryKind::{Directory, File};
    let root = directory('a', "root", None, vec![entry(0, "child", Directory)]);
    let child = directory(
        'b',
        "child",
        Some(('a', 0)),
        vec![entry(1, "deep", Directory)],
    );
    let deep = directory(
        'c',
        "deep",
        Some(('b', 1)),
        vec![entry(2, "selected", File)],
    );
    let mut selected = mounted(&root, &deep);
    selected.scope = Some(filesystem_data::SelectionScope::Application);
    selected.file = Some(SelectedResource {
        name: "selected".into(),
        resource: "f".repeat(64),
    });
    selected.file_entry = Some(filesystem_protocol::DirectoryEntryRef {
        directory: deep.directory.resource.clone(),
        entry_id: 2,
    });
    let mut cursor_root = mounted(&root, &root);
    cursor_root.scope = selected.scope;
    let (mut client, _) = session([
        reply(Response::Selection(selected.clone())),
        reply(Response::Directory(root.clone())),
        reply(Response::Directory(deep.clone())),
        reply(Response::Directory(child.clone())),
        reply(Response::Selection(selected.clone())),
        reply(Response::Selection(cursor_root.clone())),
        reply(Response::Selection(cursor_root)),
    ]);

    let restored = client.current_selection().unwrap();
    assert_eq!(restored.scope, selected.scope);
    assert_eq!(restored.file, selected.file);
    assert_eq!(restored.file_entry, selected.file_entry);
    assert_eq!(restored.directories.len(), 3);
    assert!(restored.directories.contains(&child));
    assert!(restored.directories.contains(&deep));
    assert_eq!(
        client.current_selection().unwrap().directories,
        restored.directories
    );
}

#[test]
fn expansion_and_file_open_use_retained_parents_without_discarding_other_branches() {
    use filesystem_data::DirectoryEntryKind::{Directory, File};
    let root = directory(
        'a',
        "root",
        None,
        vec![entry(0, "child", Directory), entry(1, "root-file", File)],
    );
    let child = directory(
        'b',
        "child",
        Some(('a', 0)),
        vec![entry(1, "child-file", File)],
    );
    let mut initial = mounted(&root, &root);
    initial.file = Some(SelectedResource {
        name: "root-file".into(),
        resource: "e".repeat(64),
    });
    initial.file_entry = Some(filesystem_protocol::DirectoryEntryRef {
        directory: root.directory.resource.clone(),
        entry_id: 1,
    });
    let mut selected = mounted(&root, &child);
    selected.file = Some(SelectedResource {
        name: "child-file".into(),
        resource: "f".repeat(64),
    });
    selected.file_entry = Some(filesystem_protocol::DirectoryEntryRef {
        directory: child.directory.resource.clone(),
        entry_id: 1,
    });
    let (mut client, observed) = session([
        reply(Response::Selection(initial.clone())),
        reply(Response::Directory(root.clone())),
        reply(Response::Selection(initial.clone())),
        reply(Response::Directory(root.clone())),
        reply(Response::Directory(child.clone())),
        reply(Response::Selection(initial.clone())),
        reply(Response::Selection(initial.clone())),
        reply(Response::Selection(initial.clone())),
        reply(Response::Selection(initial.clone())),
        reply(Response::Directory(child.clone())),
        reply(Response::OpenedFile("f".repeat(64))),
        reply(Response::Selection(selected.clone())),
        reply(Response::Selection(selected.clone())),
    ]);

    let expanded = client.expand_directory(&root.directory.resource, 0);
    assert!(expanded.steps[0].result.is_ok());
    let projection = expanded.steps[1].result.as_ref().unwrap().as_ref().unwrap();
    assert_eq!(projection.file, initial.file);
    assert_eq!(projection.directory, initial.directory);
    assert_eq!(projection.directories, [root.clone(), child.clone()]);

    let opened = client.select_child(&child.directory.resource, 1, File);
    assert!(opened.steps[0].result.is_ok());
    let projection = opened.steps[1].result.as_ref().unwrap().as_ref().unwrap();
    assert_eq!(projection.file, selected.file);
    assert_eq!(projection.root, initial.root);
    assert_eq!(projection.directories, [root, child.clone()]);
    assert!(
        observed
            .borrow()
            .requests
            .contains(&Request::ListDirectory {
                resource: child.directory.resource
            })
    );
}

#[test]
fn replacement_during_hydration_never_publishes_a_mixed_mount() {
    let root = directory('a', "old", None, vec![]);
    let replacement = directory('b', "new", None, vec![]);
    let next = mounted(&replacement, &replacement);
    let (mut client, _) = session([
        reply(Response::Selection(mounted(&root, &root))),
        reply(Response::Directory(root)),
        reply(Response::Selection(next.clone())),
        reply(Response::Selection(next.clone())),
        reply(Response::Directory(replacement.clone())),
        reply(Response::Selection(next)),
    ]);
    assert!(client.current_selection().is_err());
    assert_eq!(
        client.current_selection().unwrap().directories,
        [replacement]
    );
}

#[test]
fn invalid_parent_membership_is_rejected_before_publication() {
    use filesystem_data::DirectoryEntryKind::Directory;
    let root = directory('a', "root", None, vec![entry(0, "child", Directory)]);
    let child = directory(
        'b',
        "child",
        Some(('c', 0)),
        vec![entry(0, "loop", Directory)],
    );
    let loop_parent = directory(
        'c',
        "loop",
        Some(('b', 0)),
        vec![entry(0, "child", Directory)],
    );
    let (mut client, _) = session([
        reply(Response::Selection(mounted(&root, &child))),
        reply(Response::Directory(root)),
        reply(Response::Directory(child)),
        reply(Response::Directory(loop_parent)),
    ]);
    assert!(client.current_selection().is_err());
}

#[test]
fn legacy_cursor_remains_usable_without_claiming_or_requesting_a_mount() {
    use filesystem_data::DirectoryEntryKind::Directory;
    let root = directory('a', "legacy", None, vec![entry(0, "child", Directory)]);
    let mut legacy = mounted(&root, &root);
    legacy.root = None;
    let (mut client, observed) = session([
        reply(Response::Selection(legacy.clone())),
        reply(Response::Selection(legacy.clone())),
        reply(Response::Selection(legacy)),
    ]);
    let state = client.current_selection().unwrap();
    assert!(state.root.is_none());
    assert!(state.directories.is_empty());
    let outcome = client.expand_directory(&root.directory.resource, 0);
    assert!(outcome.steps[0].result.is_err());
    assert!(outcome.steps[1].result.is_ok());
    assert!(
        observed
            .borrow()
            .requests
            .iter()
            .all(|request| matches!(request, Request::CurrentSelection))
    );
}

#[test]
fn failed_expansion_reports_failure_and_preserves_the_observed_selection() {
    use filesystem_data::DirectoryEntryKind::Directory;
    let root = directory('a', "root", None, vec![entry(0, "child", Directory)]);
    let state = mounted(&root, &root);
    let (mut client, observed) = session([
        reply(Response::Selection(state.clone())),
        reply(Response::Directory(root.clone())),
        reply(Response::Selection(state.clone())),
        reply(Response::Directory(root.clone())),
        reply(Response::Failed(filesystem_protocol::FileError::Io {
            message: "child is unavailable".into(),
        })),
        reply(Response::Selection(state.clone())),
        reply(Response::Selection(state.clone())),
    ]);
    let outcome = client.expand_directory(&root.directory.resource, 0);
    assert!(outcome.steps[0].result.is_err());
    let projection = outcome.steps[1].result.as_ref().unwrap().as_ref().unwrap();
    assert_eq!(projection.root, state.root);
    assert_eq!(projection.directory, state.directory);
    assert_eq!(projection.directories, [root]);
    assert_eq!(
        observed
            .borrow()
            .requests
            .iter()
            .filter(|request| matches!(request, Request::ExpandDirectory { .. }))
            .count(),
        1
    );
}

#[test]
fn scoped_pickers_reject_legacy_owners_without_sending_unknown_requests() {
    for application in [true, false] {
        let (mut client, observed) = session([
            reply(Response::Selection(SelectionState::default())),
            reply(Response::Selection(SelectionState::default())),
        ]);
        let outcome = if application {
            client.select_application()
        } else {
            client.select_binary()
        };
        assert!(
            outcome.steps[0]
                .result
                .as_ref()
                .unwrap_err()
                .to_string()
                .contains("Update Native Workbench")
        );
        assert!(outcome.steps[1].result.is_ok());
        assert!(
            observed
                .borrow()
                .requests
                .iter()
                .all(|request| matches!(request, Request::CurrentSelection))
        );
    }
}

#[test]
fn a_new_empty_owner_can_select_a_binary_subject_without_guessing_from_its_name() {
    use filesystem_data::SelectionScope;
    let empty = SelectionState {
        scope: Some(SelectionScope::Empty),
        ..SelectionState::default()
    };
    let file = SelectedResource {
        name: "opaque-name".into(),
        resource: "f".repeat(64),
    };
    let selected = SelectionState {
        scope: Some(SelectionScope::Binary),
        file: Some(file.clone()),
        ..SelectionState::default()
    };
    let (mut client, observed) = session([
        reply(Response::Selection(empty)),
        reply(Response::SelectedBinary(Some(file.clone()))),
        reply(Response::Selection(selected)),
    ]);
    let outcome = client.select_binary();
    assert!(outcome.steps[0].result.is_ok());
    let state = outcome.steps[1].result.as_ref().unwrap().as_ref().unwrap();
    assert_eq!(state.scope, Some(SelectionScope::Binary));
    assert_eq!(state.file, Some(file));
    assert!(state.root.is_none());
    assert!(
        observed
            .borrow()
            .requests
            .iter()
            .any(|request| matches!(request, Request::ChooseBinary))
    );
}

#[test]
fn cancelled_application_selection_keeps_the_observed_subject() {
    use filesystem_data::SelectionScope;
    let existing = SelectionState {
        scope: Some(SelectionScope::File),
        file: Some(SelectedResource {
            name: "existing".into(),
            resource: "e".repeat(64),
        }),
        ..SelectionState::default()
    };
    let (mut client, _) = session([
        reply(Response::Selection(existing.clone())),
        reply(Response::SelectedApplication(None)),
        reply(Response::Selection(existing.clone())),
    ]);
    let outcome = client.select_application();
    assert!(outcome.steps[0].result.is_ok());
    let state = outcome.steps[1].result.as_ref().unwrap().as_ref().unwrap();
    assert_eq!(state.scope, existing.scope);
    assert_eq!(state.file, existing.file);
}

#[test]
fn inconsistent_scope_and_resource_shapes_are_rejected_before_hydration() {
    use filesystem_data::SelectionScope;
    let file = SelectedResource {
        name: "file".into(),
        resource: "f".repeat(64),
    };
    for state in [
        SelectionState {
            scope: Some(SelectionScope::Empty),
            file: Some(file.clone()),
            ..SelectionState::default()
        },
        SelectionState {
            scope: Some(SelectionScope::Binary),
            ..SelectionState::default()
        },
        SelectionState {
            scope: Some(SelectionScope::Application),
            file: Some(file),
            ..SelectionState::default()
        },
    ] {
        let (mut client, observed) = session([reply(Response::Selection(state))]);
        assert!(client.current_selection().is_err());
        assert_eq!(observed.borrow().requests.len(), 1);
    }
}
