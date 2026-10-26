# Native writer ownership and completion

**Status: contract proposal, 2026-10-26. The depicted Rust writer API, LIEF adapter
and stream bridge are not implemented or qualified Workbench capabilities.**

Open [index.html](index.html) in a browser. This standalone interactive drawing
works offline without Codex, an application build, Wasm binaries or a native
service. Its JavaScript only presents the contract and illustrative outcomes;
it performs no rebuilding, filesystem operations or native execution.

This study is a sibling of the broader
[object, LIEF and Gum mapper boundaries](../object-lief-gum-mapper/README.md).
It focuses on a native writer interface and does not change that saved study.

## Explore the contract

Choose **Rust Vec adapter** or **C++ stream bridge**, then **Success**,
**Write error**, **Readback error** or **Sync error**. Each combination changes
the diagram's adapter, result or completion path. A fresh page starts with the
Rust Vec adapter and success scenario.

The illustrative ordinary Rust API is:

```rust
rewrite_into(original, plan, &mut writer)
    -> Result<RebuildReceipt, RebuildError>
```

The signature is a proposal, not a callable API. Apple binary interpretation,
planning and domain outcomes belong in `crates/binary/inspection`. Native binding
code hides LIEF's foreign types; filesystem staging and publication belong to the
caller or storage adapter. Native Rust use requires no JavaScript, Wasm or RPC.

## Ownership and failure rules

- **Separate input and output.** The caller owns the original input, change plan
  and isolated staging destination. The stage must not alias the original. LIEF's
  input adaptation and memory requirements need separate qualification; the drawing
  does not imply direct support for our bounded `ByteSource`.
- **Borrow for the call.** The writer is borrowed synchronously. The adapter must
  not retain, close, rename or publish it. Callback byte slices are valid only
  during the callback; Rust panics and C++ exceptions must not unwind across FFI.
- **Complete output delivery.** A `Write` provider may return short writes. The
  adapter completes them, treats zero progress with bytes remaining as
  `WriteZero`, and preserves the first provider failure. Check captured output
  errors even if LIEF reports success. A failed write can leave a partial stage;
  there is no automatic rollback.
- **Keep the receipt narrow.** A successful receipt means qualified reconstruction
  and acceptance of all output bytes by the supplied writer. It may describe
  length, qualified architecture inventory and applied changes. It does not mean
  durable storage, successful readback verification, publication, signature validity
  or execution eligibility.
- **Finalize explicitly.** The caller flushes buffering, requests any promised
  provider durability, reopens through a separate read handle and checks the staged
  result. A generic `Write` cannot reopen itself. Publication is a separate,
  fallible commit whose durability includes relevant publication metadata; a file
  replacement is not an automatic bundle transaction. Failed stages remain
  unpublished, with cleanup owned by the caller.

## LIEF facts and qualification limits

The source review is pinned to LIEF 1.0.0:

- Its thin Mach-O Rust API supplies `write_to_bytes()`. The first proposed adapter
  can deliver that buffer with ordinary Rust `write_all()`; upstream does not
  expose a generic Rust `Write` sink.
- The C++ Mach-O builder accepts `std::ostream&` for thin and universal binaries.
  A custom stream buffer could forward output to a Rust writer. That Rust bridge
  remains proposed; universal stream output is an upstream hook, not a qualified
  Workbench capability.
- Both routes retain LIEF's full reconstruction buffer. Chunking destination
  writes does not establish bounded-memory reconstruction, and the Rust byte API
  can introduce additional buffers and copies. This does not meet our complete
  bounded-I/O requirement merely by adding a provider.
- The inspected builder discards some nested build/write results and does not
  check the final stream state. A bridge cannot repair those gaps by itself.
  Unsupported inputs need explicit refusal, supported transformations need
  qualified checks, and provider errors need independent preservation.

The controls illustrate intended contracts, not evidence that LIEF, the bridge or
the proposed complete workflow satisfies them.

## Saved files and maintenance

| File                       | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| [index.html](index.html)   | Standalone export with presentation code and styles embedded. |
| [source.html](source.html) | Readable, editable visualization fragment.                    |

Edit `source.html` and regenerate `index.html` with the visualize skill's
standalone HTML exporter (this snapshot used version 1.0.55). Keep only its
`widgetState`/`setWidgetState` compatibility calls; the export supplies their local
fallback. Remove the exporter's unused Floating UI and Lucide CDN script tags
and restrict scripts/styles to inline content with network connections disabled.
The drawing uses neither library and must not load remote resources.

The export can remember route and scenario in local browser storage. Interaction
continues when storage is unavailable. Check all eight combinations, narrow
layouts, light/dark appearance, reload restoration and operation with networking
disabled when updating the export. These are presentation checks, not native
writer qualification.

## Sources and related studies

- [LIEF Rust Mach-O output](https://github.com/lief-project/LIEF/blob/1.0.0/api/rust/crates/lief/src/macho/binary.rs#L373-L409).
- [LIEF Rust universal output](https://github.com/lief-project/LIEF/blob/1.0.0/api/rust/crates/lief/src/macho/fat_binary.rs).
- [LIEF C++ builder interfaces](https://github.com/lief-project/LIEF/blob/1.0.0/include/LIEF/MachO/Builder.hpp#L73-L93)
  and [builder implementation](https://github.com/lief-project/LIEF/blob/1.0.0/src/MachO/Builder.cpp#L333-L449).
- [LIEF selective builds and Wasm](../lief-selective-builds-and-wasm.md)
  and [native rewriting experiment](../lief-native-macho-rewriting-experiment.md).
- [Filesystem and I/O requirements](../../filesystem/requirements.md), including
  bounded output, staged versions and completion semantics.
- [Rust runtime independence](../../architecture/rust-runtime-independence/README.md)
  and [layout growth and signing](../../rebuilding/macho-layout-growth-and-signing.md).
