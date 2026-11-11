# Fidius inspection experiment

Unmodified Fidius generates WIT, record/variant converters, native ABI shims and
Guest delegates for the real ordinary `Session::inspect` operation in this trial.
All five native generated-ABI and jco/JSPI cases match the complete frozen oracle.

## Pins

- Fidius 0.5.9: [208b6010f9466c06f54e4cc10d66fa9985f12029](https://github.com/colliery-io/fidius/commit/208b6010f9466c06f54e4cc10d66fa9985f12029).
- Rust/Cargo 1.95.0; native aarch64-apple-darwin and wasm32-wasip2.
- Guest `wit-bindgen` 0.44.0; jco 1.40.0; Node 24.15.0 with JSPI enabled.
- The standalone Cargo.lock fixes dependency resolution outside the app workspace.

## Contract and ownership

The marked `Inspection` trait and unit plugin each expose one domain method.
Each call creates an operation-local **real** Rust Session with the fixture
transport, invokes its unchanged `inspect(&mut self, &str)`, then projects the
actual ordered steps, complete report and typed diagnostics. Native tests also
check the original PermissionDenied cause before boundary projection.

This is a **partial, flat plugin interface**, not the production WIT Session
resource: it does not qualify its factory, retained identity, selection lifetime
or asynchronous Polymorph imports. No store or registry emulates that resource.
The actual inspection operation and production declarations remain unchanged.

Fidius cannot specialize the existing generic outcome aliases or map their nested
Result field. Concrete local DTOs therefore use a typed Success/Failure variant.
Unit enums also become WIT variants. These wire differences are normalized only
by the test verifier; no report or diagnostic field is reconstructed or dropped.
The exported operation returns structured data, never an opaque JSON result.

`build.rs` invokes `fidius_build::emit_wit()`. The unedited generated
[wit/inspection.wit](wit/inspection.wit) is retained as the component build input.
The plugin macro includes its generated bidirectional converters and Guest.
Native uses the Fidius facade/core; Wasm uses the guest crate through a target
alias. jco binds the required WASI cli/clocks/io/random providers. No upstream
patch, manual Guest or standard-binding fallback is used.

## Handwritten maintenance cost

Counts include blank/comment lines, excluding documentation, lockfile and data.

| Responsibility                                                      | Lines      |
| ------------------------------------------------------------------- | ---------- |
| Concrete DTOs: 27 types, 44 named fields, 27 WitType markers        | 155        |
| Ordinary report/error/step projection: 11 functions and width guard | 184        |
| Trait/plugin composition and native client observation              | 38 + 11    |
| Build helper, Cargo configuration and output ignore rule            | 3 + 39 + 1 |
| Five-case driver                                                    | 32         |
| jco/WASI host harness and complete-tree verifier                    | 56 + 135   |
| Shared Rust fixture transport and native assertions                 | 254        |

The generator produces 142 WIT lines, 54 From implementations and native/Guest
ABI code; jco produces the application declarations. Generated work does not
remove the concrete DTOs, semantic projection or handwritten delegate above.
Production application binding lines removed: zero.

The field-rename trial changed `Report.byte_length` and its projector initializer:
two authored Rust lines. Fidius regenerated WIT and both converter directions;
jco returned `inputByteLength` with the same u64 value (40192). The original DTO,
projector and WIT were restored byte-for-byte. This measured a DTO change, not
automatic propagation from the ordinary Rust report.

## Verification

From the repository root, with the pinned toolchain, target and dependencies:

```sh
python3 crates/workbench/component/experiments/wit-inspect/run-adoption.py
RUSTUP_TOOLCHAIN=1.95.0 cargo fmt --manifest-path crates/workbench/component/experiments/wit-inspect/Cargo.toml -- --check
```

The driver runs five independent native fixture assertions, then native generated
ABI and Wasm/jco/JSPI calls for success, missing selection, metadata failure,
unsupported ELF and read failure. Its explicit Rust1.95.0 environment applies to
Cargo and build helpers. It checks Promise-based JSPI entry and complete trees,
including optional absence, u64 values, platform/signature locations and errors.
Signature-command locations do not establish signature validity or trust.

The frozen [expected-baseline.json](src/fixtures/expected-baseline.json) came from
the unchanged production adapter/converters at Workbench commit
`92ad854d0b908db0dd993e96d8359b8f2881cb7a` and is separate from runtime outputs.
[Fixture provenance](src/fixtures/provenance.json) pins the upstream corpus bytes.
Logs and observations are regenerated under ignored `target/verification/`;
jco modules remain under ignored target directories. The read case encounters one
diagnostic; multiple-error aggregation, big-endian inputs, live service/dialogs
and browser networking are not qualified by these fixtures.
