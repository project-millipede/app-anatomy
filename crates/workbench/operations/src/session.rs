use crate::{Failure, Outcome, StepOutcome, Transport};
use filesystem_data::{DirectoryEntry, DirectoryEntryKind, SelectionScope};
use filesystem_protocol::{
    DirectoryEntryRef, DirectoryListing, FileError, Request, Response, SelectedResource,
    SelectionState as NativeSelectionState, decode_response, encode_request, validate_response,
};
use serde::Serialize;
use std::collections::HashSet;

/// A bounded observation of native selection and this client's loaded directory snapshots.
/// The native owner retains resources; this projection never contains native paths.
#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
pub struct SelectionState {
    pub file: Option<SelectedResource>,
    pub scope: Option<SelectionScope>,
    pub directory: Option<SelectedResource>,
    pub entries: Vec<DirectoryEntry>,
    pub root: Option<SelectedResource>,
    pub file_entry: Option<DirectoryEntryRef>,
    pub directories: Vec<DirectoryListing>,
}

const MAX_LOADED_DIRECTORIES: usize = 64;

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
    /// Load a child listing without changing the native file or directory cursor.
    ExpandDirectory,
    /// Select and validate an application bundle as the inspection subject.
    SelectApplication,
    /// Select and validate a Mach-O file as the inspection subject.
    SelectBinary,
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
    root: Option<String>,
    directories: Vec<DirectoryListing>,
}

impl Session {
    /// Own a transport without sending a request or selecting a resource.
    pub fn new(transport: Box<dyn Transport>) -> Self {
        Self {
            transport,
            root: None,
            directories: Vec::new(),
        }
    }

    fn request(&mut self, request: Request) -> Result<Response, Failure> {
        // 1. Validate and encode before touching the transport.
        let bytes = encode_request(&request).map_err(Failure::protocol)?;
        // 2. Exchange once, then decode and validate the reply against this request.
        let result = self
            .transport
            .exchange(bytes)
            .and_then(|bytes| decode_response(&bytes).map_err(Failure::protocol))
            .and_then(|response| {
                validate_response(&request, &response).map_err(Failure::protocol)?;
                Ok(response)
            });
        // 3. If exchange or reply processing failed, reset before returning.
        let response = match result {
            Ok(response) => response,
            Err(error) => {
                self.transport.reset();
                return Err(error);
            }
        };
        // 4. A valid provider failure is an operation result; keep the connection.
        match response {
            Response::Failed(FileError::Cancelled) => {
                Err(Failure::provider("The filesystem operation was cancelled."))
            }
            Response::Failed(FileError::Io { message }) => Err(Failure::provider(message)),
            response => Ok(response),
        }
    }

    fn observe_selection(&mut self) -> Result<NativeSelectionState, Failure> {
        let Response::Selection(state) = self.request(Request::CurrentSelection)? else {
            unreachable!("response was validated against its request");
        };
        validate_scope(&state)?;
        let root = state.root.as_ref().map(|root| root.resource.clone());
        if self.root != root {
            self.directories.clear();
            self.root = root;
        }
        Ok(state)
    }

    fn list_directory(&mut self, resource: &str) -> Result<DirectoryListing, Failure> {
        let Response::Directory(listing) = self.request(Request::ListDirectory {
            resource: resource.into(),
        })?
        else {
            unreachable!("response was validated against its request");
        };
        Ok(listing)
    }

    /// Load missing ancestors, with a client-side bound independent of the provider.
    fn load_chain(
        &mut self,
        directories: &mut Vec<DirectoryListing>,
        resource: &str,
    ) -> Result<(), Failure> {
        let mut current = resource.to_owned();
        let mut visited = HashSet::new();
        while !directories
            .iter()
            .any(|item| item.directory.resource == current)
        {
            if !visited.insert(current.clone()) || directories.len() >= MAX_LOADED_DIRECTORIES {
                return Err(Failure::precondition(
                    "The native directory hierarchy exceeds its bound or contains a cycle.",
                ));
            }
            let listing = self.list_directory(&current)?;
            let parent = listing
                .parent
                .as_ref()
                .map(|parent| parent.directory.clone());
            directories.push(listing);
            let Some(parent) = parent else { break };
            current = parent;
        }
        Ok(())
    }

    /// Query selection and hydrate its root, cursor and selected-file ancestry.
    ///
    /// Loaded snapshots survive within the same mount. A changed root invalidates
    /// them. The follow-up observation rejects replacement during hydration rather
    /// than publishing a mixture of two native selections.
    ///
    /// # Errors
    /// Returns transport/provider errors or inconsistent, cyclic or oversized hierarchy data.
    pub fn current_selection(&mut self) -> Result<SelectionState, Failure> {
        let state = self.observe_selection()?;
        let mut directories = self.directories.clone();
        if let Some(root) = &state.root {
            self.load_chain(&mut directories, &root.resource)?;
            if let Some(cursor) = &state.directory {
                self.load_chain(&mut directories, &cursor.resource)?;
            }
            if let Some(origin) = &state.file_entry {
                self.load_chain(&mut directories, &origin.directory)?;
            }
            validate_directories(&directories, root)?;
            let cursor = state
                .directory
                .as_ref()
                .ok_or_else(|| Failure::precondition("A mounted root has no directory cursor."))?;
            let listing = directories
                .iter()
                .find(|item| item.directory == *cursor)
                .ok_or_else(|| {
                    Failure::precondition("The directory cursor is not in the mounted hierarchy.")
                })?;
            if listing.entries != state.entries {
                return Err(Failure::precondition(
                    "The directory cursor does not match its captured listing.",
                ));
            }
            if let Some(origin) = &state.file_entry {
                let entry = directories
                    .iter()
                    .find(|item| item.directory.resource == origin.directory)
                    .and_then(|listing| {
                        listing
                            .entries
                            .iter()
                            .find(|entry| entry.id == origin.entry_id)
                    });
                if !matches!((entry, &state.file), (Some(entry), Some(file)) if entry.kind == DirectoryEntryKind::File && entry.name == file.name)
                {
                    return Err(Failure::precondition(
                        "The selected file is not in its recorded parent listing.",
                    ));
                }
            } else if state.file.is_some() {
                return Err(Failure::precondition(
                    "A mounted file has no recorded parent entry.",
                ));
            }
            if self.observe_selection()? != state {
                return Err(Failure::precondition(
                    "Native selection changed during directory hydration.",
                ));
            }
        } else if (state.directory.is_none() && !state.entries.is_empty())
            || state.file_entry.is_some()
        {
            return Err(Failure::precondition(
                "Native directory state has no mounted root.",
            ));
        }
        self.directories = directories;
        Ok(SelectionState {
            scope: state.scope,
            file: state.file,
            directory: state.directory,
            entries: state.entries,
            root: state.root,
            file_entry: state.file_entry,
            directories: self.directories.clone(),
        })
    }

    /// Query selection and return its result as one completed step.
    ///
    /// Query failure is preserved in the step rather than interpreted as an
    /// empty selection. This does not open a dialog or replace native resources.
    pub fn query_selection(&mut self) -> SelectionOutcome {
        Outcome {
            steps: vec![StepOutcome {
                kind: StepKind::QuerySelection,
                result: self.current_selection().map(Some),
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

    /// Ask the native owner to select and validate an application bundle.
    /// Older owners are rejected before receiving an unsupported picker request.
    pub fn select_application(&mut self) -> SelectionOutcome {
        self.select_subject(Request::ChooseApplication, StepKind::SelectApplication)
    }

    /// Ask the native owner to select and validate a standalone Mach-O binary.
    /// Older owners are rejected before receiving an unsupported picker request.
    pub fn select_binary(&mut self) -> SelectionOutcome {
        self.select_subject(Request::ChooseBinary, StepKind::SelectBinary)
    }

    fn select_subject(&mut self, request: Request, kind: StepKind) -> SelectionOutcome {
        let result = self.observe_selection().and_then(|state| {
            if state.scope.is_none() {
                return Err(Failure::precondition(
                    "Update Native Workbench to open an application or binary as the inspection subject.",
                ));
            }
            self.request(request).map(|_| ())
        });
        self.finish_selection(kind, result)
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
        let listing = self.parent_listing(directory)?;
        if !listing
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

    fn parent_listing(&mut self, resource: &str) -> Result<DirectoryListing, Failure> {
        let state = self.current_selection()?;
        let Some(root) = state.root else {
            // Older services expose one cursor but no persistent mount. Preserve
            // their existing navigation without claiming a mounted hierarchy.
            let cursor = state
                .directory
                .filter(|cursor| cursor.resource == resource)
                .ok_or_else(|| Failure::precondition("The directory is no longer selected."))?;
            return Ok(DirectoryListing {
                directory: cursor,
                parent: None,
                entries: state.entries,
            });
        };
        // Query the retained parent, rather than restricting actions to the cursor.
        let listing = self.list_directory(resource)?;
        let mut directories = self.directories.clone();
        retain_listing(&mut directories, listing.clone())?;
        if let Some(parent) = &listing.parent {
            self.load_chain(&mut directories, &parent.directory)?;
        }
        validate_directories(&directories, &root)?;
        self.directories = directories;
        Ok(listing)
    }

    /// Load one child listing, preserving the current file and listing cursor.
    /// Returns the action result and a fresh Rust-composed selection projection.
    pub fn expand_directory(&mut self, directory: &str, entry_id: u32) -> SelectionOutcome {
        let result = self.expand_child(directory, entry_id);
        self.finish_selection(StepKind::ExpandDirectory, result)
    }

    fn expand_child(&mut self, directory: &str, entry_id: u32) -> Result<(), Failure> {
        let parent = self.parent_listing(directory)?;
        if self.root.is_none() {
            return Err(Failure::precondition(
                "This native service does not expose a mounted folder. Update Native Workbench to expand directories.",
            ));
        }
        if !parent
            .entries
            .iter()
            .any(|entry| entry.id == entry_id && entry.kind == DirectoryEntryKind::Directory)
        {
            return Err(Failure::precondition(
                "The entry is not a directory in the observed listing.",
            ));
        }
        let Response::Directory(listing) = self.request(Request::ExpandDirectory {
            resource: directory.into(),
            entry_id,
        })?
        else {
            unreachable!("response was validated against its request");
        };
        let mut directories = self.directories.clone();
        retain_listing(&mut directories, listing)?;
        let root = directories
            .iter()
            .find(|item| Some(&item.directory.resource) == self.root.as_ref())
            .ok_or_else(|| Failure::precondition("The mounted root is unavailable."))?
            .directory
            .clone();
        validate_directories(&directories, &root)?;
        self.directories = directories;
        Ok(())
    }

    fn finish_selection(
        &mut self,
        kind: StepKind,
        result: Result<(), Failure>,
    ) -> SelectionOutcome {
        Outcome {
            steps: vec![
                StepOutcome {
                    kind,
                    result: result.map(|()| None),
                },
                StepOutcome {
                    kind: StepKind::QuerySelection,
                    result: self.current_selection().map(Some),
                },
            ],
        }
    }

    pub(crate) fn ensure_file(&mut self, resource: &str) -> Result<(), Failure> {
        let state = self.observe_selection()?;
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
        let Response::ByteLength(length) = self.request(Request::ByteLength {
            resource: resource.into(),
        })?
        else {
            unreachable!("response was validated against its request");
        };
        Ok(length)
    }

    /// Request up to `length` bytes at `offset` from the retained file.
    ///
    /// A successful response may be shorter than requested, including at EOF.
    ///
    /// # Errors
    /// Rejects invalid resource identifiers, oversized requests and offset/length
    /// overflow before sending. Also returns transport, response-validation and
    /// provider failures, including an identifier that is no longer active.
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
        let Response::Read(bytes) = self.request(request)? else {
            unreachable!("response was validated against its request");
        };
        Ok(bytes)
    }
}

fn retain_listing(
    directories: &mut Vec<DirectoryListing>,
    listing: DirectoryListing,
) -> Result<(), Failure> {
    if let Some(existing) = directories
        .iter()
        .find(|item| item.directory.resource == listing.directory.resource)
    {
        if *existing != listing {
            return Err(Failure::precondition(
                "A retained directory snapshot changed identity or contents.",
            ));
        }
    } else {
        if directories.len() >= MAX_LOADED_DIRECTORIES {
            return Err(Failure::precondition(
                "The mounted directory cache exceeds its 64-directory bound.",
            ));
        }
        directories.push(listing);
    }
    Ok(())
}

fn validate_directories(
    directories: &[DirectoryListing],
    root: &SelectedResource,
) -> Result<(), Failure> {
    let invalid = || {
        Failure::precondition(
            "The native directory hierarchy is not a bounded tree rooted at the selected folder.",
        )
    };
    if directories.len() > MAX_LOADED_DIRECTORIES {
        return Err(invalid());
    }
    let mut children = HashSet::new();
    for listing in directories {
        let mut current = listing;
        let mut visited = HashSet::new();
        loop {
            if !visited.insert(current.directory.resource.as_str()) {
                return Err(invalid());
            }
            if current.directory.resource == root.resource {
                if current.directory != *root || current.parent.is_some() {
                    return Err(invalid());
                }
                break;
            }
            let parent = current.parent.as_ref().ok_or_else(invalid)?;
            let owner = directories
                .iter()
                .find(|item| item.directory.resource == parent.directory)
                .ok_or_else(invalid)?;
            if !owner.entries.iter().any(|entry| {
                entry.id == parent.entry_id
                    && entry.kind == DirectoryEntryKind::Directory
                    && entry.name == current.directory.name
            }) {
                return Err(invalid());
            }
            current = owner;
        }
        if let Some(parent) = &listing.parent
            && !children.insert((parent.directory.as_str(), parent.entry_id))
        {
            return Err(invalid());
        }
    }
    Ok(())
}

/// Check scope independently of the provider and of legacy optional fields.
fn validate_scope(state: &NativeSelectionState) -> Result<(), Failure> {
    let valid = match state.scope {
        None => true,
        Some(SelectionScope::Empty) => {
            state.file.is_none()
                && state.directory.is_none()
                && state.root.is_none()
                && state.file_entry.is_none()
                && state.entries.is_empty()
        }
        Some(SelectionScope::File | SelectionScope::Binary) => {
            state.file.is_some()
                && state.directory.is_none()
                && state.root.is_none()
                && state.file_entry.is_none()
                && state.entries.is_empty()
        }
        Some(SelectionScope::Directory | SelectionScope::Application) => {
            state.root.is_some()
                && state.directory.is_some()
                && (state.file.is_some() == state.file_entry.is_some())
        }
    };
    if valid {
        Ok(())
    } else {
        Err(Failure::precondition(
            "The native selection scope does not match its retained resources.",
        ))
    }
}
