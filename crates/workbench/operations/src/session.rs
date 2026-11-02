use crate::{Failure, Outcome, StepOutcome, Transport};
use filesystem_data::DirectoryEntryKind;
use filesystem_protocol::{
    FileError, Request, Response, SelectionState, check_response_matches_request, decode_response,
    encode_request,
};

/// Identifies a completed filesystem-client action.
#[repr(u8)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StepKind {
    /// Request native file selection.
    SelectFile,
    /// Request native directory selection.
    SelectDirectory,
    /// Open an entry from a retained directory listing.
    OpenEntry,
    /// Query the native owner's retained selection.
    QuerySelection,
    /// Validate and analyze a retained file.
    Inspect,
}

/// An identified selection-related step and its original result.
///
/// Successful actions return `None`; successful queries return `Some(state)`,
/// including a state with no selected file or directory.
pub type SelectionStepOutcome = StepOutcome<StepKind, Option<SelectionState>, Failure>;

/// Completed selection-related steps in execution order.
///
/// Selection methods return the requested action followed by a query, even when
/// the action fails. A lost reply may hide a successful replacement; the action
/// is never replayed. Another caller may replace selection before the query.
/// Neither step has an application deadline. Each must complete or fail before
/// this outcome returns. A standalone query returns only its own step.
pub type SelectionOutcome = Outcome<SelectionStepOutcome>;

/// A transport-backed client of the native selection owner.
///
/// This client does not own the native selection. Dropping it releases its
/// transport. Successful replacement or owner shutdown releases native resources.
/// Filesystem requests have no application deadline and may remain pending until
/// their transport completes or fails. Transport connection bounds are separate.
pub struct Session {
    transport: Box<dyn Transport>,
}

impl Session {
    /// Own a transport without sending a request or selecting a resource.
    pub fn new(transport: Box<dyn Transport>) -> Self {
        Self { transport }
    }

    fn request(&mut self, request: Request) -> Result<Response, Failure> {
        // 1. Validate and encode before touching the transport.
        let encoded_request = encode_request(&request).map_err(Failure::protocol)?;
        // 2. Exchange the encoded request once.
        let exchange_result = self.transport.exchange(encoded_request);
        // 3. Decode returned bytes; preserve any transport failure for the reset step.
        let decoded_response_result = match exchange_result {
            Ok(response_bytes) => decode_response(&response_bytes).map_err(Failure::protocol),
            Err(error) => Err(error),
        };
        // 4. Validate the response against the request; preserve any earlier failure.
        let matched_response_result = match decoded_response_result {
            Ok(response) => {
                let response_match_result =
                    check_response_matches_request(&request, &response).map_err(Failure::protocol);
                match response_match_result {
                    Ok(()) => Ok(response),
                    Err(error) => Err(error),
                }
            }
            Err(error) => Err(error),
        };
        // 5. If exchange or reply processing failed, reset before returning.
        let response = match matched_response_result {
            Ok(response) => response,
            Err(error) => {
                self.transport.reset();
                return Err(error);
            }
        };
        // 6. A valid provider failure is an operation result; keep the connection.
        match response {
            Response::Failed(FileError::Cancelled) => {
                Err(Failure::provider("The filesystem operation was cancelled."))
            }
            Response::Failed(FileError::Io { message }) => Err(Failure::provider(message)),
            response => Ok(response),
        }
    }

    /// Query the native owner's current selection without changing it.
    ///
    /// An empty successful result confirms that nothing is selected. An error
    /// leaves the state unknown; it must not be interpreted as an empty selection.
    ///
    /// # Errors
    /// Returns transport, protocol or provider failures from the query.
    pub fn current_selection(&mut self) -> Result<SelectionState, Failure> {
        let response = self.request(Request::CurrentSelection)?;
        let Response::Selection(state) = response else {
            unreachable!("response was validated against its request");
        };
        Ok(state)
    }

    /// Query selection and return its result as one completed step.
    ///
    /// Query failure is preserved in the step rather than interpreted as an
    /// empty selection. This does not open a dialog or replace native resources.
    pub fn query_selection(&mut self) -> SelectionOutcome {
        let selection_query_result = self.current_selection().map(Some);
        Outcome {
            steps: vec![StepOutcome {
                kind: StepKind::QuerySelection,
                result: selection_query_result,
            }],
        }
    }

    /// Ask the native owner to show its file picker, then query selection.
    ///
    /// Closing or cancelling the picker leaves the existing selection unchanged.
    /// The action succeeds; the follow-up query reports selection or its own failure.
    /// See [`SelectionOutcome`] for ordering and independent failure behavior.
    pub fn select_file(&mut self) -> SelectionOutcome {
        self.select(Request::ChooseFile, StepKind::SelectFile)
    }

    /// Ask the native owner to show its folder picker, then query selection.
    ///
    /// Uses the same dismissal behavior and result ordering as [`Self::select_file`].
    pub fn select_directory(&mut self) -> SelectionOutcome {
        self.select(Request::ChooseFolder, StepKind::SelectDirectory)
    }

    fn select(&mut self, request: Request, kind: StepKind) -> SelectionOutcome {
        let result = self.request(request).map(|_| ());
        self.finish_selection(kind, result)
    }

    /// Select a file or directory from the native owner's captured listing.
    ///
    /// First queries selection and checks the directory identifier, entry identifier
    /// and entry kind. The service independently checks the request when acquiring
    /// the resource; the earlier query cannot prevent another client replacing it.
    /// A final query is attempted even if validation or acquisition fails.
    /// Symlinks and other entry kinds are rejected without an acquisition request.
    pub fn select_child(
        &mut self,
        directory: &str,
        entry_id: u32,
        kind: DirectoryEntryKind,
    ) -> SelectionOutcome {
        let result = self.acquire_child(directory, entry_id, kind);
        self.finish_selection(StepKind::OpenEntry, result)
    }

    fn acquire_child(
        &mut self,
        directory: &str,
        entry_id: u32,
        kind: DirectoryEntryKind,
    ) -> Result<(), Failure> {
        let state = self.current_selection()?;
        if state
            .directory
            .as_ref()
            .map(|value| value.resource.as_str())
            != Some(directory)
        {
            return Err(Failure::precondition(
                "The directory is no longer selected.",
            ));
        }
        if !state
            .entries
            .iter()
            .any(|entry| entry.id == entry_id && entry.kind == kind)
        {
            return Err(Failure::precondition(
                "The entry is not in the observed directory.",
            ));
        }
        let request = match kind {
            DirectoryEntryKind::File => Request::OpenFile {
                resource: directory.into(),
                entry_id,
            },
            DirectoryEntryKind::Directory => Request::OpenDirectory {
                resource: directory.into(),
                entry_id,
            },
            DirectoryEntryKind::Symlink | DirectoryEntryKind::Other => {
                return Err(Failure::precondition(
                    "The entry cannot be opened as a file or directory.",
                ));
            }
        };
        self.request(request).map(|_| ())
    }

    fn finish_selection(
        &mut self,
        kind: StepKind,
        result: Result<(), Failure>,
    ) -> SelectionOutcome {
        let action_step = StepOutcome {
            kind,
            result: result.map(|()| None),
        };
        let selection_query_result = self.current_selection().map(Some);
        Outcome {
            steps: vec![
                action_step,
                StepOutcome {
                    kind: StepKind::QuerySelection,
                    result: selection_query_result,
                },
            ],
        }
    }

    pub(crate) fn ensure_file(&mut self, resource: &str) -> Result<(), Failure> {
        let state = self.current_selection()?;
        if state.file.as_ref().map(|value| value.resource.as_str()) != Some(resource) {
            return Err(Failure::precondition("The file is no longer selected."));
        }
        Ok(())
    }

    /// Query the retained file's length without reading its contents.
    ///
    /// # Errors
    /// Returns transport, protocol or provider failures, including a resource
    /// identifier that is no longer active.
    pub fn byte_length(&mut self, resource: &str) -> Result<u64, Failure> {
        let request = Request::ByteLength {
            resource: resource.into(),
        };
        let response = self.request(request)?;
        let Response::ByteLength(length) = response else {
            unreachable!("response was validated against its request");
        };
        Ok(length)
    }

    /// Request up to `length` bytes at `offset` from the retained file.
    ///
    /// A successful response may be shorter than requested because of provider
    /// response sizing or EOF. Callers needing the full range advance by the
    /// returned byte count. For a nonzero request, an empty response means EOF;
    /// stop and treat the remaining range as incomplete instead of retrying.
    ///
    /// # Errors
    /// Rejects invalid resource identifiers and offset/length overflow before
    /// sending. Also returns transport, response-validation and provider failures,
    /// including an identifier that is no longer active.
    pub fn read_at(
        &mut self,
        resource: &str,
        offset: u64,
        length: u32,
    ) -> Result<Vec<u8>, Failure> {
        let request = Request::ReadAt {
            resource: resource.into(),
            offset,
            length,
        };
        let response = self.request(request)?;
        let Response::Read(bytes) = response else {
            unreachable!("response was validated against its request");
        };
        Ok(bytes)
    }
}
