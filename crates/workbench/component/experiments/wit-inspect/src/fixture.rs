//! Shared, in-memory filesystem provider for the three isolated generator probes.
//! The real Rust session performs validation, protocol exchange and inspection.

use filesystem_protocol::{
    FileError, Request, Response, SelectedResource, SelectionState, decode_request, encode_response,
};
use std::io;
use workbench_operations::{Failure, Session, Transport, TransportOperation};

/// Opaque selected resource used by every probe and oracle.
pub const RESOURCE: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const MACHO: &[u8] = include_bytes!("fixtures/macho-base-aarch64-codesign");
const ELF: &[u8] = include_bytes!("fixtures/elf-base.o");

/// Construct the build-selected fixture session without performing an operation.
pub fn session() -> Session {
    Session::new(transport())
}

/// Construct the build-selected fixture transport for the production facade.
pub fn transport() -> Box<dyn Transport> {
    transport_for(option_env!("WIT_INSPECT_SCENARIO").unwrap_or("success"))
}

/// Construct one deterministic fixture-backed session for a native test.
///
/// # Panics
/// Panics for a scenario other than the five documented probe scenarios.
pub fn session_for(scenario: &str) -> Session {
    Session::new(transport_for(scenario))
}

fn transport_for(scenario: &str) -> Box<dyn Transport> {
    let scenario = match scenario {
        "success" => Scenario::Success,
        "selection-failure" => Scenario::SelectionFailure,
        "metadata-failure" => Scenario::MetadataFailure,
        "unsupported-image" => Scenario::UnsupportedImage,
        "read-failure" => Scenario::ReadFailure,
        _ => panic!("Unknown WIT inspection probe scenario: {scenario}"),
    };
    Box::new(FixtureTransport { scenario })
}

#[derive(Clone, Copy)]
enum Scenario {
    Success,
    SelectionFailure,
    MetadataFailure,
    UnsupportedImage,
    ReadFailure,
}

struct FixtureTransport {
    scenario: Scenario,
}

impl FixtureTransport {
    fn bytes(&self) -> &'static [u8] {
        match self.scenario {
            Scenario::UnsupportedImage => ELF,
            _ => MACHO,
        }
    }

    fn response(&self, request: Request) -> Result<Response, Failure> {
        if request
            .resource()
            .is_some_and(|resource| resource != RESOURCE)
        {
            return Ok(Response::Failed(FileError::Io {
                message: "Unknown probe resource".to_owned(),
            }));
        }
        match request {
            Request::CurrentSelection => {
                let file = match self.scenario {
                    Scenario::SelectionFailure => None,
                    _ => Some(SelectedResource {
                        name: match self.scenario {
                            Scenario::UnsupportedImage => "elf-base.o",
                            _ => "macho-base-aarch64-codesign",
                        }
                        .to_owned(),
                        resource: RESOURCE.to_owned(),
                    }),
                };
                Ok(Response::Selection(SelectionState {
                    file,
                    ..SelectionState::default()
                }))
            }
            Request::ByteLength { .. } => match self.scenario {
                Scenario::MetadataFailure => Ok(Response::Failed(FileError::Io {
                    message: "probe metadata failure".to_owned(),
                })),
                _ => {
                    let byte_length = u64::try_from(self.bytes().len())
                        .map_err(|error| Failure::transport(TransportOperation::Receive, error))?;
                    Ok(Response::ByteLength(byte_length))
                }
            },
            Request::ReadAt { offset, length, .. } => {
                if matches!(self.scenario, Scenario::ReadFailure) {
                    return Err(Failure::transport(
                        TransportOperation::Receive,
                        io::Error::new(io::ErrorKind::PermissionDenied, "probe read failure"),
                    ));
                }
                let bytes = self.bytes();
                let offset = usize::try_from(offset)
                    .map_err(|error| Failure::transport(TransportOperation::Receive, error))?;
                let length = usize::try_from(length)
                    .map_err(|error| Failure::transport(TransportOperation::Receive, error))?;
                let available = bytes.get(offset..).unwrap_or_default();
                let returned_length = length.min(available.len());
                Ok(Response::Read(available[..returned_length].to_vec()))
            }
            _ => Err(Failure::provider(
                "The inspection probe only supports selection, metadata and bounded reads",
            )),
        }
    }
}

impl Transport for FixtureTransport {
    fn exchange(&mut self, request: Vec<u8>) -> Result<Vec<u8>, Failure> {
        let decoded_request = decode_request(&request).map_err(Failure::protocol)?;
        let response = self.response(decoded_request)?;
        encode_response(&response).map_err(Failure::protocol)
    }

    fn reset(&mut self) {
        // There is no connection or pending reply in this in-memory provider.
        // The fixture's retained selection is independent of transport reset.
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use binary_inspection::{
        AnalysisScope, ContainerKind, ErrorKind, InspectionError,
        input::{InputError, SourceError},
    };
    use std::error::Error;
    use workbench_operations::{FailureKind, InspectionFailure, StepKind};

    /// Every scenario invokes the production operation against encoded messages.
    /// The success fixture supplies real platform and signature-command data;
    /// the native assertions establish fixture behavior independently of DTOs.
    #[test]
    fn signed_macho_inspection_retains_platform_and_signature_locations()
    -> Result<(), Box<dyn Error>> {
        let mut session = session_for("success");
        let outcome = session.inspect(RESOURCE);

        assert_eq!(outcome.steps.len(), 1);
        let step = outcome
            .steps
            .into_iter()
            .next()
            .expect("one inspection step");
        assert_eq!(step.kind, StepKind::Inspect);
        let report = step.result?;
        assert_eq!(report.container, ContainerKind::Thin);
        assert_eq!(report.scope, AnalysisScope::HeadersOnly);
        assert_eq!(report.byte_length, 40_192);
        assert_eq!(report.images.len(), 1);
        let image = &report.images[0];
        assert!(!image.platforms.is_empty());
        assert!(!image.signature_commands.is_empty());
        for signature in &image.signature_commands {
            assert!(signature.command_range.end() <= report.byte_length);
            assert!(signature.data_range.end() <= report.byte_length);
        }
        Ok(())
    }

    #[test]
    fn absent_selection_is_reported_at_the_selection_stage() {
        let mut session = session_for("selection-failure");
        let outcome = session.inspect(RESOURCE);

        assert_eq!(outcome.steps.len(), 1);
        let result = &outcome.steps[0].result;
        let Err(InspectionFailure::Selection(failure)) = result else {
            panic!("Expected a selection-stage failure, got {result:?}");
        };
        assert_eq!(failure.kind, FailureKind::Transport);
        assert_eq!(failure.to_string(), "The file is no longer selected.");
    }

    #[test]
    fn provider_metadata_failure_is_reported_at_the_metadata_stage() {
        let mut session = session_for("metadata-failure");
        let outcome = session.inspect(RESOURCE);

        assert_eq!(outcome.steps.len(), 1);
        let result = &outcome.steps[0].result;
        let Err(InspectionFailure::Metadata(failure)) = result else {
            panic!("Expected a metadata-stage failure, got {result:?}");
        };
        assert_eq!(failure.kind, FailureKind::Provider);
        assert_eq!(failure.to_string(), "probe metadata failure");
    }

    #[test]
    fn elf_inspection_retains_the_unsupported_image_classification() {
        let mut session = session_for("unsupported-image");
        let outcome = session.inspect(RESOURCE);

        assert_eq!(outcome.steps.len(), 1);
        let result = &outcome.steps[0].result;
        let Err(InspectionFailure::Inspection(InspectionError::Analysis(error))) = result else {
            panic!("Expected an analysis failure, got {result:?}");
        };
        assert_eq!(error.kind, ErrorKind::UnsupportedImage);
    }

    /// Diagnostic records cannot preserve a native error object. Check it here
    /// before separately comparing all exported records through jco.
    #[test]
    fn read_failure_retains_permission_denied_in_the_original_native_cause_chain() {
        let mut session = session_for("read-failure");
        let outcome = session.inspect(RESOURCE);

        assert_eq!(outcome.steps.len(), 1);
        let result = &outcome.steps[0].result;
        let Err(InspectionFailure::Inspection(InspectionError::Input(errors))) = result else {
            panic!("Expected acquisition errors, got {result:?}");
        };
        assert!(!errors.errors().is_empty());
        for input_error in errors.errors() {
            let InputError::Source {
                error: SourceError::Provider(provider_error),
                ..
            } = input_error
            else {
                panic!("Expected retained provider error, got {input_error:?}");
            };
            let failure = provider_error
                .downcast_ref::<Failure>()
                .expect("remote source retains the ordinary session failure");
            assert_eq!(failure.operation(), Some(TransportOperation::Receive));
            let native_error = failure
                .source()
                .and_then(|cause| cause.downcast_ref::<io::Error>())
                .expect("transport failure retains its original io::Error");
            assert_eq!(native_error.kind(), io::ErrorKind::PermissionDenied);
        }
    }
}
