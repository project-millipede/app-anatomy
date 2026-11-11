//! Normal Fidius adoption with full inspection data and a flat plugin interface.
//! Each invocation owns a real ordinary Rust Session; this is not a WIT Session resource.

#[cfg(not(target_family = "wasm"))]
use fidius as fidius_runtime;
#[cfg(target_family = "wasm")]
use fidius_guest as fidius_runtime;

pub mod dto;
mod fixture;
mod project;

use fidius_macro::{plugin_impl, plugin_interface};
use workbench_operations::{InspectionOutcome, Session};

// The plugin adapter calls this unchanged ordinary Rust operation.
const _: fn(&mut Session, &str) -> InspectionOutcome = Session::inspect;

#[plugin_interface(version = 1, buffer = PluginAllocated, crate = "fidius_runtime")]
pub trait Inspection: Send + Sync {
    fn inspect(&self, resource: String) -> dto::InspectionOutcome;
}

pub struct Inspector;

#[plugin_impl(Inspection, crate = "fidius_runtime")]
impl Inspection for Inspector {
    fn inspect(&self, resource: String) -> dto::InspectionOutcome {
        let mut session = fixture::session();
        let outcome = session.inspect(&resource);
        project::outcome(outcome)
    }
}

#[cfg(not(target_family = "wasm"))]
fidius_runtime::fidius_plugin_registry!();

pub const RESOURCE: &str = fixture::RESOURCE;
