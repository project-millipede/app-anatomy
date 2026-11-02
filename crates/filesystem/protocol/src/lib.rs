//! Shared, bounded filesystem messages for native and browser Wasm clients.
//!
//! Each WebSocket binary message contains one MessagePack request or response.
//! Serde preserves struct field and enum variant names; `serde_bytes` encodes file
//! contents as binary data. Client and service use the same message schema.

mod error;

pub use error::{ProtocolError, ProtocolErrorKind, ProtocolLimit};
use filesystem_data::DirectoryEntry;
use serde::{Deserialize, Serialize, de::DeserializeOwned};

/// Maximum encoded filesystem request message, including MessagePack overhead.
pub const MAX_REQUEST_MESSAGE_BYTES: usize = 1024;

/// Maximum encoded filesystem response message, including payload and metadata.
/// Accommodates directory listings with up to 512 entries and 64 KiB of names.
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
}

impl Request {
    pub fn resource(&self) -> Option<&str> {
        match self {
            Self::ByteLength { resource }
            | Self::ReadAt { resource, .. }
            | Self::OpenFile { resource, .. }
            | Self::OpenDirectory { resource, .. } => Some(resource),
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

/// An observation of the native owner's current selection.
/// The entries belong to `directory`; another operation may subsequently replace it.
#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct SelectionState {
    pub file: Option<SelectedResource>,
    pub directory: Option<SelectedResource>,
    pub entries: Vec<DirectoryEntry>,
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
                length: resource.len(),
            },
            "resource must contain exactly 64 lowercase hexadecimal characters",
        ));
    }
    Ok(())
}

/// Validate a byte range before a selected resource or transport is available.
pub fn validate_read_range(offset: u64, length: u32) -> Result<(), ProtocolError> {
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
            // A payload larger than the frame budget cannot encode into one response.
            enforce_limit(
                bytes.len(),
                MAX_RESPONSE_MESSAGE_BYTES,
                ProtocolLimit::ResponseMessageBytes,
                "read payload alone exceeds response message byte limit",
            )?;
        }
        Response::Failed(FileError::Io { message }) => {
            enforce_limit(
                message.len(),
                MAX_ERROR_MESSAGE_BYTES,
                ProtocolLimit::ErrorMessageBytes,
                "error text exceeds byte limit",
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
            validate_entries(&state.entries)?;
        }
        Response::ByteLength(_)
        | Response::Failed(FileError::Cancelled)
        | Response::SelectedFile(None)
        | Response::SelectedDirectory(None) => {}
    }
    Ok(())
}

fn validate_selected(selected: &SelectedResource) -> Result<(), ProtocolError> {
    validate_resource(&selected.resource)?;
    enforce_limit(
        selected.name.len(),
        4096,
        ProtocolLimit::SelectionNameBytes,
        "selection name exceeds the size limit",
    )
}

fn validate_entries(entries: &[DirectoryEntry]) -> Result<(), ProtocolError> {
    enforce_limit(
        entries.len(),
        512,
        ProtocolLimit::DirectoryEntries,
        "directory entry count exceeds the limit",
    )?;
    let mut names = 0_usize;
    let mut ids = std::collections::HashSet::new();
    for entry in entries {
        let is_new_entry_id = ids.insert(entry.id);
        if !is_new_entry_id {
            return Err(ProtocolError::validation(
                ProtocolErrorKind::DuplicateDirectoryEntry { id: entry.id },
                "duplicate directory entry id",
            ));
        }
        names = names.checked_add(entry.name.len()).ok_or_else(|| {
            ProtocolError::validation(
                ProtocolErrorKind::DirectoryNamesOverflow {
                    used: names,
                    additional: entry.name.len(),
                },
                "directory name size overflow",
            )
        })?;
        enforce_limit(
            names,
            64 * 1024,
            ProtocolLimit::DirectoryNameBytes,
            "directory names exceed the size limit",
        )?;
    }
    Ok(())
}

/// Match a decoded response to its previously validated request.
///
/// Encoding and decoding validate message fields. This checks the pending
/// operation and that returned file bytes fit the requested range.
pub fn check_response_matches_request(
    request: &Request,
    response: &Response,
) -> Result<(), ProtocolError> {
    match (request, response) {
        (_, Response::Failed(_))
        | (Request::ByteLength { .. }, Response::ByteLength(_))
        | (Request::ChooseFile, Response::SelectedFile(_))
        | (Request::ChooseFolder, Response::SelectedDirectory(_))
        | (Request::CurrentSelection, Response::Selection(_))
        | (Request::OpenFile { .. }, Response::OpenedFile(_))
        | (Request::OpenDirectory { .. }, Response::OpenedDirectory(_)) => Ok(()),
        (Request::ReadAt { length, .. }, Response::Read(bytes)) => {
            let requested_length_conversion = usize::try_from(*length);
            match requested_length_conversion {
                Ok(requested_length) => enforce_limit(
                    bytes.len(),
                    requested_length,
                    ProtocolLimit::RequestedReadBytes,
                    "read response exceeds requested length",
                ),
                Err(_) => {
                    // The requested length exceeds usize::MAX, so no response
                    // buffer can exceed it.
                    Ok(())
                }
            }
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
        bytes.len(),
        MAX_REQUEST_MESSAGE_BYTES,
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
        bytes.len(),
        MAX_RESPONSE_MESSAGE_BYTES,
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
        bytes.len(),
        limit,
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
                remaining: decoder.get_ref().len(),
            },
            "trailing bytes after filesystem message",
        ));
    }
    Ok(message)
}

fn enforce_limit(
    actual: usize,
    limit: usize,
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
    fn large_requested_ranges_accept_short_responses() -> Result<(), ProtocolError> {
        let request = read_request(32, u32::MAX);
        let encoded_request = encode_request(&request)?;
        let decoded_request = decode_request(&encoded_request)?;
        // A substantial binary payload must fit alongside its encoded metadata.
        let expected_response = Response::Read(vec![255; MAX_RESPONSE_MESSAGE_BYTES / 4 * 3]);
        let encoded_response = encode_response(&expected_response)?;
        let decoded_response = decode_response(&encoded_response)?;

        assert_eq!(decoded_response, expected_response);
        check_response_matches_request(&decoded_request, &decoded_response)?;
        Ok(())
    }

    #[test]
    fn oversized_frames_fail_before_decode_and_trailing_bytes_are_distinct() {
        let oversized_request_bytes = vec![0; MAX_REQUEST_MESSAGE_BYTES + 1];
        let oversized_response_bytes = vec![0; MAX_RESPONSE_MESSAGE_BYTES + 1];
        let request_decode_error = decode_request(&oversized_request_bytes).unwrap_err();
        let response_decode_error = decode_response(&oversized_response_bytes).unwrap_err();

        for (error, resource, limit) in [
            (
                request_decode_error,
                ProtocolLimit::RequestMessageBytes,
                MAX_REQUEST_MESSAGE_BYTES,
            ),
            (
                response_decode_error,
                ProtocolLimit::ResponseMessageBytes,
                MAX_RESPONSE_MESSAGE_BYTES,
            ),
        ] {
            assert_eq!(
                error.kind(),
                ProtocolErrorKind::LimitExceeded {
                    resource,
                    limit,
                    actual: limit + 1,
                },
            );
            assert!(error.source().is_none());
        }
        let request = read_request(0, 1);
        let mut encoded_request = encode_request(&request).unwrap();
        encoded_request.extend_from_slice(&[0, 0]);
        let error = decode_request(&encoded_request).unwrap_err();
        assert_eq!(
            error.kind(),
            ProtocolErrorKind::TrailingBytes { remaining: 2 }
        );
        assert!(error.source().is_none());
    }

    /// Raw MessagePack serialization supplies invalid decoder inputs without
    /// passing through the validating encoder. Assertions establish rejection,
    /// not a particular error variant or message.
    #[test]
    fn rejects_invalid_requests_and_oversized_responses() {
        // 1. Prepare the non-ASCII identifier and response-size fixtures.
        // 1.1. This identifier has the required 64-byte length but contains non-ASCII text.
        let non_ascii_resource_identifier = "é".repeat(32);

        // 1.2. The payload fills the message budget; metadata makes the response exceed it.
        let read_payload_at_message_limit = vec![0; MAX_RESPONSE_MESSAGE_BYTES];

        // 1.3. ASCII error text exceeds its byte limit by one byte.
        let oversized_error_text = "x".repeat(MAX_ERROR_MESSAGE_BYTES + 1);

        // 2. Reject identifiers that are not exactly 64 lowercase hexadecimal characters.
        for resource in [
            "".into(),
            "a".repeat(63),
            "a".repeat(65),
            "A".repeat(64),
            "g".repeat(64),
            non_ascii_resource_identifier,
        ] {
            let request = Request::ByteLength { resource };
            let request_encode_result = encode_request(&request);
            assert!(request_encode_result.is_err());
            let encoded_request = rmp_serde::to_vec_named(&request).unwrap();
            let request_decode_result = decode_request(&encoded_request);
            assert!(request_decode_result.is_err());
        }

        // 3. Reject an overflowing end offset: u64::MAX + 1 is not representable.
        // This checks range arithmetic; no file length participates.
        let request = read_request(u64::MAX, 1);
        let request_encode_result = encode_request(&request);
        assert!(request_encode_result.is_err());
        let encoded_request = rmp_serde::to_vec_named(&request).unwrap();
        let request_decode_result = decode_request(&encoded_request);
        assert!(request_decode_result.is_err());

        // 4. Reject responses exceeding the complete-message or error-text limit.
        for response in [
            Response::Read(read_payload_at_message_limit),
            Response::Failed(FileError::Io {
                message: oversized_error_text,
            }),
        ] {
            let response_encode_result = encode_response(&response);
            assert!(response_encode_result.is_err());
            let encoded_response = rmp_serde::to_vec_named(&response).unwrap();
            let response_decode_result = decode_response(&encoded_response);
            assert!(response_decode_result.is_err());
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
                let response_match_result = check_response_matches_request(request, response);
                assert_eq!(
                    response_match_result.is_ok(),
                    request_index == response_index
                );
            }
            let cancelled_response = Response::Failed(FileError::Cancelled);
            check_response_matches_request(request, &cancelled_response).unwrap();
            let io_failure_response = Response::Failed(FileError::Io {
                message: "failure".into(),
            });
            check_response_matches_request(request, &io_failure_response).unwrap();
        }
        let one_byte_request = read_request(0, 1);
        let excess_read_response = Response::Read(vec![0, 1]);
        let response_match_result =
            check_response_matches_request(&one_byte_request, &excess_read_response);
        assert!(response_match_result.is_err());

        let empty_read_response = Response::Read(Vec::new());
        check_response_matches_request(&one_byte_request, &empty_read_response).unwrap();

        let zero_length_request = read_request(u64::MAX, 0);
        check_response_matches_request(&zero_length_request, &empty_read_response).unwrap();
    }
    #[test]
    fn selection_and_directory_responses_match_operations() -> Result<(), ProtocolError> {
        let selected = SelectedResource {
            name: "application.app".into(),
            resource: resource(),
        };
        let cases = [
            (
                Request::ChooseFile,
                Response::SelectedFile(Some(selected.clone())),
            ),
            (
                Request::ChooseFolder,
                Response::SelectedDirectory(Some(selected)),
            ),
            (
                Request::OpenFile {
                    resource: resource(),
                    entry_id: 0,
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
            check_response_matches_request(&request, &response)?;
            let unexpected_response = Response::ByteLength(0);
            let response_match_result =
                check_response_matches_request(&request, &unexpected_response);
            assert!(response_match_result.is_err());
        }
        Ok(())
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
            let response_encode_result = encode_response(&response);
            assert!(response_encode_result.is_err());
            let encoded_response = rmp_serde::to_vec_named(&response).unwrap();
            let response_decode_result = decode_response(&encoded_response);
            assert!(response_decode_result.is_err());
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
        let encoded_response = encode_response(&response).unwrap();
        let decoded_response = decode_response(&encoded_response).unwrap();
        assert_eq!(decoded_response, response);
    }
}
