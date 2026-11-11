//! Manually maintained standard bridge, separate from WITGenstein's generated bridge.
//!
//! The generated WIT is consumed unchanged. Compatible concrete DTOs are remapped
//! so this bridge does not reconstruct the result graph a second time.

use std::cell::RefCell;
use wit_inspect_witgenstein as facade;

wit_bindgen::generate!({
    path: "../wit/inspection.wit",
    world: "apple-code:analysis/wit-inspect-witgenstein-world@0.5.0",
    with: {
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/inspection-outcome": wit_inspect_witgenstein::InspectionOutcome,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/inspection-step-outcome": wit_inspect_witgenstein::InspectionStepOutcome,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/step-kind": wit_inspect_witgenstein::StepKind,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/container-kind": wit_inspect_witgenstein::ContainerKind,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/header-format": wit_inspect_witgenstein::HeaderFormat,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/analysis-scope": wit_inspect_witgenstein::AnalysisScope,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/endianness": wit_inspect_witgenstein::Endianness,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/file-range": wit_inspect_witgenstein::FileRange,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/macho-value": wit_inspect_witgenstein::MachoValue,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/cpu-identity": wit_inspect_witgenstein::CpuIdentity,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/command-location": wit_inspect_witgenstein::CommandLocation,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/platform-declaration": wit_inspect_witgenstein::PlatformDeclaration,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/signature-command": wit_inspect_witgenstein::SignatureCommand,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/image": wit_inspect_witgenstein::Image,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/report": wit_inspect_witgenstein::Report,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/inspection-failure": wit_inspect_witgenstein::InspectionFailure,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/inspection-error": wit_inspect_witgenstein::InspectionError,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/analysis-error": wit_inspect_witgenstein::AnalysisError,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/error-kind": wit_inspect_witgenstein::ErrorKind,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/truncated-range": wit_inspect_witgenstein::TruncatedRange,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/source-failure": wit_inspect_witgenstein::SourceFailure,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/source-operation": wit_inspect_witgenstein::SourceOperation,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/read-error": wit_inspect_witgenstein::ReadError,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/io-failure": wit_inspect_witgenstein::IoFailure,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/incomplete-read": wit_inspect_witgenstein::IncompleteRead,
        "apple-code:analysis/wit-inspect-witgenstein@0.5.0/invalid-read-count": wit_inspect_witgenstein::InvalidReadCount,
    },
    generate_all,
});

use exports::apple_code::analysis::wit_inspect_witgenstein as api;

struct Component;
struct Session(RefCell<facade::Session>);

impl api::Guest for Component {
    type Session = Session;
}

impl api::GuestSession for Session {
    fn new() -> Self {
        Self(RefCell::new(facade::Session::new()))
    }

    fn inspect(&self, resource: String) -> facade::InspectionOutcome {
        self.0.borrow_mut().inspect(resource)
    }
}

export!(Component);
