# Rust libraries for Explorer dependency analysis and Mach-O editing

**Discussion draft, 2026-10-29. Source review only; no dependency adoption or
implementation decision. Native and browser execution have not been qualified
by this research.**

Several libraries already cover parts of application inventory, dependency
lookup and binary editing. Evaluate those operations separately before extending
Explorer's custom candidate evaluator. A parser, filesystem scanner and writer
answer different questions and need not come from the same project.

## Capability boundaries

| Operation | Result | Relevant reuse |
| --- | --- | --- |
| Bundle inventory | Entries, nested bundles, main executable and aliases | `apple-bundles` |
| Binary metadata interpretation | Declared libraries, runpaths and import/library associations | Adopted `object`; alternative readers below |
| Path expansion | Ordered possible paths from names and explicit context | Bryan's `paths` helper; `machish::install_name` |
| Candidate lookup and traversal | Existing files and dependency relationships under a search policy | `lddtree`; other scanners below |
| Binary mutation | Changed install names, runpaths or load commands | `macho-mutate`, `arwen`, LIEF |
| Runtime loading and binding | Actual loaded providers and symbol bindings | Outside the current Explorer |

The corrected boundary remains:

```text
Library ordinal
    object -> recorded library name

Recorded library name + acquired inventory + explicit context
    optional evaluator -> candidate files

Actual runtime provider, symbol lookup and binding
    outside the current Explorer
```

`object` already interprets relationships within binary metadata. Describing it
as only a raw-facts parser understates that work. Its [scope][object-scope]
excludes reproducing platform loaders. The current
[dependency inspector](../../crates/binary/inspection/src/macho/dependencies.rs)
reuses its declarations, imports and command readers through bounded input.

Opening an application establishes the tree scope. Lazy listings and inspection
of a selected file do not establish a complete application dependency graph.
See [Explorer relationship sources](../architecture/capabilities/explorer-relationships.md).

## Inventory and metadata readers

| Candidate | Useful capability | Integration limit |
| --- | --- | --- |
| `object` 0.40.0 | Already supplies declarations and ordinary ordinal-to-library-name associations. | Filesystem provider lookup is a separate operation. [Import implementation][object-imports] |
| `apple-bundles` 0.21.0 | Bundle layouts, `CFBundleExecutable`, nested bundles, framework versions, files and symlink targets. | Uses native filesystem traversal and plist reading; useful in an acquisition adapter, not a dependency resolver. [Directory API][apple-bundles] |
| `schnauzer` 0.3.5 | Mach-O parsing and CLI displays of dylib and runpath declarations. | Reviewed parser requires a path and privately owns a file reader. No supplied-byte/provider API or dependency-file lookup was found. [Parser][schnauzer], [reader][schnauzer-reader] |
| `mach_object` 0.1.17 | Rust parsing of Mach-O, universal files, archives, commands and binding metadata. | Reader alternative; does not supply filesystem resolution or install-name rewriting. [Repository][mach-object] |

Changing from `object` to another parser alone would not supply the filesystem
lookup layer. `goblin`, used by several projects below, is another metadata
foundation; the surrounding projects implement their own search behavior.

## Path expansion and dependency candidates

### lddtree

Published `lddtree` 0.5.1 provides an ordinary Rust library and optional CLI
for recursive Mach-O, ELF and PE dependency inspection without invoking
`otool`. Its public `DependencyAnalyzer::analyze(path)` reads the filesystem,
using `goblin` and memory mappings. [API][lddtree-api], [manifest][lddtree-manifest]

The reviewed [implementation][lddtree] selects the first compatible candidate
and keys dependencies by recorded library name. Initial universal-image
selection prefers the host CPU, then the first image; compatibility omits CPU
subtype. Mach-O lookup uses the depending image's runpaths, not a complete
ancestor-runpath stack. Environment variables and direct filesystem access
influence the result. A sysroot can fall back to original host paths, and
candidate acquisition/parse failures can become no match.
[Compatibility check][lddtree-compatibility]

It is a useful native comparison candidate, but a wrapper cannot recover
discarded alternatives or errors. It does not directly meet Explorer's bounded
input, explicit context and separate evidence-identity requirements.

### Bryan Matteson's toolkit

The published `macho-analysis` 0.5.6 exposes
`paths::resolve_all_rpaths`: string expansion for loader, executable and runpath
tokens. It produces possible paths without checking files, aliases or CPU
compatibility. It does not represent the declaring image of each inherited
runpath. The crate brings broader analysis dependencies; the helper is not
published as an isolated small package. [Path helper][bryan-paths],
[manifest][bryan-analysis-manifest]

The separately reviewed unified Git package exposes
`StaticProgramUniverse::recover_filesystem` and
`recover_filesystem_with_cache`. These perform recursive discovery, exact CPU
identity filtering and static import/reexport association. They use direct
filesystem reads and canonicalization. Candidate generation sorts/deduplicates
paths and then selects an existing file; this does not preserve declared runpath
priority or establish dyld equivalence. [Dependency implementation][bryan-universe]

See the existing [toolkit evaluation](bryanmatteson-macho-evaluation.md) for
its broader feature and dependency profile.

### machish

Rosemary's Git `machish` crate separates pure
`install_name::{PathContext, expand, expand_rpath}` operations from acquisition
through `DylibSource::fetch`. This is a useful design reference for explicit
input and provider boundaries. Its core supports `no_std` with allocation.
[Path expansion][machish-paths], [provider interface][machish-provider]

The reviewed expansion uses strings, silently caps candidates at 4096, and
returns no candidates when required context is missing. Inherited runpaths must
be expanded with their declaring loader before reuse. Its standard filesystem
adapter has policy of its own, including skipped system paths and suppressed
read failures. This is an experimental runtime project, not a qualified
drop-in Explorer evaluator.

### Other implementations reviewed

Repository manifest versions below do not establish crates.io publication.

| Project | What exists | Why it is not an immediate replacement |
| --- | --- | --- |
| `rldd` 0.5.0 | Recursive scanner using `object`; includes Mach-O search and inherited-runpath logic. | CLI rather than a reusable library; the reviewed build selects its Mach-O backend only on macOS. Avoid calling it cross-host Mach-O analysis as shipped. [Backend selection][rldd] |
| `execdump-core` Git, manifest 0.1.0 | Public `needed_libraries` performs direct, one-hop lookup. | First universal image and first existing path; same supplied directory for loader/executable context; no CPU check. The core also requires native Capstone. [Lookup][execdump], [manifest][execdump-manifest] |
| `grafted-dyld` Git, manifest 0.1.0 | Public `DylibResolver` expands tokens and finds a first existing host path. | Runtime/shim policy, filesystem coupling, no CPU/evidence reporting; missing context can terminate the runpath loop. Tool independence was checked for this resolver, not the entire runtime. [Resolver][grafted] |
| `kh-loader` Git, manifest 0.1.15 | Explicit context and filesystem allowlisting in `resolve_install_name`. | Success can return the last allowed path even when it does not exist. Environment/runtime coupling; project states it is unmaintained. [Resolver][kh-loader], [maintenance status][kh-status] |
| `dylibtree` Git | Recursive dependency CLI. | First universal image and approximate loader context. Automatic shared-cache extraction invokes `xcrun` and an Xcode extractor; not independent of Apple tooling as shipped. [Traversal][dylibtree], [cache extraction][dylibtree-cache] |

These projects demonstrate real reuse opportunities, but path expansion,
existing-file lookup, recursive traversal and runtime loading are distinct
capabilities. None of this review establishes a complete replacement meeting
all Explorer evidence and execution requirements.

## Editing without install_name_tool

The following operations modify recorded dependency names, library IDs or
runpaths. They do not determine which file a loader would select.

| Candidate | Verified editing surface | Main limit |
| --- | --- | --- |
| `arwen` 0.0.5 | Rust byte-buffer `MachoContainer`: `change_install_name`, `change_install_id`, `add_rpath`, `change_rpath`, `remove_rpath`; thin/universal handling. No subprocess calls in the published Rust sources. [API][arwen-api] | Header growth assumes padding without validating that it is available. |
| `macho-mutate` 0.5.6 | In-memory `MachoEditor`: runpath edits, generic command replacement and `build() -> Result<Vec<u8>>`. No Apple command is needed for structural editing. [Editor][macho-mutate] | Preserves payload placement and explicitly rejects command growth beyond existing header slack. Not arbitrary binary relayout. |
| LIEF 1.0.0 | Rust bindings expose library-name mutation, runpath commands and binary rebuilding; documented support for longer/shorter library paths. [Mach-O examples][lief-editing] | Native C++ backend and build dependencies; browser/Wasm support is a separate qualification. |
| `insert-dylib` 0.1.1 | Small Rust CLI inserts dylib load commands into thin/universal files without Apple tools. [Source][insert-dylib] | Narrow insertion tool, not a general reusable install-name editor. |

**Arwen's padding behavior needs explicit attention.** Published 0.0.5 inserts
command bytes and unconditionally drains bytes after the enlarged command table,
without checking whether those bytes belong to payload. Source inspection
therefore indicates that insufficient padding can remove payload or cause an
out-of-range panic. This was not reproduced by execution. Do not describe this
version as safely rejecting insufficient command space. [Insertion code][arwen-patcher]

For a later bounded-edit experiment, evaluate `macho-mutate` first; compare
LIEF when payload relocation is required. Arwen has the closest convenience
API but needs independent validation of command space and output. This is a
proposed evaluation order, not an adoption decision. Signature handling remains
separate: successful mutation does not establish signature validity or execution
eligibility.

## Package identity matters

- Bryan's published leaf crates, including `macho-analysis` and
  `macho-mutate` 0.5.6, were inspected at commit
  `c473bbbc39111bdd165c1d84008d484cb8b97d71`.
  The unified Git `macho` package, manifest 1.0.0, was inspected at
  `61709c7ef780987b5d5c6c8648f9b7609a4a97c7`.
  crates.io `macho` 0.4.1 belongs to another project.
- Arwen's published 0.0.5 source is
  `d579acc8e55316d87e9bb9d650dff164eea20a8a`.
  Newer Git work splits Mach-O/signing crates; its APIs and signing features
  must not be attributed to the published version.
- Pin the source, release and feature set actually evaluated. Native support,
  absence of Apple subprocesses and browser/component compatibility are separate
  properties. None alone proves the others.

The existing [Bryan toolkit evaluation](bryanmatteson-macho-evaluation.md) and
[LIEF experiment](lief-native-macho-rewriting-experiment.md) retain their detailed
baselines. This comparison does not supersede their qualification work.

## Bundlers and other leads

| Project | Relevant finding |
| --- | --- |
| `cargo-bundle` | Uses Goblin for dependency metadata but still invokes `install_name_tool` for its framework runpath change. Not a tool-free editing substitute. [Source][cargo-bundle] |
| Tauri bundler | Reviewed framework handling copies configured frameworks; it does not establish automatic dependency closure. [Source][tauri] |
| `cargo-packager` | Reviewed framework handling also copies configured inputs. Bundle production is not proof of a general resolver API. [Source][cargo-packager] |
| `zerobrew` | Reviewed macOS linkage checks invoke `otool -L`. [Source][zerobrew] |

Further registry leads included [fat-macho](https://crates.io/crates/fat-macho),
[macho2](https://crates.io/crates/macho2), [sideport-macho](https://crates.io/crates/sideport-macho),
[haruspex-macho](https://crates.io/crates/haruspex-macho) and
[caddy-hexspell](https://crates.io/crates/caddy-hexspell). They remain discovery-only leads:
their relevant APIs and behavior were not qualified. They must not be presented
alongside the source-reviewed candidates as established solutions.

## Proposed evaluation and ownership

1. Specify the needed result: declaration display, all plausible file candidates,
   recursive dependency coverage, or binary edits. Scanning one executable's
   closure does not inventory resources or independently launched helpers.
2. For candidate APIs, test explicit loader/executable contexts, ordered runpaths
   with declaring-image provenance, duplicate names, ambiguity, CPU identities,
   aliases, acquisition errors and traversal limits. A path or no-match result
   must not silently imply successful acquisition or runtime failure.
3. For writers, test thin/universal files, all affected slices, shorter/longer
   names, insufficient header space, unchanged payload and reparsing. Record
   signature effects separately. Do not mutate the selected original in a probe.
4. Qualify ordinary Rust callers first, then the same reusable behavior through
   actual native and browser adapters. Direct host filesystem APIs need an
   integration plan; moving analysis wholly into the service does not establish
   browser reuse.
5. Compare upstream API changes with the maintenance cost of narrowly scoped
   application policy before choosing a backend.

Apple interpretation and planning remain in `crates/binary/inspection`.
Filesystem acquisition and resource ownership remain in Rust adapters; WIT
conversion stays in `crates/workbench/component`; React presents results.
Follow [Rust runtime independence](../architecture/rust-runtime-independence/README.md)
and the [testing policy](../architecture/testing-policy.md).
Full dyld behavior, runtime symbol binding and shared-cache provider selection
remain outside the current Explorer.

[object-scope]: https://github.com/gimli-rs/object/blob/4201cd4cd8026aed31377ce4193367b8c520d522/README.md#L61-L63
[object-imports]: https://github.com/gimli-rs/object/blob/4201cd4cd8026aed31377ce4193367b8c520d522/src/read/macho/import.rs#L225-L255
[apple-bundles]: https://github.com/indygreg/apple-platform-rs/blob/0ebbd2ef3b96d5adccc30b1cad4deea38cd735c4/apple-bundles/src/directory_bundle.rs
[schnauzer]: https://github.com/Arsynth/schnauzer/blob/7a8a32efaeb40f4881eea6deff476263b9a87f0d/src/lib.rs
[schnauzer-reader]: https://github.com/Arsynth/schnauzer/blob/7a8a32efaeb40f4881eea6deff476263b9a87f0d/src/reader.rs
[mach-object]: https://github.com/flier/rust-macho/tree/4bf5fb1f2a0ab02dc09e7f51a95a46e780b1354c
[lddtree-api]: https://docs.rs/lddtree/0.5.1/lddtree/struct.DependencyAnalyzer.html
[lddtree-manifest]: https://github.com/messense/lddtree-rs/blob/b7b1923fa9ad7557b01d9c2e55fb36110fe1a820/Cargo.toml
[lddtree]: https://github.com/messense/lddtree-rs/blob/b7b1923fa9ad7557b01d9c2e55fb36110fe1a820/src/lib.rs
[lddtree-compatibility]: https://github.com/messense/lddtree-rs/blob/b7b1923fa9ad7557b01d9c2e55fb36110fe1a820/src/macho.rs#L28-L51
[bryan-paths]: https://github.com/bryanmatteson/macho/blob/c473bbbc39111bdd165c1d84008d484cb8b97d71/crates/macho-analysis/src/paths.rs
[bryan-analysis-manifest]: https://github.com/bryanmatteson/macho/blob/c473bbbc39111bdd165c1d84008d484cb8b97d71/crates/macho-analysis/Cargo.toml
[bryan-universe]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/analysis/dependency_index.rs
[machish-paths]: https://github.com/microlift/rosemary/blob/bb7c38f02bc953f2a6147ce99ec1dc4209cb86b6/crates/machish/src/install_name.rs
[machish-provider]: https://github.com/microlift/rosemary/blob/bb7c38f02bc953f2a6147ce99ec1dc4209cb86b6/crates/machish/src/namespace.rs
[rldd]: https://github.com/zatrazz/rldd/blob/1d46014ff1ebff0be98fb7e664bd048fe4c1c22b/src/main.rs
[execdump]: https://github.com/romainaugier/execdump/blob/c9a8118c0a805dd419b58fd641ab8f69644080ea/crates/execdump-core/src/libraries.rs
[execdump-manifest]: https://github.com/romainaugier/execdump/blob/c9a8118c0a805dd419b58fd641ab8f69644080ea/crates/execdump-core/Cargo.toml
[grafted]: https://github.com/TOSTcRa/grafted/blob/ae333356e43ca7f97738594d758bf28ca4bf9327/crates/grafted-dyld/src/resolver.rs
[kh-loader]: https://github.com/wie-project/kakehashi/blob/490c5fb9a10ead928ef590cef58a6da792616a82/crates/kh-loader/src/resolve.rs
[kh-status]: https://github.com/wie-project/kakehashi/blob/490c5fb9a10ead928ef590cef58a6da792616a82/README.md
[dylibtree]: https://github.com/keith/dylibtree/blob/d807bf3e754efd709b014a1190a7cf61b5886a08/src/print.rs
[dylibtree-cache]: https://github.com/keith/dylibtree/blob/d807bf3e754efd709b014a1190a7cf61b5886a08/src/dyld_shared_cache.rs#L52-L109
[arwen-api]: https://github.com/nichmor/arwen/blob/d579acc8e55316d87e9bb9d650dff164eea20a8a/src/macho.rs#L187-L337
[arwen-patcher]: https://github.com/nichmor/arwen/blob/d579acc8e55316d87e9bb9d650dff164eea20a8a/src/patcher.rs#L63-L88
[macho-mutate]: https://github.com/bryanmatteson/macho/blob/c473bbbc39111bdd165c1d84008d484cb8b97d71/crates/macho-mutate/src/lib.rs
[lief-editing]: https://lief.re/doc/stable/formats/macho/index.html#rpath-and-library-path-modification
[insert-dylib]: https://github.com/hookforge/insert-dylib/blob/f7d729bc05cf50187b1b90287bad45a6d31d7b9c/src/main.rs
[cargo-bundle]: https://github.com/burtonageo/cargo-bundle/blob/787d710686480cea32960bcd4d9f762c2f9bbd53/src/bundle/osx_bundle.rs
[tauri]: https://github.com/tauri-apps/tauri/blob/548a3692f59405aeb239c5b63fa589824eee51e8/crates/tauri-bundler/src/bundle/macos/app.rs
[cargo-packager]: https://github.com/crabnebula-dev/cargo-packager/blob/7197bff5110e33d54691d4788fd55c0edd73aa11/crates/packager/src/package/app/mod.rs
[zerobrew]: https://github.com/zerobrewhq/zerobrew/blob/main/zb_io/src/cellar/linkage.rs
