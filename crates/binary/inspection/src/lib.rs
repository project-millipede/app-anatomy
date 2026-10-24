//! Portable Mach-O analysis and object-file identity inspection.
//!
//! Inspect borrowed bytes or request bounded ranges through a caller-owned source.
//! Reports own their facts; native acquisition remains the source provider's responsibility.
//! It has no browser, WIT, Wasm, filesystem or macOS dependencies. Native callers
//! and the separate component adapter use the same entry points.
//!
//! The [`input`] module supplies the portable source contract used by [`inspect_source`].
//! Existing slice-based entry points use the same analysis traversal.
//!
//! [`inspect_object`] and [`inspect_object_source`] return common file identity
//! for ELF, PE, COFF and thin Mach-O through `object`'s unified parser. They share
//! input acquisition with Mach-O inspection and return an owned [`ObjectReport`].
//! These APIs do not supply the Mach-O platform and signature-command report.
//!
//! # Mach-O analysis scope
//!
//! `object` detects the format and decodes headers, architecture tables and load
//! commands. Inspection selects platform declarations and code-signature locations
//! from those results and enforces input/report bounds. It does not verify signatures,
//! certificates, bundle resources or operating-system execution policy.
//! Unknown command payloads and reserved header fields are not interpreted.
//! Unknown CPU, file-type and modern platform identifiers preserve raw values.
//! Supported encodings and format validation follow the pinned upstream parser;
//! there is no fallback decoder.
//!
//! Every reported byte range is absolute within the supplied input, including
//! signature locations inside universal members. Range ends are exclusive.
//!
//! Reports expose `object::macho` values directly for CPU identity, file role,
//! platform identifiers and load-command kinds. [`object::Wrap::into_inner`]
//! returns their raw values, and the upstream `names` feature supplies canonical
//! constant names. [`Version`] and [`Endianness`] also reuse upstream types.
//! Native consumers that refer to these types or constants depend on the same
//! `object` version as this library. Legacy commands retain their actual command
//! kind and versions without inventing a modern platform identifier.
//!
//! # Native use
//!
//! ```
//! use binary_inspection::{inspect, AnalysisError};
//! use object::macho::MH_EXECUTE;
//!
//! fn executable_count(bytes: &[u8]) -> Result<usize, AnalysisError> {
//!     let report = inspect(bytes)?;
//!     Ok(report.images.iter()
//!         .filter(|image| image.file_type == MH_EXECUTE)
//!         .count())
//! }
//! ```

#![forbid(unsafe_code)]
#![warn(missing_docs)]

mod error;
pub mod input;
mod macho;
mod model;
mod object_report;

pub use error::{AnalysisError, ErrorKind};
pub use macho::{InspectionError, inspect, inspect_source};
pub use model::{
    AnalysisScope, BinaryReport, CommandLocation, ContainerKind, CpuIdentity, FileRange,
    MachOHeaderFormat, MachOImage, PlatformDeclaration, SignatureCommand,
};
pub use object::{Endianness, macho::Version};
pub use object_report::{ObjectReport, inspect_object, inspect_object_source};
