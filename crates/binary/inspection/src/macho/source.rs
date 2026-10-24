//! Public inspection failures and their original causes.

use std::{error::Error, fmt};

use crate::{AnalysisError, input::InputError};

/// An analysis diagnostic or acquisition failure.
#[derive(Debug)]
pub enum InspectionError {
    /// Structural diagnostic from inspection.
    Analysis(AnalysisError),
    /// Original acquisition or source-contract failure.
    Input(InputError),
}

impl From<AnalysisError> for InspectionError {
    fn from(error: AnalysisError) -> Self {
        Self::Analysis(error)
    }
}

impl From<InputError> for InspectionError {
    fn from(error: InputError) -> Self {
        Self::Input(error)
    }
}

impl fmt::Display for InspectionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Analysis(error) => error.fmt(formatter),
            Self::Input(error) => error.fmt(formatter),
        }
    }
}

impl Error for InspectionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Analysis(error) => Some(error),
            Self::Input(error) => Some(error),
        }
    }
}
