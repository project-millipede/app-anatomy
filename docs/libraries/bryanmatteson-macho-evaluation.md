# Bryan Matteson's Mach-O toolkit: analysis and bounded rewriting experiments

**Status: source-reviewed findings, 2026-09-17; execution experiments not run.
No dependency, parser replacement, signing implementation or UI has been added.**

## Problem and decision

App Anatomy needs more information than its current Mach-O header reader exposes:
dependencies, search paths, embedded signing metadata and eventually language and
loader information. Implementing all these decoders ourselves would duplicate work
already available in libraries. Application relocation also needs controlled binary
edits whose correctness cannot be inferred from successful parsing.

Evaluate [bryanmatteson/macho][repository] as a reusable Rust foundation for those
specific responsibilities. Decide separately whether to reuse its structural
parser, selected metadata readers, bounded writer or signing adapter. A useful
reader need not qualify as our writer or signer. Compare overlapping capabilities
with the existing `object` evaluation before choosing a foundation.

The required inspection path must accept supplied bytes without Apple hardware,
macOS, Xcode, `otool` or a remote service. Prove ordinary native Rust reuse and,
separately, our Rust component/jco browser path. Keep binary interpretation in Rust;
React visualizes the resulting facts. The CLI is a comparison aid, not the product
integration or the first deliverable.

Every adopted operation also follows the [shared portability requirements](../portability/requirements.md).
This candidate evaluation contributes stage evidence to
[complete-workflow qualification](../portability/complete-workflow-experiments.md).

This document covers this candidate's source screening, capability coverage and
experiments. The [library comparison](selection-and-reuse.md)
owns alternatives; the [application design](../rebuilding/application-relocation-and-signing.md)
owns bundle inventory, resource relationships and staging. The
[portable signing experiments](../signing/ad-hoc-experiments.md) own the shared signing
requirements and artifact matrix. The [LIEF experiment](lief-native-macho-rewriting-experiment.md)
owns evaluation of broader reconstruction, including insufficient command space.

## Package identity and reviewed baseline

The repository name, published crate name and manifest version do not currently
identify the same distribution. The registry identities below were checked on
2026-09-17.

| Source                          | Identity                                                              |
| ------------------------------- | --------------------------------------------------------------------- |
| Reviewed Git revision           | Bryan Matteson's unified `macho` package; manifest version **1.0.0**. |
| Bryan's crates.io releases      | **`macho-lib`**, `macho-cli` and companion crates at **0.5.6**.       |
| crates.io package named `macho` | **0.4.1**, from **`richo/macho-rs`**, a different project.            |

Consequently, `cargo add macho` against crates.io does not select the toolkit
evaluated here. Use the exact Git source and revision for this experiment; record
Cargo's resolved source identity, not just the package name. Published 0.5.6
packages require a separate baseline if evaluated later.
[Registry `macho`][registry-macho], [Bryan's library package][registry-macho-lib]

Pin the initial experiment to commit
`61709c7ef780987b5d5c6c8648f9b7609a4a97c7`, dated 2026-08-08. Its workspace manifest
declares version **1.0.0**, Rust **1.91.1**, edition **2024** and an **MIT** license.
Retain the resolved dependency lockfile, exact feature set and toolchain with each
future run. The source manifest's 1.0.0 version does not establish publication of
that package to crates.io.
[Workspace manifest][workspace]

This revision has one feature-gated `macho` library package. Its manifest says the
features replace former leaf crates. Some documentation/examples still name
`macho-core` or `macho-codesign`; use the pinned exports and manifest when preparing
the harness. Findings about the earlier published 0.5.6 packages remain scoped to
that version and must not be treated as confirmed behavior of this revision.
[Feature manifest][features], [public exports][api]

The upstream CI configuration includes Ubuntu, macOS and Windows and a separate
macOS signing check. That is configured coverage, not a record of successful runs
we have reproduced. No Wasm/component/browser job was found in that workflow.
[CI configuration][ci]

## Comparable tools and reusable capabilities

### Operations commonly performed with macOS tools

The comparisons below describe operations to evaluate, not complete replacements
for the named tools. Apple development tools, LLVM counterparts and general Unix
utilities have different availability and behavior. Record the actual provider and
version used as a reference. None is required to perform the candidate's inspection
or rewriting; optional platform checks remain separate evidence.

| Familiar tool            | Comparable operation                                         | Coverage boundary                                                  |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `otool`                  | Headers, commands, sections, dependencies and disassembly    | Validate each operation and architecture separately.               |
| `nm`                     | Symbol tables, imports and exports                           | No complete flag/output equivalence established.                   |
| `dyld_info`              | Loader metadata, binding/rebasing and chained fixups         | Static records do not prove runtime resolution.                    |
| `install_name_tool`      | Dependency names, library IDs and rpaths                     | Cannot move existing payload to create command space.              |
| `codesign`               | Signature inspection and selected signing/verification paths | Qualify each path; no complete bundle-signing workflow.            |
| `strings`                | Collect/search strings with offsets and length filters       | Scanning and encoding rules may differ.                            |
| `swift-demangle`         | Interpret Swift names within binary analysis                 | Standalone input/option coverage is unproven.                      |
| `dwarfdump`              | List DWARF sections and extract their bytes                  | The CLI command is not a full DWARF dump/verifier.                 |
| `lipo`                   | Inspect architectures and select one for analysis            | Selection is not extraction; merge/thin/remove parity is unproven. |
| `dyld_shared_cache_util` | Inspect cache families and extract supported images          | Cache layouts and reconstruction rules limit coverage.             |

For focused `otool` comparisons, retain these option mappings:

- Headers and architectures: `-h` for Mach-O headers, `-f` for universal headers
  and `-arch` for architecture selection.
- Layout and load commands: `-l`, including segment, section and rpath records.
- Dependencies and install name: `-L` for referenced libraries and `-D` for a
  dylib's own install name.

The [structure][info], [dependency][deps], [DWARF][dwarf-command] and
[container][container-command] command implementations establish CLI behavior.
The [instruction contract][insn], [signing providers][sign] and
[cache contract][cache] give further boundaries. Apple's
[`dyld_info`][apple-dyld-info] and [`install_name_tool`][apple-install-name-tool]
manuals and the [LLVM `otool` manual][otool] describe comparison operations.
Apple's install-name tool also documents header-padding requirements for longer
paths; do not present unrestricted growth as guaranteed by that reference tool.
The shared-cache utility belongs to Apple's dyld project and is not guaranteed
to be installed on every Mac.

The reviewed instruction implementation covers ARM64/ARM64e and x86-64; preserve
unsupported encodings explicitly. The library also provides DWARF readers and
Rust/C++/Swift demangling. The narrow `dwarfdump` comparison above describes the
CLI command, not the full library metadata surface. [Metadata modules][metadata]

For library reuse, identify and invoke the corresponding public Rust operation in
each probe. CLI availability alone does not prove that a narrow library profile
exposes the same result. Keep typed Rust facts at our integration boundary;
CLI text, JSON and SARIF are optional reference/reporting formats, not the WIT
contract. Verify narrow profile availability without enabling `cli` merely to
reach an implementation.

For example, a supplied universal executable could yield two architecture members,
each with its own `@rpath` dependencies, `LC_RPATH` entries and signing records.
Reading those paths does not prove which file the operating system will load.
Resolution still needs the executable location, loader context and available
artifact inventory defined by our application design.

### Capabilities beyond that comparison

| Area                    | Additional information or operation                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Language reconstruction | Objective-C classes/protocols, Swift types, C++ RTTI/vtables and evidence-derived declarations. |
| Program relationships   | Cross-references, function ranges and pointer-authentication information.                       |
| Semantic comparison     | Snapshots, differences between binaries and audit diagnostics.                                  |
| Executable patching     | Instruction encoding/relocation, entry patches and trampolines.                                 |

See the [metadata modules][metadata], [signature reader][codesign],
[feature overview][overview], [cache contract][cache] and [mutation contract][layout].
These are source-reviewed capabilities, not passing results for our inputs.
Recovered declarations are evidence-derived approximations, not recovered original
source. Unknown instructions, missing metadata and unsupported cache layouts must
remain visible. Cache extraction does not guarantee that every cached image can be
rebuilt or that its original signature remains valid.

This is a Mach-O evaluation. It does not qualify PE/ELF support, `.app`/IPA traversal,
certificate-chain trust evaluation or recursive bundle rebuilding. Do not infer a
macOS versus iOS application type from its CPU alone; preserve declared platform
evidence independently from architecture and packaging.

## Feature and portability screening

Use `default-features = false` for every narrow profile below. Enable defaults only
for a deliberately labeled default-analysis comparison. Build each profile in a
separate feature-resolution probe and record the resulting graph, for example with
`cargo tree -e features` for the selected package and target.

Features are additive: another dependency or selected workspace package can enable
more than the intended profile. An all-features test cannot establish a minimal
parser, structural writer or lightweight signer result. Confirm that `signing`
and `apple-codesign` are absent when testing the smaller signing implementation.
[Cargo feature unification][cargo-features]

| Profile                                                  | Source finding and experiment disposition                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Core only                                                | Byte-based parsing; mandatory direct dependencies are `bitflags` and `zerocopy`. First native/browser probe.                  |
| `codesign`, `dyld`, `symbols`, or other selected readers | Add one capability at a time and record its transitive dependencies. Signature decoding is separate from signing.             |
| Default `analysis`                                       | Includes richer metadata and Tree-sitter with C/C++/Objective-C grammars. Requires additional build and footprint evaluation. |
| `structural`                                             | Bounded structural editing without full signing. Use the public editor/transaction APIs.                                      |
| `patch`                                                  | Adds instruction-based patching to structural editing; test separately from path changes.                                     |
| `external-signing`, without `signing`                    | Selects a smaller internal signing implementation; correctness and browser support remain unproven.                           |
| `signing` / `mutation` / `workflow` / `full`             | Ultimately selects `apple-codesign` 0.29.0. Native candidate; the previously identified browser dependency blocker remains.   |

[Pinned feature graph][features]

The `workflow` feature enables `analysis` and `mutation`; `mutation` enables
`signing`. Passing no signer to `workflow::execute` does not remove those build
dependencies. Use the structural editor/transaction surface for the bounded-writer
probe. Also keep the full-feature CLI outside minimal build and footprint results.

The core exports `parse(&[u8])` and `parse_with_options`, with borrowed models,
strict/forensic modes and resource limits. A source scan of its core found no
filesystem/process/network APIs or C FFI. This makes a minimal browser experiment
worth attempting; it does not establish that the selected dependency graph builds
or runs under Wasm. The default analysis profile's C dependencies are a separate
build question, not proof that Wasm is impossible.
[Core API][api], [parse options][options]

The full signer uses `apple-codesign` with its defaults disabled. That does not
remove the browser-incompatible blocking HTTP imports identified in the
[signer screening](selection-and-reuse.md#portable-signing-candidates).
Treat this as a known dependency issue to resolve before claiming browser signing.
Do not substitute a server or Mac service for the required local execution.

## 1. Run the smallest native/browser probe

Start in an isolated development harness with core-only features and a small set
of existing thin, universal and malformed fixtures. Exercise `macho::parse` and
`macho::parse_with_options` from an ordinary Rust caller; record the selected mode
and limits. Keep candidate-specific types inside the adapter and retain our report,
error and range contracts. Our current core provides comparison results for these
fixtures. This first probe establishes integration feasibility before investing in
the full format corpus.

Run on Linux and Windows, recording target architecture, build dependencies and
runtime requirements separately. Distinguish native execution from emulation.
Inspection must work without Apple tools, a mounted Mac filesystem or runtime
network access. Fixture generation is separate from fixture consumption: retain
redistributable bytes or portable generators so repeating the required baseline
does not depend on creating fixtures on a Mac.

Compile the same adapter for the current `wasm32-unknown-unknown` pipeline,
componentize it, generate jco bindings and exercise the
[selected native-input flow](../architecture/rust-runtime-independence/filesystem-communication-flow.md). Our
[engine build](../../scripts/build-engine.ts) disables WASI shims; a generic WASI
build alone does not establish this integration. Keep WIT/Wasm details in the
component adapter. Compare normalized facts and structured errors for identical
inputs, including 64-bit offsets and limits.

Record compilation, componentization and browser execution as separate results.
If a profile cannot build or execute, retain the reproducer and resolve or scope
that gap before expanding its corpus. A build failure in full signing does not
block testing the independent parser profile.

Repeat this probe for each feature profile admitted later. Capture imported host
functions, C toolchain requirements and any adaptations. Measure build cost,
artifact/download size, initialization, analysis time, peak memory and report size.
Record the read and message bounds, traversal cost and cache retention
behavior with the result; header inspection fixtures do not establish usable
large-binary or cache support.

## 2. Establish reader coverage and preserve our contracts

After the minimal probe, compare the same bytes through the current core, the
proposed `object` foundation and the candidate. Expand to representative inputs
with provenance and digests: thin 32/64-bit images, arm64/arm64e/x86_64, both byte
orders, fat32/fat64 containers, unknown CPU values, different declared platforms
and absent/conflicting platform evidence. Container table width and member-header
width remain independent properties.

Exercise truncation, invalid command sizes, overlapping/out-of-bounds ranges,
malformed members, unknown commands and large command tables. Inspect strict and
forensic modes separately; retain partial evidence without labeling it complete.
Account for every architecture or return a clear failure explaining why the
complete container cannot be reported. Measure aggregate memory and traversal cost
across universal members as well as within an individual image.

Normalize offsets to our absolute input ranges, including universal members.
Preserve CPU subtypes, unknown values, upstream decoding errors and incomplete states.
Record differences rather than weakening an existing contract to accommodate the
library. Existing header-only samples cannot establish loader, writer or signing
correctness.

## 3. Evaluate selected inspection features

Start with dependencies/rpaths and embedded signatures, because they support the
relocation and signing views directly. Check library IDs, required/weak/re-exported
dependencies, versions and all rpath entries per architecture. Cover both legacy
binding/rebasing and chained fixups before claiming loader-metadata coverage.

Use selected-image Rust APIs: load-command inspection for paths,
`macho::symbols::table::parse` for symbols, and the `macho::dyld` import, export,
bind/rebase and chained-fixup readers for loader records. Record the exact function
and enabled features per case; these API families do not imply identical coverage.
Preserve command kinds: the dylib helper also accepts `LC_ID_DYLIB`, which names the
current image rather than an imported dependency. A deduplicated import-name list
also does not account for every fixup location; compare those inventories separately.
[Symbol API][symbol-api], [dyld API][dyld-api],
[command kinds][load-command-api], [import collector][import-api]

For signatures, exercise `macho::codesign::parse_code_signature` with absent and
malformed signatures, multiple CodeDirectories, requirements and XML/DER
entitlements. The pinned implementation ignores CodeDirectory decoding errors when
building its decoded list, while retaining the raw SuperBlob entries. Thus a
successful call can contain fewer decoded directories than the raw inventory.
[Observed parser behavior][codesign-omission]

Make that behavior a named fixture: include valid and malformed primary/alternate
CodeDirectories and require the adapter to account for each raw entry. Reuse the
individual decoder to retain its failure where possible; report incomplete decoding
or an explicit error instead of a misleadingly complete shorter list. Test other
unsupported sub-blobs similarly. This observation was rechecked at the pinned Git
revision; it is not transferred from the older 0.5.6 package. CMS bytes or a
signature command must never become a validity or trust claim.

Match reference checks to the operation. Compare structure with LLVM object/Mach-O
inspection tools and symbols with `llvm-nm`; optional Apple `otool`, `nm` and
`dyld_info` provide additional targeted evidence. Compare normalized values, not
terminal formatting, and record the actual options, versions and fields covered.
The [LLVM object dumper][llvm-objdump] and [symbol tool][llvm-nm] describe their own
supported operations; a portable counterpart does not establish Apple OS behavior.

A tool disagreement requires investigation. Use expected facts from controlled
fixtures as well as differential comparisons, so shared omissions do not count as
success. A wrapper around the same parser or signer is not an independent check.
Signature hash/integrity qualification remains in the shared signing procedure.

Language metadata, disassembly, semantic diffs, pointer authentication and caches
remain later, independent probes when needed. Use known-source fixtures for
declarations/references and controlled changes for diffs. Check unsupported
instructions and incomplete metadata explicitly. Cache cases need complete split
families and independent inspection of extracted images; successful extraction
alone does not establish a runnable library or preserved signature. Record memory
and output limits before exposing these capabilities in a UI.

## 4. Test bounded rewriting separately

Reuse the controlled dependency/rpath fixture layout from the
[LIEF experiment](lief-native-macho-rewriting-experiment.md#concrete-path-rewrite). Try an
unchanged round trip, dependency replacement, install-name replacement, rpath
replacement and rpath addition independently, then combine supported operations.
Keep original bytes and pre-signing intermediates with digests. The required
non-Apple runs must be able to consume the fixture corpus without a Mac build step.

Use `macho::mutate::{MachoEditor, PatchTransaction}` under the `structural` profile.
Exercise the transaction's commit path and retain its preparation diagnostics, rather than
counting emitted bytes alone as a validated edit. Record the public API and its
outcome; the full workflow and CLI are separate profiles.
[Editor and transaction API][mutate-api], [transaction validation][transaction]

Within a thin image, the writer does not move existing payload. Longer commands must
fit proven zero-filled header slack; supported section/segment extension also has
explicit placement restrictions. Create one fixture with enough space and another
that exhausts it. The latter should fail explicitly without publishing a partially
rewritten output. That is the expected boundary, not a failed promise of arbitrary
relayout. **LIEF is the candidate for supplying that missing reconstruction
operation.** The [worked layout-growth example](../rebuilding/macho-layout-growth-and-signing.md#worked-example-a-dependency-path-outgrows-its-command)
explains the longer-path case, writer selection and subsequent signing handoff.
The [LIEF experiment](lief-native-macho-rewriting-experiment.md) must establish this capability
on the same controlled inputs; adding LIEF does not automatically repair an
unsupported or partially rewritten output.
[Enforced layout contract][layout]

Test thin and universal outputs separately. Lower-level container rebuilding
supports fat32/fat64, but `workflow::execute` requires a selected thin image.
Record how each member is selected, edited or preserved and then reassembled.
A successful single-member output cannot establish a universal-file rewrite.
The public `macho::mutate::transform_container` route supports selecting one or all
members; its result lists edited members, so independently inventory retained
members as well. [Container transformation API][container-api]

Distinguish member preservation from outer-container preservation. The container
writer recalculates offsets, initializes padding to zero and writes big-endian fat
tables. An unchanged operation therefore need not reproduce the complete input
bytes. Compare member count/order, CPU/subtype, fat-table width, alignment, fat64
reserved fields and unchanged-member hashes. Independently validate final member
ranges and report outer offsets, padding, table-byte-order changes and any discarded
outer bytes separately. Unmodeled outer data requires preservation, explicit
rejection or a declared transformation policy; do not assume its loss is harmless.
[Container writer][owned], [workflow restriction][workflow]

Qualify structural output first: intended changes, unchanged-member preservation,
bounds, relevant loader references and expected refusal when space is insufficient.
Use an independent portable reader and, for supported operations, compare with
[LLVM's install-name tool][llvm-install-name-tool] or an optional Apple control.
Keep structural results even when subsequent signing has not been run. If covered
bytes changed, record the old signature as invalidated; structural success must
not present that output as correctly signed or executable.

Signing is a subsequent integration result. When a signer qualifies for the exact
fixture through the shared procedure, sign the completed layout and reinspect the
final bytes. Optional Mac runs can check that the controlled program loads its
staged dylib with the expected behavior. Record structural correctness, signature
integrity and runtime resolution separately. An unrun integration check does not
erase a structural finding or establish that the integration succeeds.

## 5. Qualify signing paths through the shared experiment

Record the `macho` feature profile as well as the underlying signer. Full signing
supports ad-hoc and certificate-based provider paths through `apple-codesign`
0.29.0; this is an adapter over an existing candidate, not independent signing
machinery. Full-profile verification delegates to
`apple_codesign::verify_macho_data`. Certificate-based signing is outside our
identity-free baseline.
[Signing providers][sign]

The smaller `external-signing` profile has a separate SHA-256 implementation with
4 KiB code pages, an identifier and optional XML entitlements. Its lightweight
verifier checks the primary SHA-256 CodeDirectory's code-page hashes, the supported
entitlement slot and CMS presence/absence; it does not cryptographically verify
CMS signatures or certificates.
The reviewed CodeDirectory builder also writes zero flags, including on its ad-hoc
path, rather than setting `CS_ADHOC`. These are concrete qualification questions;
no Apple compatibility or browser correctness result has been established here.
[Minimal implementation and verifier][minimal]

Before admitting that profile for product use, apply the
[portable signing procedure](../signing/ad-hoc-experiments.md), including independent
hash/metadata checks and tamper controls. Record which signing flags, requirements,
entitlements and special slots are retained, replaced or unsupported. Use the same
artifact corpus and result format instead of duplicating the signing matrix here.

The full wrapper verifying output with `apple_codesign::verify_macho_data` is a
self-check of the underlying signing implementation. Do not count another wrapper
over that same implementation as the sole independent integrity check. Preserve
the primary-directory-only limitation of the smaller verifier in its result.

The inspected providers sign Mach-O bytes; they do not discover nested `.app` code,
generate `CodeResources` or coordinate child-before-parent bundle signing. Keep
those gaps explicit. Successful binary signing cannot qualify a complete app,
framework, IPA or other enclosing package. Neither restores the original vendor
identity or establishes certificate trust or permission to install, load or execute
the result.

## Evidence and separate adoption decisions

For each experiment record the commit, features, resolved dependencies, toolchain,
host/runtime, input provenance/digests, API calls, output digests, diagnostics,
independent checks and measurements. Distinguish **pass**, **fail**,
**unsupported**, **not applicable** and **not run**. All execution cases in this
document currently remain **not run**. Source-observed blockers and limitations
are recorded findings, not fabricated execution failures or passing tests.

Make each decision for a specific **capability, feature profile, input scope and
host/runtime**. Apply only requirements belonging to that decision:

| Decision                   | Required evidence                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Core reader                | Correct facts/errors, complete member accounting and measured resource use on intended targets.         |
| Metadata reader            | Raw-versus-decoded accounting, supported-record accuracy and explicit incomplete states.                |
| Bounded writer             | Intended edits, explained byte changes, preserved members and safe refusal outside its layout boundary. |
| Signing integration        | The shared signing qualification for the exact backend, targets and signing units.                      |
| Signed/runtime integration | Separate final-byte integrity and target-platform execution evidence for claimed behavior.              |

Our portable reader integration needs native Rust and browser-component evidence.
A native-only finding must be labeled as such; it cannot close a browser requirement.
Other profiles may produce useful scoped results while browser support remains
open. Reader adoption does not require bundle resources, a qualified signer or
runtime launch tests; static writer qualification does not establish signed/runtime
integration. Whole-app or package coverage belongs to the linked application and
signing plans, not to a binary-only success here.

For every adopted profile, require acceptable build/memory/maintenance costs and
independent checks covering its claims. Retain explicit unknown, unsupported and
incomplete results. Replace redundant custom interpretation where behavior is
proven, while keeping policy, bundle orchestration and presentation separate.

A minimal reader may be adopted while richer analysis or signing remains rejected
or untested. Compare its demonstrated coverage and adapter cost with `object`;
retain multiple readers only when a specific complementary capability justifies
the additional dependency. Prefer upstream fixes or a narrower supported scope
before building missing format machinery ourselves.

[repository]: https://github.com/bryanmatteson/macho
[workspace]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/Cargo.toml
[features]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/Cargo.toml
[api]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/lib.rs
[ci]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/.github/workflows/ci.yml
[info]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/cli/commands/subcommands/info.rs
[deps]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/cli/commands/subcommands/deps.rs
[insn]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/docs/insn.md
[otool]: https://llvm.org/docs/CommandGuide/llvm-otool.html
[metadata]: https://github.com/bryanmatteson/macho/tree/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/docs/metadata
[codesign]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/metadata/codesign/mod.rs
[overview]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/README.md
[cache]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/docs/dyld-cache-layouts.md
[layout]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/docs/mutation-layout.md
[options]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/core/format/mod.rs
[owned]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/mutate/owned.rs#L297-L348
[workflow]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/workflow.rs#L99-L111
[sign]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/mutate/sign.rs
[minimal]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/mutate/sign/minimal.rs
[registry-macho]: https://crates.io/crates/macho/0.4.1
[registry-macho-lib]: https://crates.io/crates/macho-lib/0.5.6
[dwarf-command]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/cli/commands/subcommands/dwarf.rs
[container-command]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/cli/commands/subcommands/container.rs
[apple-dyld-info]: https://github.com/apple-oss-distributions/dyld/blob/main/doc/man/man1/dyld_info.1
[apple-install-name-tool]: https://github.com/apple-oss-distributions/cctools/blob/main/man/install_name_tool.1
[cargo-features]: https://doc.rust-lang.org/cargo/reference/features.html#feature-unification
[symbol-api]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/metadata/symbols/table.rs
[dyld-api]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/metadata/dyld/mod.rs
[codesign-omission]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/metadata/codesign/mod.rs#L68-L90
[llvm-objdump]: https://llvm.org/docs/CommandGuide/llvm-objdump.html
[llvm-nm]: https://llvm.org/docs/CommandGuide/llvm-nm.html
[llvm-install-name-tool]: https://llvm.org/docs/CommandGuide/llvm-install-name-tool.html
[mutate-api]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/mutate/mod.rs
[transaction]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/mutate/transaction.rs#L164-L215
[container-api]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/mutate/container.rs
[load-command-api]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/core/model/load_command.rs#L313-L330
[import-api]: https://github.com/bryanmatteson/macho/blob/61709c7ef780987b5d5c6c8648f9b7609a4a97c7/crates/macho/src/metadata/dyld/imports.rs#L12-L53
