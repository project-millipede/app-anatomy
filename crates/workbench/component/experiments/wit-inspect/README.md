# Linera Witty inspection trial

Pinned generator: `linera-io/linera-protocol` at
`672d97bb2fce3127db351069df72f1d225d8f263` (Witty 0.16.0).
This isolated workspace exercises the real ordinary Rust `Session::inspect`.

## Build and verify

Install Rust 1.95.0 with rustfmt and wasm32-unknown-unknown, Node 24, wasm-tools,
and the repository's locked pnpm dependencies. From the repository root:

```sh
RUSTUP_TOOLCHAIN=1.95.0 cargo fetch --locked --manifest-path crates/workbench/component/experiments/wit-inspect/Cargo.toml
node --experimental-wasm-jspi crates/workbench/component/experiments/wit-inspect/run.mjs
node crates/workbench/component/experiments/wit-inspect/maintenance.mjs
```

The runner regenerates `guest/wit` using Witty, tests native Rust and builds five
fixture-seeded components. Generated jco/JSPI results are compared completely with
`support/expected-baseline.json`. Verification output stays under ignored `target/`.
The maintenance script temporarily renames one DTO field, regenerates/compiles and
restores the original sources and WIT. No captured run output is tracked.

## Results and limits

Five scenarios passed: signed Mach-O success with platform/signature locations,
missing selection, metadata failure, unsupported ELF, and retained read failure.
Native tests retain the original PermissionDenied cause before error projection.
The frozen expected tree came from the unchanged production adapter at `92ad854`,
executed through a separate fixture component; it does not use this projector.
Binary fixture provenance and digests are in `support/fixtures.json`.

Witty generates the complete schema from marked concrete DTOs and the annotated
interface. The standard wit-bindgen 0.60 Guest and its 26 `with` mappings remain
handwritten. Compatible DTOs are lowered directly without another field-copy layer.
Four owner enums have optional `wit-inspect-probe` metadata derives; those features
are default-off and absent from the ordinary library dependency graph. Validated
core FileRange and all ordinary operation signatures/error semantics remain intact.

This is a **partial flat API**, not the production Session resource/factory.
Package/interface partition, resource-id parameter and step-result field differ.
Generated WIT stays unmodified; the typed projection preserves all report and
ordered diagnostic data. Browser/networking/real async imports are not qualified.
Signature-command presence is not signature verification.

## Maintained work

- DTOs: 17 records/44 fields and 5 enums, 130 Rust lines.
- Report/error/outcome projection: 160 lines, including a pointer-width guard.
- Interface/forwarder: 18 lines; schema writer: 18 lines.
- Manual Guest and 26 mappings: 41 lines; owner annotations/imports: 10 lines.
- A DTO field rename required two authored edits; schema and guest compiled
  automatically afterward. Renamed-field runtime execution was not measured.

These counts include comments/blank lines and exclude verification support.
The original generic Outcome/StepOutcome are not reused across this boundary.
Witty removes manual schema authoring, but no significant overall handwriting
reduction or exact production-contract compatibility has been demonstrated.
