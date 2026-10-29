//! Shared, bounded filesystem messages for native and browser Wasm clients.
//!
//! Each WebSocket binary message contains one MessagePack request or response.
//! Serde preserves struct field and enum variant names; `serde_bytes` encodes file
//! contents as binary data. Client and service use the same message schema.

mod error;

pub use error::{ProtocolError, ProtocolErrorKind, ProtocolLimit};
use filesystem_data::DirectoryEntry;
use serde::{Deserialize, Serialize, de::DeserializeOwned};

pub const MAX_REQUEST_BYTES: u32 = 64 * 1024;
pub const MAX_REQUEST_MESSAGE_BYTES: usize = 1024;
// Includes one listing (512 entries / 64 KiB names) and bounded selection metadata.
pub const MAX_RESPONSE_MESSAGE_BYTES: usize = 96 * 1024;
const MAX_ERROR_MESSAGE_BYTES: usize = 4096;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum Request {
    ByteLength {
        resource: String,
    },
    ReadAt {
        resource: String,
        offset: u64,
        length: u32,
    },
    ChooseFile,
    ChooseFolder,
    CurrentSelection,
    OpenFile {
        resource: String,
        entry_id: u32,
    },
    OpenDirectory {
        resource: String,
        entry_id: u32,
    },
    ListDirectory {
        resource: String,
    },
    ExpandDirectory {
        resource: String,
        entry_id: u32,
    },
}

impl Request {
    pub fn resource(&self) -> Option<&str> {
        match self {
            Self::ByteLength { resource }
            | Self::ReadAt { resource, .. }
            | Self::OpenFile { resource, .. }
            | Self::OpenDirectory { resource, .. }
            | Self::ListDirectory { resource }
            | Self::ExpandDirectory { resource, .. } => Some(resource),
            Self::ChooseFile | Self::ChooseFolder | Self::CurrentSelection => None,
        }
    }
}

/// Display name and identity of a file or directory retained by the service.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SelectedResource {
    /// Human-readable name of the selected file or directory for presentation.
    pub name: String,
    /// Opaque service-issued identifier used in subsequent filesystem requests.
    pub resource: String,
}

/// A captured entry addressed through its retained parent directory.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct DirectoryEntryRef {
    pub directory: String,
    pub entry_id: u32,
}

/// One retained directory's captured immediate listing, without recursive children.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct DirectoryListing {
    pub directory: SelectedResource,
    pub parent: Option<DirectoryEntryRef>,
    pub entries: Vec<DirectoryEntry>,
}

/// An observation of the native owner's current selection.
/// The entries belong to the listing cursor `directory`. `root` remains stable
/// during lazy expansion and listed-file selection; external replacement invalidates it.
#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct SelectionState {
    pub file: Option<SelectedResource>,
    pub directory: Option<SelectedResource>,
    pub entries: Vec<DirectoryEntry>,
    #[serde(default)]
    pub root: Option<SelectedResource>,
    #[serde(default)]
    pub file_entry: Option<DirectoryEntryRef>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum Response {
    ByteLength(u64),
    Read(#[serde(with = "serde_bytes")] Vec<u8>),
    Failed(FileError),
    SelectedFile(Option<SelectedResource>),
    SelectedDirectory(Option<SelectedResource>),
    Selection(SelectionState),
    OpenedFile(String),
    OpenedDirectory(String),
    Directory(DirectoryListing),
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum FileError {
    Cancelled,
    Io { message: String },
}

pub fn validate_resource(resource: &str) -> Result<(), ProtocolError> {
    if resource.len() != 64
        || !resource
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(ProtocolError::validation(
            ProtocolErrorKind::InvalidResource {
                length: resource.len() as u64,
            },
            "resource must contain exactly 64 lowercase hexadecimal characters",
        ));
    }
    Ok(())
}

/// Validate a byte range before a selected resource or transport is available.
pub fn validate_read_range(offset: u64, length: u32) -> Result<(), ProtocolError> {
    enforce_limit(
        u64::from(length),
        u64::from(MAX_REQUEST_BYTES),
        ProtocolLimit::ReadRequestBytes,
        "read exceeds the size limit",
    )?;
    if offset.checked_add(u64::from(length)).is_none() {
        return Err(ProtocolError::validation(
            ProtocolErrorKind::RangeOverflow { offset, length },
            "read range overflows u64",
        ));
    }
    Ok(())
}

pub fn validate_request(request: &Request) -> Result<(), ProtocolError> {
    if let Some(resource) = request.resource() {
        validate_resource(resource)?;
    }
    if let Request::ReadAt { offset, length, .. } = request {
        validate_read_range(*offset, *length)?;
    }
    Ok(())
}

fn validate_response_fields(response: &Response) -> Result<(), ProtocolError> {
    match response {
        Response::Read(bytes) => {
            enforce_limit(
                bytes.len() as u64,
                u64::from(MAX_REQUEST_BYTES),
                ProtocolLimit::ReadResponseBytes,
                "read response exceeds the size limit",
            )?;
        }
        Response::Failed(FileError::Io { message }) => {
            enforce_limit(
                message.len() as u64,
                MAX_ERROR_MESSAGE_BYTES as u64,
                ProtocolLimit::ErrorMessageBytes,
                "error message exceeds the size limit",
            )?;
        }
        Response::SelectedFile(Some(selected)) | Response::SelectedDirectory(Some(selected)) => {
            validate_selected(selected)?;
        }
        Response::OpenedFile(resource) | Response::OpenedDirectory(resource) => {
            validate_resource(resource)?
        }
        Response::Selection(state) => {
            if let Some(selected) = &state.file {
                validate_selected(selected)?;
            }
            if let Some(selected) = &state.directory {
                validate_selected(selected)?;
            }
            if let Some(root) = &state.root {
                validate_selected(root)?;
            }
            if let Some(origin) = &state.file_entry {
                validate_entry_ref(origin)?;
            }
            validate_entries(&state.entries)?;
        }
        Response::Directory(listing) => {
            validate_selected(&listing.directory)?;
            if let Some(parent) = &listing.parent {
                validate_entry_ref(parent)?;
                if parent.directory == listing.directory.resource {
                    return Err(response_mismatch("directory cannot be its own parent"));
                }
            }
            validate_entries(&listing.entries)?;
        }
        Response::ByteLength(_)
        | Response::Failed(FileError::Cancelled)
        | Response::SelectedFile(None)
        | Response::SelectedDirectory(None) => {}
    }
    Ok(())
}

fn validate_entry_ref(entry: &DirectoryEntryRef) -> Result<(), ProtocolError> {
    validate_resource(&entry.directory)
}

fn response_mismatch(message: &'static str) -> ProtocolError {
    ProtocolError::validation(ProtocolErrorKind::ResponseMismatch, message)
}

fn validate_selected(selected: &SelectedResource) -> Result<(), ProtocolError> {
    validate_resource(&selected.resource)?;
    enforce_limit(
        selected.name.len() as u64,
        4096,
        ProtocolLimit::SelectionNameBytes,
        "selection name exceeds the size limit",
    )
}

fn validate_entries(entries: &[DirectoryEntry]) -> Result<(), ProtocolError> {
    enforce_limit(
        entries.len() as u64,
        512,
        ProtocolLimit::DirectoryEntries,
        "directory entry count exceeds the limit",
    )?;
    let mut names = 0_usize;
    let mut ids = std::collections::HashSet::new();
    for entry in entries {
        if !ids.insert(entry.id) {
            return Err(ProtocolError::validation(
                ProtocolErrorKind::DuplicateDirectoryEntry { id: entry.id },
                "duplicate directory entry id",
            ));
        }
        names = names.checked_add(entry.name.len()).ok_or_else(|| {
            ProtocolError::validation(
                ProtocolErrorKind::DirectoryNamesOverflow {
                    used: names as u64,
                    additional: entry.name.len() as u64,
                },
                "directory name size overflow",
            )
        })?;
        enforce_limit(
            names as u64,
            64 * 1024,
            ProtocolLimit::DirectoryNameBytes,
            "directory names exceed the size limit",
        )?;
    }
    Ok(())
}

/// Check that a response is valid for the request that is awaiting it.
pub fn validate_response(request: &Request, response: &Response) -> Result<(), ProtocolError> {
    validate_request(request)?;
    validate_response_fields(response)?;
    match (request, response) {
        (_, Response::Failed(_))
        | (Request::ByteLength { .. }, Response::ByteLength(_))
        | (Request::ChooseFile, Response::SelectedFile(_))
        | (Request::ChooseFolder, Response::SelectedDirectory(_))
        | (Request::CurrentSelection, Response::Selection(_))
        | (Request::OpenFile { .. }, Response::OpenedFile(_))
        | (Request::OpenDirectory { .. }, Response::OpenedDirectory(_)) => Ok(()),
        (Request::ListDirectory { resource }, Response::Directory(listing))
            if &listing.directory.resource == resource =>
        {
            Ok(())
        }
        (Request::ExpandDirectory { resource, entry_id }, Response::Directory(listing))
            if listing.parent.as_ref().is_some_and(|parent| {
                &parent.directory == resource && parent.entry_id == *entry_id
            }) =>
        {
            Ok(())
        }
        (Request::ReadAt { length, .. }, Response::Read(bytes)) => {
            enforce_limit(
                bytes.len() as u64,
                u64::from(*length),
                ProtocolLimit::RequestedReadBytes,
                "read response exceeds requested length",
            )?;
            Ok(())
        }
        _ => Err(ProtocolError::validation(
            ProtocolErrorKind::ResponseMismatch,
            "response does not match the pending request",
        )),
    }
}

pub fn encode_request(request: &Request) -> Result<Vec<u8>, ProtocolError> {
    validate_request(request)?;
    let bytes = rmp_serde::to_vec_named(request)
        .map_err(|source| ProtocolError::encode("request", source))?;
    enforce_limit(
        bytes.len() as u64,
        MAX_REQUEST_MESSAGE_BYTES as u64,
        ProtocolLimit::RequestMessageBytes,
        "request message exceeds the size limit",
    )?;
    Ok(bytes)
}

pub fn decode_request(bytes: &[u8]) -> Result<Request, ProtocolError> {
    let request = decode_message(
        bytes,
        MAX_REQUEST_MESSAGE_BYTES,
        ProtocolLimit::RequestMessageBytes,
    )?;
    validate_request(&request)?;
    Ok(request)
}

pub fn encode_response(response: &Response) -> Result<Vec<u8>, ProtocolError> {
    validate_response_fields(response)?;
    let bytes = rmp_serde::to_vec_named(response)
        .map_err(|source| ProtocolError::encode("response", source))?;
    enforce_limit(
        bytes.len() as u64,
        MAX_RESPONSE_MESSAGE_BYTES as u64,
        ProtocolLimit::ResponseMessageBytes,
        "response message exceeds the size limit",
    )?;
    Ok(bytes)
}

pub fn decode_response(bytes: &[u8]) -> Result<Response, ProtocolError> {
    let response = decode_message(
        bytes,
        MAX_RESPONSE_MESSAGE_BYTES,
        ProtocolLimit::ResponseMessageBytes,
    )?;
    validate_response_fields(&response)?;
    Ok(response)
}

fn decode_message<T: DeserializeOwned>(
    bytes: &[u8],
    limit: usize,
    resource: ProtocolLimit,
) -> Result<T, ProtocolError> {
    // Bound the input before decoding owned fields.
    enforce_limit(
        bytes.len() as u64,
        limit as u64,
        resource,
        "message exceeds the size limit",
    )?;
    let mut decoder = rmp_serde::Deserializer::new(bytes);
    decoder.set_max_depth(32);
    let message = T::deserialize(&mut decoder).map_err(ProtocolError::decode)?;
    // Read for &[u8] advances the reader to the unconsumed suffix.
    if !decoder.get_ref().is_empty() {
        return Err(ProtocolError::validation(
            ProtocolErrorKind::TrailingBytes {
                remaining: decoder.get_ref().len() as u64,
            },
            "trailing bytes after filesystem message",
        ));
    }
    Ok(message)
}

fn enforce_limit(
    actual: u64,
    limit: u64,
    resource: ProtocolLimit,
    message: &'static str,
) -> Result<(), ProtocolError> {
    if actual > limit {
        return Err(ProtocolError::validation(
            ProtocolErrorKind::LimitExceeded {
                resource,
                limit,
                actual,
            },
            message,
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use filesystem_data::DirectoryEntryKind;
    use std::error::Error;

    fn resource() -> String {
        "0123456789abcdef".repeat(4)
    }

    fn selection_with_entries(entries: Vec<DirectoryEntry>) -> Response {
        Response::Selection(SelectionState {
            directory: Some(SelectedResource {
                name: "directory".into(),
                resource: resource(),
            }),
            entries,
            ..SelectionState::default()
        })
    }

    fn read_request(offset: u64, length: u32) -> Request {
        Request::ReadAt {
            resource: resource(),
            offset,
            length,
        }
    }

    #[test]
    fn preserves_full_size_binary_payload() {
        let bytes = (0..MAX_REQUEST_BYTES).map(|value| value as u8).collect();
        let response = Response::Read(bytes);
        let encoded = encode_response(&response).unwrap();
        // Binary encoding adds little overhead, even for bytes above 127.
        assert!(encoded.len() < MAX_REQUEST_BYTES as usize + 32);
        assert!(encoded.len() <= MAX_RESPONSE_MESSAGE_BYTES);
        assert_eq!(decode_response(&encoded).unwrap(), response);
        validate_response(&read_request(0, MAX_REQUEST_BYTES), &response).unwrap();
    }

    #[test]
    fn oversized_frames_fail_before_decode_and_trailing_bytes_are_distinct() {
        for (error, resource, limit) in [
            (
                decode_request(&vec![0; MAX_REQUEST_MESSAGE_BYTES + 1]).unwrap_err(),
                ProtocolLimit::RequestMessageBytes,
                MAX_REQUEST_MESSAGE_BYTES,
            ),
            (
                decode_response(&vec![0; MAX_RESPONSE_MESSAGE_BYTES + 1]).unwrap_err(),
                ProtocolLimit::ResponseMessageBytes,
                MAX_RESPONSE_MESSAGE_BYTES,
            ),
        ] {
            assert_eq!(
                error.kind(),
                ProtocolErrorKind::LimitExceeded {
                    resource,
                    limit: limit as u64,
                    actual: limit as u64 + 1,
                },
            );
            assert!(error.source().is_none());
        }
        let mut bytes = encode_request(&read_request(0, 1)).unwrap();
        bytes.extend_from_slice(&[0, 0]);
        let error = decode_request(&bytes).unwrap_err();
        assert_eq!(
            error.kind(),
            ProtocolErrorKind::TrailingBytes { remaining: 2 }
        );
        assert!(error.source().is_none());
    }

    #[test]
    fn rejects_invalid_resources_ranges_and_response_fields() {
        for resource in [
            "".into(),
            "a".repeat(63),
            "a".repeat(65),
            "A".repeat(64),
            "g".repeat(64),
            "\u{e9}".repeat(32),
        ] {
            let request = Request::ByteLength { resource };
            assert!(encode_request(&request).is_err());
            assert!(decode_request(&rmp_serde::to_vec_named(&request).unwrap()).is_err());
        }
        for request in [
            read_request(0, MAX_REQUEST_BYTES + 1),
            read_request(u64::MAX, 1),
        ] {
            assert!(encode_request(&request).is_err());
            assert!(decode_request(&rmp_serde::to_vec_named(&request).unwrap()).is_err());
        }
        for response in [
            Response::Read(vec![0; MAX_REQUEST_BYTES as usize + 1]),
            Response::Failed(FileError::Io {
                message: "\u{e9}".repeat(MAX_ERROR_MESSAGE_BYTES / 2 + 1),
            }),
        ] {
            assert!(encode_response(&response).is_err());
            assert!(decode_response(&rmp_serde::to_vec_named(&response).unwrap()).is_err());
        }
    }

    #[test]
    fn rejects_wrong_response_variant_and_excess_read_bytes() {
        let requests = [
            Request::ByteLength {
                resource: resource(),
            },
            read_request(0, 1),
            Request::CurrentSelection,
        ];
        let responses = [
            Response::ByteLength(u64::MAX),
            Response::Read(vec![255]),
            Response::Selection(SelectionState::default()),
        ];
        for (request_index, request) in requests.iter().enumerate() {
            for (response_index, response) in responses.iter().enumerate() {
                assert_eq!(
                    validate_response(request, response).is_ok(),
                    request_index == response_index
                );
            }
            validate_response(request, &Response::Failed(FileError::Cancelled)).unwrap();
            validate_response(
                request,
                &Response::Failed(FileError::Io {
                    message: "failure".into(),
                }),
            )
            .unwrap();
        }
        assert!(validate_response(&read_request(0, 1), &Response::Read(vec![0, 1])).is_err());
        validate_response(&read_request(0, 1), &Response::Read(Vec::new())).unwrap();
        validate_response(&read_request(u64::MAX, 0), &Response::Read(Vec::new())).unwrap();
    }
    #[test]
    fn selection_and_directory_messages_round_trip_and_match_operations() {
        let selected = SelectedResource {
            name: "application.app".into(),
            resource: resource(),
        };
        let cases = [
            (
                Request::ChooseFile,
                Response::SelectedFile(Some(selected.clone())),
            ),
            (Request::ChooseFile, Response::SelectedFile(None)),
            (
                Request::ChooseFolder,
                Response::SelectedDirectory(Some(selected)),
            ),
            (
                Request::CurrentSelection,
                Response::Selection(SelectionState::default()),
            ),
            (
                Request::CurrentSelection,
                selection_with_entries(vec![DirectoryEntry {
                    id: u32::MAX,
                    name: "framework".into(),
                    kind: DirectoryEntryKind::Directory,
                }]),
            ),
            (
                Request::OpenFile {
                    resource: resource(),
                    entry_id: u32::MAX,
                },
                Response::OpenedFile(resource()),
            ),
            (
                Request::OpenDirectory {
                    resource: resource(),
                    entry_id: 0,
                },
                Response::OpenedDirectory(resource()),
            ),
        ];
        for (request, response) in cases {
            assert_eq!(
                decode_request(&encode_request(&request).unwrap()).unwrap(),
                request
            );
            assert_eq!(
                decode_response(&encode_response(&response).unwrap()).unwrap(),
                response
            );
            validate_response(&request, &response).unwrap();
            assert!(validate_response(&request, &Response::ByteLength(0)).is_err());
        }
    }

    #[test]
    fn directory_limits_and_resource_validation_apply_to_both_encoding_and_decoding() {
        let entry = DirectoryEntry {
            id: 0,
            name: "file".into(),
            kind: DirectoryEntryKind::File,
        };
        let invalid = [
            selection_with_entries(vec![entry.clone(), entry.clone()]),
            selection_with_entries(
                (0..513)
                    .map(|id| DirectoryEntry {
                        id,
                        ..entry.clone()
                    })
                    .collect(),
            ),
            selection_with_entries(vec![DirectoryEntry {
                name: "x".repeat(64 * 1024 + 1),
                ..entry
            }]),
            Response::OpenedFile("invalid".into()),
            Response::SelectedDirectory(Some(SelectedResource {
                name: "folder".into(),
                resource: "invalid".into(),
            })),
            Response::SelectedFile(Some(SelectedResource {
                name: "x".repeat(4097),
                resource: resource(),
            })),
        ];
        for response in invalid {
            assert!(encode_response(&response).is_err());
            assert!(decode_response(&rmp_serde::to_vec_named(&response).unwrap()).is_err());
        }
        let response = selection_with_entries(
            (0..512)
                .map(|id| DirectoryEntry {
                    id: u32::MAX - id,
                    name: "x".repeat(128),
                    kind: DirectoryEntryKind::Directory,
                })
                .collect(),
        );
        assert_eq!(
            decode_response(&encode_response(&response).unwrap()).unwrap(),
            response
        );
    }

    #[test]
    fn directory_replies_match_the_requested_resource_and_parent_entry() {
        let parent = resource();
        let child = "a".repeat(64);
        let listing = DirectoryListing {
            directory: SelectedResource {
                name: "child".into(),
                resource: child.clone(),
            },
            parent: Some(DirectoryEntryRef {
                directory: parent.clone(),
                entry_id: 7,
            }),
            entries: vec![],
        };
        let response = Response::Directory(listing.clone());
        for request in [
            Request::ListDirectory { resource: child },
            Request::ExpandDirectory {
                resource: parent.clone(),
                entry_id: 7,
            },
        ] {
            assert_eq!(
                decode_request(&encode_request(&request).unwrap()).unwrap(),
                request
            );
            let decoded = decode_response(&encode_response(&response).unwrap()).unwrap();
            validate_response(&request, &decoded).unwrap();
        }
        for request in [
            Request::ListDirectory {
                resource: parent.clone(),
            },
            Request::ExpandDirectory {
                resource: parent,
                entry_id: 8,
            },
            Request::ExpandDirectory {
                resource: "b".repeat(64),
                entry_id: 7,
            },
        ] {
            assert_eq!(
                validate_response(&request, &response).unwrap_err().kind(),
                ProtocolErrorKind::ResponseMismatch
            );
        }
        for invalid in [
            DirectoryListing {
                parent: Some(DirectoryEntryRef {
                    directory: "invalid".into(),
                    entry_id: 7,
                }),
                ..listing.clone()
            },
            DirectoryListing {
                parent: Some(DirectoryEntryRef {
                    directory: listing.directory.resource.clone(),
                    entry_id: 7,
                }),
                ..listing
            },
        ] {
            let response = Response::Directory(invalid);
            assert!(encode_response(&response).is_err());
            assert!(decode_response(&rmp_serde::to_vec_named(&response).unwrap()).is_err());
        }
        for state in [
            SelectionState {
                root: Some(SelectedResource {
                    name: "root".into(),
                    resource: "invalid".into(),
                }),
                ..SelectionState::default()
            },
            SelectionState {
                file_entry: Some(DirectoryEntryRef {
                    directory: "invalid".into(),
                    entry_id: 0,
                }),
                ..SelectionState::default()
            },
        ] {
            assert!(encode_response(&Response::Selection(state)).is_err());
        }
    }

    #[test]
    fn full_listing_and_selection_metadata_fit_the_existing_message_budget() {
        // Maximum count/name bytes plus maximum selected names and wide entry IDs.
        let directory = SelectedResource {
            name: "x".repeat(4096),
            resource: resource(),
        };
        let entries: Vec<_> = (0..512)
            .map(|id| DirectoryEntry {
                id: u32::MAX - id,
                name: "x".repeat(128),
                kind: DirectoryEntryKind::Directory,
            })
            .collect();
        let origin = DirectoryEntryRef {
            directory: "a".repeat(64),
            entry_id: u32::MAX,
        };
        let responses = [
            Response::Selection(SelectionState {
                file: Some(directory.clone()),
                directory: Some(directory.clone()),
                entries: entries.clone(),
                root: Some(directory.clone()),
                file_entry: Some(origin.clone()),
            }),
            Response::Directory(DirectoryListing {
                directory,
                parent: Some(origin),
                entries,
            }),
        ];
        for response in responses {
            let encoded = encode_response(&response).unwrap();
            assert!(encoded.len() <= MAX_RESPONSE_MESSAGE_BYTES);
            assert_eq!(decode_response(&encoded).unwrap(), response);
        }
    }

    #[test]
    fn legacy_selection_replies_decode_without_claiming_a_retained_root() {
        #[derive(Serialize)]
        struct LegacySelection {
            file: Option<SelectedResource>,
            directory: Option<SelectedResource>,
            entries: Vec<DirectoryEntry>,
        }
        #[derive(Serialize)]
        enum LegacyResponse {
            Selection(LegacySelection),
        }
        let selected = SelectedResource {
            name: "retained".into(),
            resource: resource(),
        };
        let bytes = rmp_serde::to_vec_named(&LegacyResponse::Selection(LegacySelection {
            file: Some(selected.clone()),
            directory: Some(selected.clone()),
            entries: vec![],
        }))
        .unwrap();
        let Response::Selection(state) = decode_response(&bytes).unwrap() else {
            panic!("expected legacy selection");
        };
        assert_eq!(state.file, Some(selected.clone()));
        assert_eq!(state.directory, Some(selected));
        assert_eq!(state.root, None);
        assert_eq!(state.file_entry, None);
    }
}
