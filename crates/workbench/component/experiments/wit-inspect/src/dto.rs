//! Concrete boundary declarations: every field is maintained by the experiment.

#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct InspectionOutcome {
    pub steps: Vec<InspectionStepOutcome>,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct InspectionStepOutcome {
    pub kind: StepKind,
    pub step_result: StepResult,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub enum StepResult {
    Success(Report),
    Failure(InspectionFailure),
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub enum StepKind {
    SelectFile,
    SelectDirectory,
    OpenEntry,
    QuerySelection,
    Inspect,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub enum ContainerKind {
    Thin,
    Universal32,
    Universal64,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub enum HeaderFormat {
    MachO32,
    MachO64,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub enum AnalysisScope {
    HeadersOnly,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub enum Endianness {
    Little,
    Big,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct FileRange {
    pub offset: u64,
    pub size: u64,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct MachoValue {
    pub value: u32,
    pub name: Option<String>,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct CpuIdentity {
    pub cpu_type: MachoValue,
    pub cpu_subtype: MachoValue,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct CommandLocation {
    pub kind: MachoValue,
    pub file_range: FileRange,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct PlatformDeclaration {
    pub platform: Option<MachoValue>,
    pub minimum_os: String,
    pub sdk: String,
    pub source: CommandLocation,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct SignatureCommand {
    pub command_range: FileRange,
    pub data_range: FileRange,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
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
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct Report {
    pub container: ContainerKind,
    pub container_endianness: Endianness,
    pub byte_length: u64,
    pub images: Vec<Image>,
    pub scope: AnalysisScope,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct InspectionFailure {
    pub message: String,
    pub details: Vec<InspectionError>,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub enum InspectionError {
    Analysis(AnalysisError),
    Source(SourceFailure),
    UnexpectedEof(IncompleteRead),
    InvalidReadCount(InvalidReadCount),
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct AnalysisError {
    pub message: String,
    pub kind: ErrorKind,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub enum ErrorKind {
    Truncated(TruncatedRange),
    RangeOverflow,
    UnsupportedImage,
    Decode(String),
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct TruncatedRange {
    pub requested_size: u64,
    pub available_size: u64,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct SourceFailure {
    pub operation: SourceOperation,
    pub offset: Option<u64>,
    pub cause: ReadError,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub enum SourceOperation {
    ByteLength,
    ReadAt,
    Selection,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub enum ReadError {
    Cancelled,
    IoFailure(IoFailure),
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct IoFailure {
    pub message: String,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct IncompleteRead {
    pub offset: u64,
    pub remaining: u64,
}
#[derive(Debug, fidius_macro::WitType, serde::Serialize, serde::Deserialize)]
pub struct InvalidReadCount {
    pub reported: u64,
    pub capacity: u64,
}
