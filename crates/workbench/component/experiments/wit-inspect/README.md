# WITGenstein inspection experiment

This normal-adoption trial generates the full typed WIT schema. The shipped
wrapper fails with E0425; a separately maintained Rust bridge passes five complete
jco/JSPI payload comparisons. Exact production WIT parity and a reduction in
handwritten application code are not established.

## Inputs and implementation

- Production base: `92ad854`; production and upstream code remain unchanged.
- Generator: [WITGenstein `f915331135cd409893890b9fea91cd8a69d2e864`](https://github.com/tschneidereit/witgenstein/commit/f915331135cd409893890b9fea91cd8a69d2e864).
- [Facade](src/lib.rs): annotated local Session with constructor and inspect(String),
  forwarding to the real ordinary Rust Session::inspect(&str).
- [DTOs](src/dto.rs) and [projection](src/project.rs): explicit complete output
  declarations and report/error conversion, including matching-field copies.
- [Generated WIT](wit/inspection.wit): checked-in build input, regenerated unchanged.
- [Manual bridge](bridge/src/lib.rs): wit-bindgen 0.60 and 26 direct DTO remaps.
- [Fixtures](src/fixtures/PROVENANCE.json): pinned upstream corpus inputs and hashes.
- [Expected payloads](src/fixtures/expected-baseline.json): frozen 5,392-byte output
  from production converters at the base commit, independently invoked through jco.
- [Stock-wrapper lock](support/stock-wrapper.lock): active reproducibility input for
  the unmodified generator-created workspace, not a retained run log.

The experiment has one Cargo workspace/lockfile for its facade, bridge and native
control. Default members select only the facade library so the shipped rustdoc
invocation has one target. The stock wrapper creates its own workspace as shipped.
Ordinary Rust execution needs no JavaScript, component, service or Wasm runtime.

## Run

Requires Rust 1.95.0 with wasm32-unknown-unknown and wasm32-wasip2, Node 24,
wasm-tools, and the repository's locked Node dependencies (jco 1.40.0).
Rust 1.95 supplies rustdoc JSON format 57 required by the pinned generator;
Rust 1.98 format 60 is not used to judge schema support.

```sh
RUSTUP_TOOLCHAIN=1.95.0 cargo install --locked --git https://github.com/tschneidereit/witgenstein --rev f915331135cd409893890b9fea91cd8a69d2e864 --root /private/tmp/witgenstein-f915331-tool witgenstein-rs
python3 crates/workbench/component/experiments/wit-inspect/run-adoption.py
python3 crates/workbench/component/experiments/wit-inspect/maintenance.py
python3 crates/workbench/component/experiments/wit-inspect/run-adoption.py
```

WITGENSTEIN_BIN overrides that tool installation. The runners use Rust 1.95 and
Cargo offline mode; fetch locked dependencies once when network is available.
If a first run stops for an uncached stock-wrapper dependency, fetch its generated
manifest with `cargo fetch --locked --manifest-path <experiment>/target/witgenstein/component/Cargo.toml`
and rerun. Dependency/setup errors are not accepted as the expected E0425 result.
All regenerated logs, components, bindings and snapshots go under ignored target/;
verification output is in target/verification. Nothing there is a committed input.

## Findings and scope

All five native assertions and facade executions pass: Mach-O success with
platform/signature-command evidence, selection failure, metadata failure,
unsupported ELF input and read failure. The native read assertion retains the
original PermissionDenied io::Error. All five full jco trees match the frozen
production payloads, preserving u64 and present undefined options; only stepResult
is renamed to result for comparison. A second resource survives the first's
disposal and supports repeated inspection. Runtime Promise return is checked.

The unmodified stock wrapper fails because InspectionOutcome is unresolved in its
[generated delegate](https://github.com/tschneidereit/witgenstein/blob/f915331135cd409893890b9fea91cd8a69d2e864/crates/witgenstein-rs/src/codegen.rs#L163).
The working fallback consumes generated WIT verbatim; it is counted as manual.
The interface/world, constructor instead of factory, and step-result field differ
from production. This export-only fixture world does not qualify Polymorph imports,
real service/network/dialog behavior, browser execution, Linux or Windows.
Signature-command evidence is not signature validity. jco's synchronous declaration
still needs the existing mapped async Session typing pattern for JSPI consumers.

Maintenance renames Report.byte_length and its projection literal: two Rust lines.
WIT generation, bridge compilation and complete success-payload comparison follow
the intentional rename. Both Rust files and generated WIT are then restored.
No WIT or TypeScript declaration is manually edited during the exercise.

## Maintained cost

Including comments and blank lines: facade 33 Rust lines; DTOs 150 (17 records,
9 enums, 44 fields, 26 derives); projection 175; manual bridge 62: **420 adoption
Rust lines**, plus 9 native-control and 254 shared fixture/assertion lines.
The concrete DTO graph and projection remain handwritten; generic core outcomes
are not reused. Zero production binding lines were removed. No copying, runtime,
build-time or net maintenance reduction was measured.
