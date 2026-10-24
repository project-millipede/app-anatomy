//! Native remote filesystem transport and a single-range read probe.
mod socket;

pub use socket::NativeTransport;

use serde::Serialize;
use workbench_operations::Session;
pub use workbench_operations::{Failure, FailureKind};

#[derive(Debug)]
pub struct FileRequest {
    pub endpoint: String,
    pub offset: u64,
    pub length: u32,
}
#[derive(Debug, Serialize)]
pub struct FileRead {
    pub byte_length: u64,
    pub bytes: Vec<u8>,
}
pub fn read_range(request: FileRequest) -> Result<FileRead, Failure> {
    filesystem_protocol::validate_read_range(request.offset, request.length)
        .map_err(Failure::protocol)?;
    let mut session = Session::new(Box::new(NativeTransport::new(request.endpoint)?));
    let selected = session.current_selection()?.file.ok_or_else(|| {
        Failure::local(
            workbench_operations::TransportOperation::Configure,
            "No native file is selected",
        )
    })?;
    let byte_length = session.byte_length(&selected.resource)?;
    let bytes = session.read_at(&selected.resource, request.offset, request.length)?;
    Ok(FileRead { byte_length, bytes })
}
