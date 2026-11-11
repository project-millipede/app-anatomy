//! Standard guest implementation; Witty generates its schema, not this bridge.
wit_bindgen::generate!({
    path: "wit",
    world: "inspection",
    with: {
        "wit-inspect:linera/native/inspection-outcome": linera_inspect_schema::dto::InspectionOutcome,
        "wit-inspect:linera/native/inspection-step-outcome": linera_inspect_schema::dto::InspectionStepOutcome,
        "wit-inspect:linera/native/step-kind": linera_inspect_schema::dto::StepKind,
        "wit-inspect:linera/native/container-kind": linera_inspect_schema::dto::ContainerKind,
        "wit-inspect:linera/native/header-format": linera_inspect_schema::dto::HeaderFormat,
        "wit-inspect:linera/native/analysis-scope": linera_inspect_schema::dto::AnalysisScope,
        "wit-inspect:linera/native/endianness": linera_inspect_schema::dto::Endianness,
        "wit-inspect:linera/native/file-range": linera_inspect_schema::dto::FileRange,
        "wit-inspect:linera/native/macho-value": linera_inspect_schema::dto::MachoValue,
        "wit-inspect:linera/native/cpu-identity": linera_inspect_schema::dto::CpuIdentity,
        "wit-inspect:linera/native/command-location": linera_inspect_schema::dto::CommandLocation,
        "wit-inspect:linera/native/platform-declaration": linera_inspect_schema::dto::PlatformDeclaration,
        "wit-inspect:linera/native/signature-command": linera_inspect_schema::dto::SignatureCommand,
        "wit-inspect:linera/native/image": linera_inspect_schema::dto::Image,
        "wit-inspect:linera/native/report": linera_inspect_schema::dto::Report,
        "wit-inspect:linera/native/inspection-failure": linera_inspect_schema::dto::InspectionFailure,
        "wit-inspect:linera/native/inspection-error": linera_inspect_schema::dto::InspectionError,
        "wit-inspect:linera/native/analysis-error": linera_inspect_schema::dto::AnalysisError,
        "wit-inspect:linera/native/error-kind": linera_inspect_schema::dto::ErrorKind,
        "wit-inspect:linera/native/truncated-range": linera_inspect_schema::dto::TruncatedRange,
        "wit-inspect:linera/native/source-failure": linera_inspect_schema::dto::SourceFailure,
        "wit-inspect:linera/native/source-operation": linera_inspect_schema::dto::SourceOperation,
        "wit-inspect:linera/native/read-error": linera_inspect_schema::dto::ReadError,
        "wit-inspect:linera/native/io-failure": linera_inspect_schema::dto::IoFailure,
        "wit-inspect:linera/native/incomplete-read": linera_inspect_schema::dto::IncompleteRead,
        "wit-inspect:linera/native/invalid-read-count": linera_inspect_schema::dto::InvalidReadCount,
    },
});

struct Component;
impl exports::wit_inspect::linera::native::Guest for Component {
    fn inspect(resource_id: String) -> linera_inspect_schema::dto::InspectionOutcome {
        linera_inspect_schema::inspect(resource_id)
    }
}
export!(Component);
