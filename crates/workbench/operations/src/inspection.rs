use crate::{Failure, Outcome, Session, StepKind, StepOutcome};
use binary_inspection::{
    BinaryReport, InspectionError,
    input::{ByteSource, SourceError},
};

/// Identifies the inspection stage while retaining its complete error chain.
///
/// Source failures travel through the core input diagnostic, preserving both
/// the read offset and the original provider error in one owned chain.
#[derive(Debug)]
pub enum InspectionFailure {
    Selection(Failure),
    Metadata(Failure),
    Inspection(InspectionError),
}

impl std::fmt::Display for InspectionFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Selection(error) => {
                write!(formatter, "Cannot validate native selection: {error}")
            }
            Self::Metadata(error) => write!(formatter, "Cannot read file metadata: {error}"),
            Self::Inspection(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for InspectionFailure {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Selection(failure) | Self::Metadata(failure) => Some(failure),
            Self::Inspection(error) => Some(error),
        }
    }
}
/// One inspection's report or original failure, identified by its step kind.
pub type InspectionStepOutcome = StepOutcome<StepKind, BinaryReport, InspectionFailure>;

/// One completed inspection step with its report or original failure.
///
/// Inspection does not release or replace the native selection.
pub type InspectionOutcome = Outcome<InspectionStepOutcome>;
impl Session {
    /// Analyze the selected native file.
    ///
    /// Verifies that `resource` is selected, then reads through the Rust analyzer.
    /// The native selection remains owned by the service after success or failure.
    /// Another client may replace selection during inspection, causing a later
    /// resource request to fail.
    ///
    /// # Errors
    /// The outcome retains selection, metadata, source or analyzer failures in
    /// its step.
    pub fn inspect(&mut self, resource: &str) -> InspectionOutcome {
        let analysis = self
            .ensure_file(resource)
            .map_err(InspectionFailure::Selection)
            .and_then(|()| self.analyze(resource));
        Outcome {
            steps: vec![StepOutcome {
                kind: StepKind::Inspect,
                result: analysis,
            }],
        }
    }

    fn analyze(&mut self, resource: &str) -> Result<BinaryReport, InspectionFailure> {
        let byte_length = self
            .byte_length(resource)
            .map_err(InspectionFailure::Metadata)?;
        let mut source = RemoteSource {
            session: self,
            resource,
            byte_length,
        };
        binary_inspection::inspect_source(&mut source).map_err(InspectionFailure::Inspection)
    }
}
struct RemoteSource<'operation> {
    session: &'operation mut Session,
    resource: &'operation str,
    byte_length: u64,
}
impl ByteSource for RemoteSource<'_> {
    fn byte_length(&self) -> u64 {
        self.byte_length
    }
    fn read_at(&mut self, offset: u64, destination: &mut [u8]) -> Result<usize, SourceError> {
        if destination.is_empty() {
            return Ok(0);
        }
        let requested_length_conversion = u32::try_from(destination.len());
        let requested_length = match requested_length_conversion {
            Ok(requested_length) => requested_length,
            Err(_) => {
                // The destination exceeds u32::MAX bytes, so request a
                // representable prefix.
                u32::MAX
            }
        };
        let read_result = self
            .session
            .read_at(self.resource, offset, requested_length);
        match read_result {
            Ok(bytes) => {
                destination[..bytes.len()].copy_from_slice(&bytes);
                Ok(bytes.len())
            }
            Err(failure) => Err(SourceError::Provider(Box::new(failure))),
        }
    }
}

#[cfg(test)]
mod tests;
