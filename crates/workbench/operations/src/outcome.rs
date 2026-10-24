/// Completed steps, independent of an execution environment.
///
/// Values and failures are owned. The operation defines which steps execute and
/// whether later steps still run after an earlier failure.
#[derive(Debug)]
pub struct Outcome<Step> {
    /// Completed steps in execution order.
    pub steps: Vec<Step>,
}

/// A step's identity and original result.
#[derive(Debug)]
pub struct StepOutcome<Kind, Output, Error> {
    /// Identifies the action that produced this result.
    pub kind: Kind,
    /// Successful output or the original owned failure.
    pub result: Result<Output, Error>,
}
