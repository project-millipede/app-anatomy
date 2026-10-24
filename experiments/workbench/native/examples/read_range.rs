//! Read a range through the native remote client and print its result as JSON.
use serde::Serialize;
use std::{
    io::{self, Write},
    process::ExitCode,
};
use workbench_native::{Failure, FailureKind, FileRead, FileRequest, read_range};

/// Presentation shape for this executable; Rust failures retain their sources.
#[derive(Serialize)]
struct OutcomeOutput {
    read: Result<FileRead, FailureOutput>,
}

#[derive(Serialize)]
struct FailureOutput {
    kind: FailureKind,
    message: String,
}

impl From<Failure> for FailureOutput {
    fn from(error: Failure) -> Self {
        let message = error.to_string();
        Self {
            kind: error.kind,
            message,
        }
    }
}

impl From<Result<FileRead, Failure>> for OutcomeOutput {
    fn from(read: Result<FileRead, Failure>) -> Self {
        Self {
            read: read.map_err(Into::into),
        }
    }
}

fn main() -> anyhow::Result<ExitCode> {
    use anyhow::Context;
    let mut arguments = std::env::args().skip(1);
    let endpoint = arguments.next().context("Expected endpoint")?;
    let offset = arguments.next().context("Expected offset")?.parse()?;
    let length = arguments.next().context("Expected length")?.parse()?;
    // Keep library failures as results so they receive the same JSON output as success.
    let read = read_range(FileRequest {
        endpoint,
        offset,
        length,
    });
    let exit_code = if read.is_ok() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    };
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &OutcomeOutput::from(read))?;
    writeln!(stdout)?;
    stdout.flush()?;
    Ok(exit_code)
}
