//! Public inspection failures and their original causes.

use std::{error::Error, fmt};

use crate::{
    AnalysisError,
    input::{InputError, InputErrors},
};

/// An analysis diagnostic or the acquisition failures observed during inspection.
#[derive(Debug)]
pub enum InspectionError {
    /// Structural diagnostic from inspection.
    Analysis(AnalysisError),
    /// Nonempty acquisition failures, each retaining its own original cause.
    Input(InputErrors),
}

impl From<AnalysisError> for InspectionError {
    fn from(error: AnalysisError) -> Self {
        Self::Analysis(error)
    }
}

impl From<InputError> for InspectionError {
    fn from(error: InputError) -> Self {
        let errors = InputErrors::from(error);
        Self::Input(errors)
    }
}

impl fmt::Display for InspectionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Analysis(error) => error.fmt(formatter),
            Self::Input(errors) => errors.fmt(formatter),
        }
    }
}

impl Error for InspectionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Analysis(error) => Some(error),
            Self::Input(errors) => Some(errors),
        }
    }
}
