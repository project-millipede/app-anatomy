//! Invoke the generated native plugin client, including its generated ABI shims.

use std::error::Error;
use wit_inspect_fidius_adoption::{InspectionClient, RESOURCE};

fn main() -> Result<(), Box<dyn Error>> {
    let inspector = InspectionClient::in_process("Inspector")?;
    let outcome = inspector.inspect(&RESOURCE.to_owned())?;
    serde_json::to_writer_pretty(std::io::stdout(), &outcome)?;
    Ok(())
}
