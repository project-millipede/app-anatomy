# LIEF selective builds and Rust/Wasm integration

## Problem and scope

We want to reuse LIEF's binary-format implementation without automatically
shipping every format, binding and optional capability with our application.
The first target is Mach-O inspection and rewriting, with an ordinary Rust API
that can serve native consumers and a separately built browser component.

There are three decisions to make: which C++ functionality to compile, how Rust
calls it, and how the browser receives the resulting Wasm. Selecting fewer Rust
imports does not by itself answer the other two questions.

**Status: researched approach, 2026-09-16; no LIEF dependency adopted, local LIEF
build performed or project footprint measured.** Source review covered LIEF
[1.0.0](https://github.com/lief-project/LIEF/tree/d05b3499b6934137e917c009a4df0a9dc8cb11c5)
and the relevant Rust files on
[main at `d005663`](https://github.com/lief-project/LIEF/tree/d005663ac7bfab4feca435d01dfc87667907ce42/api/rust).

This document owns the LIEF-specific integration approach. The
[foundation comparison](selection-and-reuse.md) compares alternative libraries. The
[rebuilding and re-signing plan](../rebuilding/application-relocation-and-signing.md) explains the
application-relocation problem. The separate
[native LIEF experiment](lief-native-macho-rewriting-experiment.md) owns the
controlled correctness procedure.

The [shared portability requirements](../portability/requirements.md) govern this
integration; the [complete-workflow experiments](../portability/complete-workflow-experiments.md)
qualify its use with the other transformation stages.

## Contents

- [What can be selected at build time](#what-can-be-selected-at-build-time)
- [Rust API and bridge constraints](#rust-api-and-bridge-constraints)
- [What existing Wasm evidence establishes](#what-existing-wasm-evidence-establishes)
- [Preferred component toolchain](#preferred-component-toolchain)
- [Reusable boundaries](#reusable-boundaries)
- [Evaluation sequence](#evaluation-sequence)
- [Measurements and adoption criteria](#measurements-and-adoption-criteria)

## What can be selected at build time

LIEF has a common library target, `LIB_LIEF`, whose source selection is
configurable by format. A reduced build does not require introducing separate
upstream crates or rewriting the Mach-O implementation.

| Selection             | Proposed initial settings                                                                                                   | Effect and limits                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Mach-O                | `LIEF_MACHO=ON`                                                                                                             | Retain image parsing, data model and rebuilding.                                                      |
| Other formats         | `LIEF_ELF=OFF`<br>`LIEF_PE=OFF`<br>`LIEF_COFF=OFF`<br>`LIEF_DEX=OFF`<br>`LIEF_ART=OFF`<br>`LIEF_OAT=OFF`<br>`LIEF_VDEX=OFF` | Exclude unrelated formats. Disable PE and COFF together.                                              |
| JSON and logging      | `LIEF_ENABLE_JSON=OFF`<br>`LIEF_LOGGING=OFF`<br>`LIEF_LOGGING_DEBUG=OFF`                                                    | Omit optional behavior; common support or fallback code may remain.                                   |
| Runtime and Extended  | `LIEF_RUNTIME=OFF`<br>`LIEF_DEBUG_INFO=OFF`<br>`LIEF_OBJC=OFF`<br>`LIEF_DYLD_SHARED_CACHE=OFF`<br>`LIEF_ASM=OFF`            | First experiment: file processing only. Disabled implementations may retain declarations and stubs.   |
| Unused language APIs  | `LIEF_PYTHON_API=OFF`<br>`LIEF_C_API=OFF`                                                                                   | Omit upstream bindings; a custom narrow C-compatible adapter remains possible.                        |
| Upstream Rust support | Evaluate `LIEF_RUST_API=ON` if retaining the stock Rust bridge                                                              | Not a per-format binding selector. A custom adapter may use a different build.                        |
| Development targets   | `LIEF_EXAMPLES=OFF`<br>`LIEF_TESTS=OFF`<br>`LIEF_COMPILE_DOC_EXAMPLES=OFF`                                                  | Skip unrelated tools. Savings mainly concern build work, not code normally shipped in the library.    |
| Linkage               | `BUILD_SHARED_LIBS=OFF` for the initial experiment                                                                          | Static library for a consumer or Wasm module. Final code retention depends on references and exports. |

This is a proposed selection profile, not a tested standalone CMake invocation.
Toolchain, bridge, dependency and runtime configuration remain necessary.
The format switches gate source directories; the Mach-O source list includes both
parser and builder code, with no separate parser-only switch in that list.
[LIEF options](https://github.com/lief-project/LIEF/blob/1.0.0/cmake/LIEFOptions.cmake),
[source selection](https://github.com/lief-project/LIEF/blob/1.0.0/src/CMakeLists.txt),
[Mach-O sources](https://github.com/lief-project/LIEF/blob/1.0.0/src/MachO/CMakeLists.txt).

Three forms of reduction must be measured separately:

- **Build-time selection:** do not compile an unwanted subsystem.
- **Link-time elimination:** remove functions and data unreachable from the
  selected exports and entry points.
- **Runtime parsing configuration:** skip work or data while processing an input;
  this does not establish that the corresponding implementation was omitted.

Common streams, error handling, allocation and other required support remain.
Changing a dependency from bundled to externally linked also does not eliminate
the dependency itself.
[LIEF dependency integration](https://lief.re/doc/stable/compilation.html#third-party).

## Rust API and bridge constraints

The stock `lief` and `lief-ffi` Cargo features do not select Mach-O, ELF or PE.
The exposed TLS options concern the build helper's artifact downloads.
`default-features = false` is therefore not a Mach-O-only build instruction.
[lief manifest](https://github.com/lief-project/LIEF/blob/1.0.0/api/rust/crates/lief/Cargo.toml),
[FFI manifest](https://github.com/lief-project/LIEF/blob/1.0.0/api/rust/crates/lief-ffi/Cargo.toml).

The Rust interface uses `cxx`. Its generator discovers bridge modules across the
source tree, and the bridge CMake project compiles the generated C++ files.
That bridge must be considered alongside the C++ library, rather than assuming
that a small Rust `use` statement selects an equally small implementation.
[Bridge generator](https://github.com/lief-project/LIEF/blob/1.0.0/api/rust/crates/lief-ffigen/src/main.rs),
[bridge build](https://github.com/lief-project/LIEF/blob/1.0.0/api/rust/cmake-ffi/CMakeLists.txt).

There is a concrete reference-retention issue: the generic Rust `Binary::parse`
and `Binary::from` paths dispatch across ELF, PE, Mach-O and COFF. The C++ stream
bridge likewise references these parsers. Use typed Mach-O entry points in the
size experiment and inspect what remains linked. Do not use generic dispatch
against a reduced implementation without resolving its cross-format references.
[Rust dispatch](https://github.com/lief-project/LIEF/blob/1.0.0/api/rust/crates/lief/src/binary.rs),
[stream bridge](https://github.com/lief-project/LIEF/blob/1.0.0/api/rust/include/LIEF/rust/Stream.hpp).

`LIEF_RUST_PRECOMPILED` can supply a directory containing custom `libLIEF.a` and
`liblief-sys.a` artifacts. This changes artifact acquisition; it does not trim
bindings, rebuild the libraries or prove their ABI compatibility. On the normal
download path, the inspected supported-target lists contain native targets and
omit Wasm. The custom-artifact override provides a possible route to evaluation,
not an already supported Wasm package.
[Rust integration](https://lief.re/doc/stable/api/rust/index.html),
[build helper](https://github.com/lief-project/LIEF/blob/1.0.0/api/rust/crates/lief-build/src/lib.rs).

A Mach-O-only C++ build is supported by the format-selection machinery.
**A Mach-O-only C++ build combined with the entire unchanged stock Rust bridge
remains unverified.** First try the narrow typed path; if bridge references or
build assumptions prevent reduction, evaluate a small purpose-specific adapter.
Keep parsing and rewriting in LIEF and domain policy in Rust.

## What existing Wasm evidence establishes

Postject provides a concrete precedent for LIEF compiled through Emscripten:

- Its pinned [build script](https://github.com/nodejs/postject/blob/3c4f2080ee56025716c3add0f6c03b16e2af54ff/scripts/build.mjs)
  invokes Emscripten; its
  [CMake configuration](https://github.com/nodejs/postject/blob/3c4f2080ee56025716c3add0f6c03b16e2af54ff/CMakeLists.txt)
  links LIEF and disables several unrelated features.
- Its [C++ wrapper](https://github.com/nodejs/postject/blob/3c4f2080ee56025716c3add0f6c03b16e2af54ff/src/postject.cpp)
  uses Embind, accepts byte buffers and invokes ELF, Mach-O and PE operations.
- Research inspected the published `postject@1.0.0-alpha.6` artifact without
  installing or executing it. Its JavaScript embeds a 3,476,759-byte payload with
  the WebAssembly v1 header. This establishes shipped Wasm; it is not a footprint
  estimate for our proposed component.
  [Published package metadata](https://registry.npmjs.org/postject/1.0.0-alpha.6).

The [dependency pin](https://github.com/nodejs/postject/blob/3c4f2080ee56025716c3add0f6c03b16e2af54ff/DEPENDENCIES)
is an older LIEF commit, `b183666`, whose vendored source declares 0.13.0.
Postject's surrounding JavaScript uses Node APIs. Its artifact proves neither a
current LIEF 1.0.0 build nor an unchanged browser, Rust/`cxx` or WIT/jco integration.
Use it as a build reference and a source of test cases.

LIEF's file parsers and writers process executable bytes. They do not launch the
input executable as part of those operations. A Wasm port would run LIEF's own
instructions while treating Mach-O instructions as input data. Native execution
of a rewritten fixture remains part of the separate rebuild experiment.

## Preferred component toolchain

Evaluate the WASI/component workflow first because it matches our existing WIT
and jco boundary. Emscripten remains a maintained C/C++ browser toolchain and a
useful compatibility reference; the preference here is architectural.
[Emscripten overview](https://emscripten.org/docs/introducing_emscripten/about_emscripten.html).

| Tool                            | Role in the proposed experiment                                                   |
| ------------------------------- | --------------------------------------------------------------------------------- |
| WASI SDK / Clang                | Compile selected LIEF C++ sources, dependencies and any C++ bridge to Wasm.       |
| Rust compiler                   | Compile Rust for a compatible target if retaining the Rust/C++ bridge.            |
| `wit-bindgen`                   | Generate component interface bindings.                                            |
| Component linker / `wasm-tools` | Produce and validate the component; adapt older WASI imports if using that route. |
| `jco`                           | Generate browser integration and core Wasm assets.                                |

Current C/C++ tooling supports direct `wasm32-wasip2` component builds. That
capability does not establish that LIEF or its stock bridge builds unchanged.
[Bytecode Alliance C/C++ guide](https://component-model.bytecodealliance.org/language-support/building-a-simple-component/c.html).

Our [current build script](../../scripts/build-engine.ts) uses
`wasm32-unknown-unknown`, then component packaging, with automatic WASI shims
disabled. Keep the LIEF experiment isolated until target and import changes are
understood. Identify the actual required host imports and provide only suitable
implementations. A WASI interface does not grant browser access to macOS services.
[jco browser import support](https://bytecodealliance.github.io/jco/transpiling.html#wasi-shims).

## Reusable boundaries

Keep Workbench classification, evidence interpretation and planning in ordinary
Rust. Third-party C++/Rust types and generated WIT bindings should not become its
public domain API. Two implementation arrangements are candidates:

| Arrangement                                                                              | Reuse                                                         | Needs proof                                                                                   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Rust + `cxx` + C++ linked into one component                                             | Stock Rust API where compatible, or a narrow Rust/C++ adapter | Matching toolchains and ABI<br>Reduced build compatibility<br>Required runtimes<br>Final size |
| Separate C++ component behind narrow WIT;<br>consumed through the Rust component adapter | LIEF without requiring its stock `cxx` surface in Wasm        | Component composition<br>Conversion/copying cost<br>Consistent Rust domain interpretation     |

The second arrangement keeps generated component imports in the adapter.
Low-level facts returned by C++ still pass through Rust's domain layer before
React receives reports. It does not require putting Wasm-specific types into
`binary-inspection`.

Native consumers should continue to call ordinary Rust APIs. They can use native
LIEF artifacts through a native backend when implemented, without a Wasm runtime.
The present core has no LIEF dependency; this document creates no crates, public
backend interfaces or component contracts.

## Evaluation sequence

1. **Establish a native baseline.** Use the pinned stock Rust integration with a
   typed Mach-O entry point and controlled fixtures. Separate defects in the
   requested operation from cross-compilation issues.
2. **Prove selective compilation.** Build the proposed Mach-O-only C++ profile,
   inspect the selected sources and attempt the needed bridge operations. Retain
   the smallest bridge change that resolves a demonstrated incompatibility.
3. **Prove Wasm byte processing.** Compile a small selected operation with WASI
   SDK. List its imports, validate the module/component and compare results with
   the native baseline before introducing browser transport.
4. **Integrate the Rust/component boundary.** Test one chosen arrangement through
   the same typed domain conversion. Document any interface or target changes.
5. **Run through jco in an isolated worker harness.** This qualifies LIEF
   independently of the application's [native input flow](../filesystem/README.md).
   Exercise valid, malformed and unsupported
   inputs, memory limits and worker termination. Verify that failure is reported
   rather than silently dropping an architecture member.
6. **Evaluate rewriting separately from delivery.** Compare rewritten bytes and
   structural facts with native results. Use the
   [native rebuilding experiment](lief-native-macho-rewriting-experiment.md)
   for signing and execution checks on macOS. A successful Wasm build alone does
   not establish a correct or launchable rewritten application.

These are proposed checkpoints, not commands already run. Restrict initial
coverage to supported Mach-O fixtures and record known format limitations from
the [foundation comparison](selection-and-reuse.md#where-lief-is-useful).

## Measurements and adoption criteria

Use the same fixtures and operation surface when comparing stock, reduced native
and reduced Wasm builds. Record compiler/linker, SDK, Rust, LIEF and binding-tool
versions, complete options and input/output digests.

| Measurement                                       | Question                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| Compiled sources and dependencies                 | Were unrelated subsystems excluded?                                        |
| Final linked functions, data, exports and imports | What remains reachable through the selected interface?                     |
| Native consumer and Wasm/JavaScript sizes         | What ships? Static archive size alone is insufficient.                     |
| Compressed transfer size and cold worker startup  | What does browser delivery cost?                                           |
| Peak memory and copies across interfaces          | What does the full operation cost beyond the input buffer?                 |
| Per-fixture results and failures                  | Does reduction preserve intended native/Wasm behavior and explicit limits? |

LLVM's Wasm linker removes unused functions and data by default, while preserving
exports and their transitive dependencies. A narrow export surface helps, but
does not guarantee that only a small amount of implementation is reachable.
Avoid exporting the entire LIEF API merely for convenience.
[LLVM Wasm linker](https://lld.llvm.org/WebAssembly.html#garbage-collection).

Adoption requires a reproducible build, passing behavior checks, an understood
dependency/import surface and measured costs acceptable for the workbench.
Record gaps before deciding whether to narrow the supported operation, improve
an upstream binding or use a small adapter. Prefer reuse of LIEF's algorithms
over copying its format implementation into our Rust core.
