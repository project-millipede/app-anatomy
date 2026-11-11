pub use binary_inspection::{AnalysisScope, ContainerKind, MachOHeaderFormat as HeaderFormat};
use linera_witty::{WitLoad, WitType};
pub use workbench_operations::StepKind;
// Concrete boundary declarations: every field is maintained by the experiment.

#[derive(Debug, Clone, WitType, WitLoad)]
pub struct InspectionOutcome {
    pub steps: Vec<InspectionStepOutcome>,
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub struct InspectionStepOutcome {
    pub kind: StepKind,
    pub step_result: Result<Report, InspectionFailure>,
}
#[derive(Debug, Clone, Copy, WitType, WitLoad)]
pub enum Endianness {
    Little,
    Big,
}
#[derive(Debug, Clone, Copy, WitType, WitLoad)]
pub struct FileRange {
    pub offset: u64,
    pub size: u64,
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub struct MachoValue {
    pub value: u32,
    pub name: Option<String>,
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub struct CpuIdentity {
    pub cpu_type: MachoValue,
    pub cpu_subtype: MachoValue,
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub struct CommandLocation {
    pub kind: MachoValue,
    pub file_range: FileRange,
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub struct PlatformDeclaration {
    pub platform: Option<MachoValue>,
    pub minimum_os: String,
    pub sdk: String,
    pub source: CommandLocation,
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub struct SignatureCommand {
    pub command_range: FileRange,
    pub data_range: FileRange,
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub struct Image {
    pub cpu: CpuIdentity,
    pub header_format: HeaderFormat,
    pub endianness: Endianness,
    pub file_range: FileRange,
    pub file_type: MachoValue,
    pub header_flags: u32,
    pub platforms: Vec<PlatformDeclaration>,
    pub signature_commands: Vec<SignatureCommand>,
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub struct Report {
    pub container: ContainerKind,
    pub container_endianness: Endianness,
    pub byte_length: u64,
    pub images: Vec<Image>,
    pub scope: AnalysisScope,
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub struct InspectionFailure {
    pub message: String,
    pub details: Vec<InspectionError>,
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub enum InspectionError {
    Analysis(AnalysisError),
    Source(SourceFailure),
    UnexpectedEof(IncompleteRead),
    InvalidReadCount(InvalidReadCount),
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub struct AnalysisError {
    pub message: String,
    pub kind: ErrorKind,
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub enum ErrorKind {
    Truncated(TruncatedRange),
    RangeOverflow,
    UnsupportedImage,
    Decode(String),
}
#[derive(Debug, Clone, Copy, WitType, WitLoad)]
pub struct TruncatedRange {
    pub requested_size: u64,
    pub available_size: u64,
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub struct SourceFailure {
    pub operation: SourceOperation,
    pub offset: Option<u64>,
    pub cause: ReadError,
}
#[derive(Debug, Clone, Copy, WitType, WitLoad)]
pub enum SourceOperation {
    ByteLength,
    ReadAt,
    Selection,
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub enum ReadError {
    Cancelled,
    IoFailure(IoFailure),
}
#[derive(Debug, Clone, WitType, WitLoad)]
pub struct IoFailure {
    pub message: String,
}
#[derive(Debug, Clone, Copy, WitType, WitLoad)]
pub struct IncompleteRead {
    pub offset: u64,
    pub remaining: u64,
}
#[derive(Debug, Clone, Copy, WitType, WitLoad)]
pub struct InvalidReadCount {
    pub reported: u64,
    pub capacity: u64,
}
