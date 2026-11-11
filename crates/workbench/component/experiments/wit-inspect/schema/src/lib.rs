//! The generator describes one flat operation; ordinary Rust still owns inspection.
pub mod dto;
#[path = "../../support/fixture.rs"]
pub mod fixture;
pub mod project;

use linera_witty::wit_import;

#[wit_import(package = "wit-inspect:linera", interface = "native")]
pub trait InspectionApi {
    fn inspect(resource_id: String) -> dto::InspectionOutcome;
}

pub fn inspect(resource_id: String) -> dto::InspectionOutcome {
    let mut session = fixture::session();
    let outcome = session.inspect(&resource_id);
    project::outcome(outcome)
}
