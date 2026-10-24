use filesystem_protocol::ProtocolError;
use serde::Serialize;
use std::{borrow::Cow, error::Error, fmt};

/// Identifies the client-side or filesystem-provider origin of a failure.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum FailureKind {
    Transport,
    Provider,
}

/// The operation at which a transport failed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TransportOperation {
    Configure,
    Connect,
    Send,
    Receive,
}

/// A client failure that owns its original cause and renders diagnostics lazily.
///
/// Protocol failures retain the coarse `Transport` category for compatibility.
/// Use `protocol_error()` to inspect protocol failures, `operation()` for transport
/// context, and `Error::source()` for the original backend or protocol error.
/// Convert to an explicit output record at WIT/JSON boundaries instead of
/// serializing this.
#[derive(Debug, thiserror::Error)]
pub struct Failure {
    pub kind: FailureKind,
    operation: Option<TransportOperation>,
    // Text is present only when the failure itself supplies a diagnostic. Causes
    // are never eagerly formatted and copied here.
    diagnostic: Option<Cow<'static, str>>,
    #[source]
    cause: Option<Box<dyn Error + Send + Sync>>,
}

impl Failure {
    fn empty(kind: FailureKind) -> Self {
        Self {
            kind,
            operation: None,
            diagnostic: None,
            cause: None,
        }
    }

    pub fn transport(
        operation: TransportOperation,
        error: impl Error + Send + Sync + 'static,
    ) -> Self {
        Self {
            operation: Some(operation),
            cause: Some(Box::new(error)),
            ..Self::empty(FailureKind::Transport)
        }
    }

    pub fn local(operation: TransportOperation, message: &'static str) -> Self {
        Self {
            operation: Some(operation),
            diagnostic: Some(Cow::Borrowed(message)),
            ..Self::empty(FailureKind::Transport)
        }
    }

    /// Retain the cause of a local check, such as the timer enforcing a deadline.
    pub fn with_source(mut self, error: impl Error + Send + Sync + 'static) -> Self {
        self.cause = Some(Box::new(error));
        self
    }

    pub fn protocol(error: ProtocolError) -> Self {
        Self {
            cause: Some(Box::new(error)),
            ..Self::empty(FailureKind::Transport)
        }
    }

    /// A provider-reported failure without an available native cause.
    pub fn provider(message: impl Into<String>) -> Self {
        Self {
            diagnostic: Some(Cow::Owned(message.into())),
            ..Self::empty(FailureKind::Provider)
        }
    }

    pub fn operation(&self) -> Option<TransportOperation> {
        self.operation
    }

    pub fn protocol_error(&self) -> Option<&ProtocolError> {
        self.cause.as_ref()?.downcast_ref()
    }

    pub(crate) fn precondition(message: &'static str) -> Self {
        Self {
            diagnostic: Some(Cow::Borrowed(message)),
            ..Self::empty(FailureKind::Transport)
        }
    }

    fn fmt_diagnostic(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(message) = &self.diagnostic {
            return formatter.write_str(message);
        }
        if let Some(operation) = self.operation {
            let action = match operation {
                TransportOperation::Configure => "configuration",
                TransportOperation::Connect => "connection",
                TransportOperation::Send => "send",
                TransportOperation::Receive => "receive",
            };
            write!(formatter, "Transport {action} failed: ")?;
        }
        match &self.cause {
            Some(cause) => fmt::Display::fmt(cause, formatter),
            None => formatter.write_str("Filesystem operation failed"),
        }
    }
}

impl fmt::Display for Failure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.fmt_diagnostic(formatter)
    }
}
