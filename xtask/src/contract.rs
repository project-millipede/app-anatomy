//! The component contract: its declaration and its generated files.
//!
//! The contract is generated from the ordinary Rust types and operations. This
//! module states which of them each interface exports; it restates no field and
//! no signature. From that declaration wit-reflect renders three files for the
//! component crate:
//!
//! - `wit/analysis.wit`, the WIT package;
//! - `src/bindings.rs`, the contract's part of the `wit_bindgen::generate!`
//!   call, including the Rust types that cross the boundary unchanged;
//! - `src/forwarding.rs`, the implementation of the binding traits.
//!
//! All three are committed. `contract generate` rewrites them. `contract check`
//! changes nothing and fails when a committed file differs from what the
//! declaration generates, so a contract change is always visible in review.

use anyhow::{Context, Result, bail};
use binary_inspection::{AnalysisError, BinaryReport, InspectionError};
use std::{fs, path::Path};
use wit_reflect::{Function, Operation, Schema, TypeGraph, WitType, operation};
use workbench_operations::{
    InspectionOutcome, InspectionStepOutcome, SelectionOutcome, SelectionStepOutcome, Session,
};

const COMPONENT_DIRECTORY: &str = "crates/workbench/component";
const WORLD: &str = "analysis";

/// Declare the package: interfaces, their types and operations, and the world.
///
/// Types that are not listed are found through the listed ones and belong to
/// the only interface that reaches them.
fn schema() -> Result<Schema> {
    let package_name = "apple-code:analysis@0.6.0"
        .parse()
        .context("the contract's package name is invalid")?;
    let mut schema = Schema::new(package_name);

    // Portable header analysis. All offsets are absolute offsets in the input file.
    schema
        .interface("binary")
        .define::<BinaryReport>()
        .define::<AnalysisError>();

    // Diagnostics of one inspection: an analysis error or the acquisition
    // failures in the order they were observed.
    schema.interface("inspection").define::<InspectionError>();

    // The native filesystem session. Each instantiation of the generic outcome
    // carriers is a separate definition and needs its own name.
    let mut native = schema.interface("native");
    native
        .define_as::<SelectionStepOutcome>("selection-step-outcome")
        .define_as::<SelectionOutcome>("selection-outcome")
        .define_as::<InspectionStepOutcome>("inspection-step-outcome")
        .define_as::<InspectionOutcome>("inspection-outcome");
    native
        .resource::<Session>()
        .method(operation!(workbench_operations::Session::query_selection))
        .method(operation!(workbench_operations::Session::select_file))
        .method(operation!(workbench_operations::Session::select_directory))
        .method(operation!(workbench_operations::Session::open_file))
        .method(operation!(workbench_operations::Session::open_directory))
        .method(operation!(workbench_operations::Session::inspect));
    native.function(Operation::new(
        create_selection_session,
        "crate::create_selection_session",
    ));

    // `export native: native` gives consumers one export name instead of the
    // interface's versioned identity. It also fixes the Rust binding path and
    // the name jco exposes. Omitting `inspection` or `binary` would turn the
    // types `native` refers to into implicit imports.
    schema
        .world(WORLD)
        // Host WebSocket operations for the Rust filesystem client. The host
        // binds them to the Polymorph browser provider.
        .import("polymorph:websocket/connections@0.1.0")
        .export_as("native", "native")
        .export("inspection")
        .export("binary");
    Ok(schema)
}

/// The signature of the component's session factory.
///
/// The factory supplies the WebSocket transport, so it is implemented in the
/// component crate and cannot be reflected from here. Its signature is stated
/// by hand instead. The generated forwarding calls the real function by the
/// path given in [`schema`], so a signature that differs does not compile.
fn create_selection_session(graph: &mut TypeGraph) -> Function {
    let session = <Session as WitType>::wit_type(graph);
    Function::new("create-selection-session", Vec::new(), session)
        .with_docs("Create a session connected to the native filesystem service.")
}

/// The generated files as paths below the repository root with their contents.
fn generated_files() -> Result<[(String, String); 3]> {
    let schema = schema()?;
    let package = schema.resolve().context("the contract is invalid")?;
    let bindings = package
        .bindings(WORLD)
        .context("the contract's bindings cannot be set up")?;
    let forwarding = package
        .forwarding(WORLD)
        .context("the contract cannot be forwarded to the Rust operations")?;
    Ok([
        (
            format!("{COMPONENT_DIRECTORY}/wit/analysis.wit"),
            package.to_string(),
        ),
        (format!("{COMPONENT_DIRECTORY}/src/bindings.rs"), bindings),
        (
            format!("{COMPONENT_DIRECTORY}/src/forwarding.rs"),
            forwarding,
        ),
    ])
}

/// Rewrite the generated files from the declaration.
pub(crate) fn generate(root: &Path) -> Result<()> {
    for (relative_path, generated_contents) in generated_files()? {
        let path = root.join(&relative_path);
        fs::write(&path, generated_contents)
            .with_context(|| format!("failed to write {}", path.display()))?;
        println!("Wrote {relative_path}.");
    }
    Ok(())
}

/// Fail when a committed file differs from what the declaration generates.
///
/// Checking never repairs: a stale file means the Rust declarations or the
/// schema changed, and that change belongs in review.
pub(crate) fn check(root: &Path) -> Result<()> {
    let mut stale_paths = Vec::new();
    for (relative_path, generated_contents) in generated_files()? {
        let path = root.join(&relative_path);
        let committed_contents = fs::read_to_string(&path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        if committed_contents != generated_contents {
            stale_paths.push(relative_path);
        }
    }
    if !stale_paths.is_empty() {
        bail!(
            "generated contract files are stale: {}; review the change, then run \
             `cargo run -p app-anatomy-xtask -- contract generate`",
            stale_paths.join(", ")
        );
    }
    println!("Generated contract files are current.");
    Ok(())
}
