//! Rust-owned inspection facade for the WITGenstein adoption experiment.
//!
//! The facade and concrete projection declarations are handwritten adoption cost.
//! The reusable operation remains the production `Session::inspect` method.

pub mod dto;
pub mod fixture;
mod project;

use witgenstein_rs_macros::export;

pub use dto::*;

/// One actual ordinary Rust session, initialized from the shared fixture transport.
pub struct Session {
    inner: workbench_operations::Session,
}

#[export]
impl Session {
    /// Create the session using the compile-time selected scenario.
    pub fn new() -> Self {
        Self {
            inner: fixture::session(),
        }
    }

    /// Run the production inspection operation and its explicit boundary projection.
    pub fn inspect(&mut self, resource: String) -> InspectionOutcome {
        let outcome = self.inner.inspect(&resource);
        project::outcome(outcome)
    }
}
