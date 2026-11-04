//! Component export facade for native filesystem sessions.
//!
//! Ordinary Rust APIs own operation semantics; this module converts their results.

use crate::{Component, conversion, exports::native as wire, inspection_error, websocket};
use filesystem_data::DirectoryEntryKind;
use std::cell::RefCell;
use workbench_operations as client;

pub struct NativeSession {
    /// Filesystem client owned by this component resource. `RefCell` permits
    /// mutable client calls from WIT methods receiving `&self`.
    session: RefCell<client::Session>,
}
impl wire::Guest for Component {
    type Session = NativeSession;
    fn create_selection_session() -> wire::Session {
        let transport = websocket::transport();
        let session = client::Session::new(transport);
        wire::Session::new(NativeSession {
            session: RefCell::new(session),
        })
    }
}
impl wire::GuestSession for NativeSession {
    fn query_selection(&self) -> wire::SelectionOutcome {
        let outcome = self.session.borrow_mut().query_selection();
        selection_outcome(outcome)
    }
    fn choose_file(&self) -> wire::SelectionOutcome {
        let outcome = self.session.borrow_mut().select_file();
        selection_outcome(outcome)
    }
    fn choose_folder(&self) -> wire::SelectionOutcome {
        let outcome = self.session.borrow_mut().select_directory();
        selection_outcome(outcome)
    }
    fn open_file(&self, directory: String, entry_id: u32) -> wire::SelectionOutcome {
        let outcome =
            self.session
                .borrow_mut()
                .select_child(&directory, entry_id, DirectoryEntryKind::File);
        selection_outcome(outcome)
    }
    fn open_directory(&self, directory: String, entry_id: u32) -> wire::SelectionOutcome {
        let outcome = self.session.borrow_mut().select_child(
            &directory,
            entry_id,
            DirectoryEntryKind::Directory,
        );
        selection_outcome(outcome)
    }
    fn inspect(&self, resource: String) -> wire::InspectionOutcome {
        let outcome = self.session.borrow_mut().inspect(&resource);
        wire::InspectionOutcome {
            steps: outcome
                .steps
                .into_iter()
                .map(|step| wire::InspectionStepOutcome {
                    kind: step.kind,
                    result: step
                        .result
                        .map(conversion::report)
                        .map_err(inspection_failure),
                })
                .collect(),
        }
    }
}
fn selection_outcome(value: client::SelectionOutcome) -> wire::SelectionOutcome {
    wire::SelectionOutcome {
        steps: value
            .steps
            .into_iter()
            .map(|step| wire::SelectionStepOutcome {
                kind: step.kind,
                result: step.result.map_err(failure),
            })
            .collect(),
    }
}
fn inspection_failure(error: client::InspectionFailure) -> wire::InspectionFailure {
    // Format before conversion to retain the ordinary Rust error's full context.
    let message = error.to_string();
    let details = match error {
        client::InspectionFailure::Selection(error) => {
            let failure_cause = inspection_error::client_failure(error);
            let detail = inspection_error::selection(failure_cause);
            vec![detail]
        }
        client::InspectionFailure::Metadata(error) => {
            let failure_cause = inspection_error::client_failure(error);
            let detail = inspection_error::byte_length(failure_cause);
            vec![detail]
        }
        client::InspectionFailure::Inspection(error) => inspection_error::inspection(error),
    };
    wire::InspectionFailure { message, details }
}
fn failure(error: client::Failure) -> wire::Failure {
    let message = error.to_string();
    wire::Failure {
        kind: error.kind,
        message,
    }
}
