//! Ordinary Rust filesystem sessions and analyzer composition.
//!
//! Transport adapters exchange complete messages. This crate owns protocol
//! validation, selection observations and inspection composition.
//! Errors retain owned Rust causes. Convert to WIT or output records only at
//! the corresponding boundary; those records cannot retain native error objects.

mod failure;
mod inspection;
mod outcome;
mod session;

pub use failure::{Failure, FailureKind, TransportOperation};
pub use inspection::{InspectionFailure, InspectionOutcome, InspectionStepOutcome};
pub use outcome::{Outcome, StepOutcome};
pub use session::{SelectionOutcome, SelectionStepOutcome, Session, StepKind};

/// Exchange complete filesystem messages using environment-specific networking.
///
/// [`Session`] owns message encoding, response validation and provider errors.
/// Implementations retain backend causes through [`Failure::transport`] and use
/// local failures only for conditions checked by the adapter itself.
pub trait Transport {
    /// Send one complete encoded request and receive its complete response.
    ///
    /// Preserve message boundaries; do not decode the filesystem protocol or
    /// replay a request after an uncertain send or receive. The service may have
    /// already performed the operation. Requests have no application deadline;
    /// connection-establishment bounds remain the adapter's responsibility.
    ///
    /// # Errors
    /// Return the transport failure or an adapter-local failure, such as receiving
    /// a text message where a binary response is required.
    fn exchange(&mut self, request: Vec<u8>) -> Result<Vec<u8>, Failure>;

    /// Discard the current connection and its pending response state.
    ///
    /// The next exchange must not consume a reply from a previous failed request.
    /// Resetting local transport state must not clear the native selection.
    fn reset(&mut self);
}

#[cfg(test)]
mod error_tests;
#[cfg(test)]
mod tests;
