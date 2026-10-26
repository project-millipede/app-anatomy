# object, LIEF and Gum mapper boundaries

**Status: architecture study, 2026-10-26. Inspection is implemented; LIEF rebuilding,
Gum mapper integration and the depicted native execution transport are proposals.**

Open [index.html](index.html) in a browser. The standalone page works offline,
without the application build, Codex, Wasm binaries or a native service. Its
JavaScript only presents the diagram; it performs no binary analysis, file reads,
rebuilding or native execution.

## Explore the boundaries

Choose **Native Rust** or **Browser + Wasm**, then **Inspect**, **Rebuild**,
**Map + probe** or **All three**. Each browser operation shows a different path:

- **Inspect:** the existing Rust filesystem client acquires bounded ranges from
  the native input service, then `object` and Rust produce inspection facts.
- **Rebuild:** a proposed Rust transport adapter reaches a native LIEF backend
  that reconstructs file bytes. A LIEF Wasm port is a separate, unqualified
  alternative.
- **Map + probe:** a proposed native backend uses Gum to prepare native memory;
  a native caller invokes initialization and the controlled probe. Wasm receives
  module-test evidence.
- **All three:** original inventory, Rust planning, LIEF reconstruction,
  independent reinspection and an optional native module probe.

Solid and dashed process connections distinguish the existing filesystem
protocol from a proposed execution API/transport. The existing input service is
not a rebuild or execution backend. Native in-process Rust reuse needs no RPC.

Library, component and process boundaries are different. Rust owns interpretation,
plans and reports; `object` supplies selected facts, LIEF supplies reconstructed
file bytes, and Gum supplies a relocated memory image and initializer addresses.
Signing, normal OS-loader compatibility and whole-application execution require
separate qualification. The diagram does not establish those capabilities.

## Saved files and maintenance

| File                       | Purpose                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| [index.html](index.html)   | Standalone export with all presentation code and styles embedded. |
| [source.html](source.html) | Readable, editable visualization fragment.                        |

Edit `source.html` and regenerate `index.html` with the visualize skill's
standalone HTML exporter (this snapshot used version 1.0.55). Retain only its
`widgetState`/`setWidgetState` compatibility calls; the export supplies their local
fallback. Remove the exporter's unused Floating UI and Lucide CDN script tags
and keep its script/style policy restricted to inline content. The diagram uses
neither library and must not load remote resources.

The export can remember the selected environment and operation in local browser
storage. Controls continue to work when storage is unavailable. A fresh page
starts with the browser rebuilding view.

Before updating the saved export, check that all four browser operations redraw
different diagrams, both environment selectors work, labels fit at narrow widths,
and the page still works with networking disabled. These are presentation checks,
not qualification of the illustrated Rust, LIEF or Gum behavior.

## Sources and related studies

- [Library selection and reuse](../selection-and-reuse.md).
- [LIEF selective builds and Wasm](../lief-selective-builds-and-wasm.md).
- [Native LIEF Mach-O rewriting experiment](../lief-native-macho-rewriting-experiment.md).
- [Mach-O layout growth and signing](../../rebuilding/macho-layout-growth-and-signing.md).
- [Rust runtime independence](../../architecture/rust-runtime-independence/README.md)
  and [filesystem communication flow](../../architecture/rust-runtime-independence/filesystem-communication-flow.md).
- LIEF source reviewed at [1.0.0](https://github.com/lief-project/LIEF/tree/1.0.0).
- The specific Gum mapper branch reviewed at
  [1279320d32ed98e8e6a01ceedb01b2ab01e7b8a2](https://github.com/frida/frida-gum/tree/1279320d32ed98e8e6a01ceedb01b2ab01e7b8a2),
  including its [mapper API](https://github.com/frida/frida-gum/blob/1279320d32ed98e8e6a01ceedb01b2ab01e7b8a2/gum/gummapper.h)
  and [reported coverage and limits](https://github.com/frida/frida-gum/blob/1279320d32ed98e8e6a01ceedb01b2ab01e7b8a2/cross-platform-mapper-handoff.md).
