# Tool and host dependency inventory

**Status: proposed inventory approach, 2026-09-17. Seed findings come from existing
source reviews; no workflow audit has run. This is not an exhaustive register.**

Expose each operation's dependencies, including calls hidden behind library APIs.
The [portability requirements](requirements.md) own
policy; the [complete-workflow experiments](complete-workflow-experiments.md) own
execution procedures and acceptance evidence. This document owns the dependency
records that connect those requirements to concrete implementations.

## Record every dependency path

Start with an operation such as reading dependencies, changing a runpath,
reassembling a universal file or sealing resources. Follow its complete call chain:
our adapter, library entry point, helper, subprocess or host service. Inventory
every external tool call, including scripts, shell commands, child processes and
transitive helper invocations. A Rust API name does not establish independence
from external tools.

Also record dependencies without subprocesses: dynamically or statically linked
native libraries, FFI, operating-system APIs, filesystem behavior, component
imports and runtime services. These may constrain portability even when no command
is launched. Reuse a shared dependency record where appropriate, but retain every
operation's route to it.

| Record                   | Information to retain                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operation and call chain | Intended effect, Rust entry point, each intermediary and final tool/library/API. Distinguish direct from transitive dependencies.                        |
| Mechanism and conditions | Subprocess, script, FFI, host API or component import; architecture, target OS, features and input conditions selecting the branch.                      |
| Purpose                  | Product build, fixture generation, input processing/output production, or verification. Identify required versus optional use.                           |
| Resolved implementation  | Exact tool, library and runtime versions; resolved executable/library paths, build features, invocation arguments and relevant configuration.            |
| Host interaction         | Files read/written, temporary storage, permissions, metadata/symlink requirements, environment variables and network/service access.                     |
| Absence and fallback     | Behavior when unavailable: explicit failure, alternate implementation, skipped work or successful return without the requested effect.                   |
| Evidence                 | Versioned source location or observed trace, host/runtime, input digest, date and retained reproduction details. Label inferred and unobserved branches. |
| Disposition              | Eligible for a scoped experiment, adaptation required, unsupported for this route or unresolved; name the affected operation and environment.            |

## Include conditional and missing-tool behavior

Follow feature- and architecture-dependent branches before interpreting a successful
return. A helper can call an external tool only for one architecture, or perform
less work when that tool is absent. The record must state whether the intended
transformation occurred, not merely whether the wrapper returned success.

Source inspection can identify possible branches; an observed run establishes
only the branch exercised by its recorded input and environment. Cargo feature
resolution, linked native code and generated build scripts must also be accounted
for. “Not observed” is not evidence that a dependency cannot be reached.

For illustration, any future `otool`, `install_name_tool` or `lipo` invocation
would receive a record describing its purpose and replacement or deployment
requirements. These are audit examples, **not findings that App Anatomy currently
invokes those tools**.

## Seed findings to carry into the register

These entries identify existing review evidence to investigate. They do not record
dependencies adopted by the application or successful portability experiments.

| Reviewed route                   | Existing finding and detailed source review                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libsui` 0.16.4 Intel helper     | Architecture/host-dependent Apple-tool behavior and a build-only success path require explicit outcome accounting. [Helper and signer screening](../libraries/selection-and-reuse.md#where-libsui-fits).                                                       |
| Full `apple-codesign` 0.29.0     | Unconditional blocking-HTTP imports create a documented Wasm dependency blocker, even when signing does not request networking. [Dependency screening](../libraries/selection-and-reuse.md#where-apple-codesign-fits).                                         |
| LIEF Rust interface              | The C++ bridge and selected native libraries require recorded build/runtime dependencies; native and browser integration remain separate unproven routes. [Rust bridge study](../libraries/lief-selective-builds-and-wasm.md#rust-api-and-bridge-constraints). |
| Bryan's `macho` feature profiles | Additive Cargo features can bring full signing or analysis dependencies into an intended narrow build. [Feature screening](../libraries/bryanmatteson-macho-evaluation.md#feature-and-portability-screening).                                                  |
