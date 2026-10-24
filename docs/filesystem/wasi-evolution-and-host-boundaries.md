# WASI evolution and host boundaries

**Interface and tooling review, 2026-09-18. No preview migration, runtime or
filesystem provider is adopted by this document.**

WASI remains relevant when comparing execution variants, even if the chosen
native implementation does not use it. The reusable Rust core can run natively
through ordinary storage abstractions; a component adapter can expose the same
analysis through WASI-backed or custom host interfaces.

This study owns preview versions, resource semantics and provider compatibility.
The [filesystem overview](README.md) owns backend comparison and artifact
preservation. The [browser and Wasm study](browser-filesystem-and-wasm-boundaries.md)
owns the concrete read, transfer and copy sequences.

## Preview versions change the contract

| Version              | Guest reference             | Relevant interface model                     |
| -------------------- | --------------------------- | -------------------------------------------- |
| Preview 1            | Numeric descriptor          | Core Wasm imports and guest-memory buffers   |
| Preview 2 / WASI 0.2 | Typed `descriptor` resource | WIT interfaces, stream resources and polling |
| Preview 3 / WASI 0.3 | Typed `descriptor` resource | Component async support, streams and futures |

Preview 1's descriptor number identifies a guest-facing entry; it is not a
promise that the same number identifies a native OS descriptor. Preview 2 adds
Component Model ownership and borrowing through resources. Preview 3 retains
resources while changing how asynchronous operations are expressed. These
changes do not automatically grant more operating-system privileges.
[Preview 1 descriptor implementation](https://docs.wasmtime.dev/api/src/wasmtime_wasi/p1.rs.html),
[WIT resource semantics](https://component-model.bytecodealliance.org/design/wit.html#resources).

WASI 0.3.0 was released on 11 June 2026. At this review, the release listing marks
0.3.1, released on 11 August 2026, as latest.
[WASI 0.3.1 release](https://github.com/WebAssembly/WASI/releases/tag/v0.3.1),
[release schedule](https://github.com/WebAssembly/WASI/blob/main/docs/Release.md).

The reviewed release schedule and Component Model milestones do not identify a
published Preview 4 specification. Future threading designs exist, but they must
not be presented as an agreed Preview 4 contract.
[Component Model milestones](https://github.com/WebAssembly/component-model#milestones),
[experimental features](https://github.com/WebAssembly/component-model/blob/main/design/mvp/Explainer.md#gated-features).

## A resource is not a native file descriptor

A WIT resource provides a typed handle with defined operations and lifetime.
Its implementation remains behind the host boundary. A native provider can
associate it with an open OS file; a browser provider can associate it with a
browser file handle or another permitted storage object.

Wasmtime resolves a resource through its host table before accessing the native
file. The guest calls the exposed interface; it does not receive that file's raw
OS descriptor or automatically gain arbitrary native system calls.
[Wasmtime filesystem implementation](https://docs.wasmtime.dev/api/src/wasmtime_wasi/p2/host/filesystem.rs.html),
[native file and permission wrapper](https://docs.wasmtime.dev/api/wasmtime_wasi/filesystem/struct.File.html).

Preview 3's filesystem bindings still use `Resource<Descriptor>` and expose no
raw native-fd getter. A numeric representation in generated bindings is not an
OS descriptor that the guest can pass to native APIs.
[Preview 3 filesystem bindings](https://docs.wasmtime.dev/api/wasmtime_wasi/p3/bindings/filesystem/types/trait.HostDescriptorWithStore.html).

A host can expose additional custom interfaces. Those require explicit contracts,
implementations and permission handling; they do not arise from selecting a
newer preview. Keep WASI types in the component adapter, outside the core's
portable artifact and storage models.

## Interface, provider and storage capabilities

- **Interface:** WIT defines the operations and values available to the guest.
- **Provider:** The host implements those operations and controls resource access.
- **Storage:** OS permissions, filesystem support and the acquired representation
  determine what information and operations the provider can supply.

An operation defined by WASI does not establish faithful support in every browser
shim. A richer host interface also cannot recover metadata omitted during input
acquisition. The [guest-interface comparison](README.md#guest-interfaces-and-metadata-fidelity)
preserves the reviewed metadata, path and link restrictions alongside artifact
requirements.

## What Preview 3 changes for reading

Preview 3 streaming file reads return `stream<u8>` together with a future carrying
completion or error information. Streaming I/O replaces Preview 2's explicit stream
resources and polling with the Component Model's asynchronous machinery.
Directory iteration replaces its resource-based iterator with a stream.
[WASI 0.3 release notes](https://github.com/WebAssembly/WASI/releases/tag/v0.3.0).

This can simplify the coordination of reads and backpressure. It does not expose
native filesystem privileges or establish a zero-copy parsing path. A conventional
Rust/Wasm parser still needs access to the requested bytes in guest memory.
Streaming can bound the amount resident at once when the provider and parser
support that access pattern; it would not satisfy the
[no-input-bytes-in-Wasm constraint](browser-filesystem-and-wasm-boundaries.md#acquisition-and-byte-transfer-requirements).
The accepted [architecture decision](../architecture/wasm-analysis-with-native-filesystem.md)
now permits bounded input ranges in Wasm while keeping filesystem acquisition native.

## Tool support and provider support are separate

jco documents Preview 3 stream integration with JavaScript asynchronous iterables.
Its project structure describes `preview3-shim` as a Node.js host implementation.
Neither statement qualifies a browser provider for newly selected application
folders.
[jco Preview 3 streams](https://bytecodealliance.github.io/jco/advanced/preview3-streams-and-backpressure.html),
[jco package responsibilities](https://bytecodealliance.github.io/jco/contributing.html#project-structure).

Specification release and runtime maturity are separate: the reviewed Wasmtime
`p3` development documentation labels its implementation experimental and incomplete.
That is a finding about the documented implementation, not the status of the
released WASI 0.3 contract.
[Wasmtime Preview 3 module](https://docs.wasmtime.dev/api/wasmtime_wasi/p3/index.html).

The repository pins [jco 1.36.0](../../package.json) and
[wit-bindgen 0.60.0](../../crates/workbench/component/Cargo.toml). Provider review
examined `preview2-shim` 0.20.2 separately. That provider review does not qualify
the shim version bundled with the current jco pin or establish a complete
Preview 3 integration. The application imports
Polymorph WebSocket operations; filesystem messages and native
reads follow the [Rust communication flow](../architecture/rust-runtime-independence/filesystem-communication-flow.md).
It does not import a WASI filesystem.

Missing operations in a particular browser shim are narrower findings. The reviewed
preview2-shim 0.20.2 artifact's `dist/browser/filesystem.js` has a `readlinkAt`
method returning an empty string and a `symlinkAt` method that only logs.
`wasi-fs-access` also has unimplemented symlink operations. It targets Preview 1
and Asyncify, so it is not a drop-in WASI Preview 2 provider for the jco component
route. These findings do not establish that every WASI provider has the same
limitations.
[preview2-shim 0.20.2 package](https://www.npmjs.com/package/@bytecodealliance/preview2-shim/v/0.20.2),
[`wasi-fs-access` project](https://github.com/GoogleChromeLabs/wasi-fs-access).

The concrete `wasi-fs-access` read and copy operations remain in the
[browser sequence study](browser-filesystem-and-wasm-boundaries.md#proposed-descriptor-backed-range-reads).
An experiment must record the WIT version, guest bindings, transpiler or native
runtime, and provider separately. Successful component generation alone does not
verify filesystem operations, permissions or metadata preservation.

## Build tools and embedded files have different roles

wasi-sdk supplies a guest build toolchain; wasi-libc supplies a guest C library.
They do not supply browser access to native filesystem services.
[wasi-sdk](https://github.com/WebAssembly/wasi-sdk),
[wasi-libc](https://github.com/WebAssembly/wasi-libc).

Embedding files through WASI-Virt can provide controlled fixtures. It does not
establish live acquisition of a newly selected application or recover metadata
omitted while preparing that representation.
[WASI-Virt filesystem](https://github.com/bytecodealliance/WASI-Virt#filesystem).

Native Rust, native-hosted Wasm and browser Wasm remain separate
[execution choices](README.md#execution-models-and-communication). Each must meet
the shared [acceptance requirements](requirements.md); using or omitting WASI
does not by itself qualify the complete workflow.
