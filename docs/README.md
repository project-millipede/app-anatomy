# Documentation guide

App Anatomy currently implements bounded Mach-O header analysis with an ordinary
Rust core, a WIT/jco component, Native Workbench Service and two React presentations.
The core uses `object` 0.40.0 parsers for format detection, headers, universal tables
and load commands; the [parser contract](architecture/rust-analysis-core.md#parsing-dependencies)
defines acceptance, reads and diagnostics. Deeper analysis, rebuilding and signing
remain proposed; individual studies record their qualification status.

Use the [repository README](../README.md) for setup, commands and current scope.
The groups below organize documents by subject; each document's status identifies
implemented behavior, requirements, proposed design or planned experiments.

## Portability

Portability applies to the complete transformation, including indirect tool and
host dependencies. These documents supply the shared rules; individual library
and signing studies contribute evidence for particular stages.

- [Requirements](portability/requirements.md): the original-input-to-exported-output
  contract, execution environments, artifact preservation and failure behavior.
- [Tool and host dependency inventory](portability/tool-and-host-dependencies.md):
  records for direct/transitive tool calls, native libraries, host APIs, conditional
  branches and missing-dependency behavior; seed findings link their source reviews.
- [Complete-workflow experiments](portability/complete-workflow-experiments.md):
  composition runs, stage handoffs, dependency observations and final-output checks.
  Reuse the stage plans' fixture designs; do not treat an isolated success as a
  qualified complete workflow.

## Architecture

These documents distinguish the implemented application from accepted future
architecture. A selected direction does not establish completed implementation.

- [Testing policy](architecture/testing-policy.md): baseline for test additions,
  reviews and removals; behavior ownership, meaningful integration boundaries,
  exclusions, fixture costs and duplicate coverage.
- [Rust reuse across execution environments](architecture/rust-runtime-independence/README.md):
  mandatory Rust-only non-UI workflow and API-defined component boundaries, with
  diagrams distinguishing exports, internal implementation and imports; permitted
  TypeScript bindings, execution arrangements, Rust input APIs and required evidence.
- [Rust filesystem communication flow](architecture/rust-runtime-independence/filesystem-communication-flow.md):
  target-flow demonstration separating the Rust client from browser networking,
  with the Polymorph browser path, shared Rust messages, connection/resource
  lifecycle and direct/native reuse.
- [System overview](architecture/system-overview.md): native reuse,
  Rust/component/React communication and persistent native selection.
- [Rust analysis core](architecture/rust-analysis-core.md): public reports,
  ranges, errors, memory behavior and native/component API behavior.
- [Future native macOS adapter](architecture/native-macos-adapter.md): proposed
  filesystem metadata and Security.framework integration; no implementation or
  Cargo package.
- [Error handling](architecture/error-handling.md): current error ownership and
  output boundaries, library trade-offs, and a possible Eros integration with
  pseudocode and explicit adoption criteria.
- [Error contracts across boundaries](architecture/error-boundaries.md): separate
  sequence diagrams comparing structured and message-only WIT designs, selective
  UI presentation, ordinary Rust causes, filesystem messages, Polymorph imports
  and host execution failures.
- [Wasm analysis with native Rust filesystem access](architecture/wasm-analysis-with-native-filesystem.md):
  accepted target, communication diagrams, resource borrowing and bounded input;
  includes implemented bounded reads and identifies broader application-resource
  and filesystem qualification still required.
- [Base UI and Ark/Panda comparison](architecture/base-ui-and-ark-panda-comparison.md):
  the two implemented presentations, independent UI state around shared native
  selection and evaluation criteria.

## Design prototypes

- [Application Explorer candidates](design/prototypes/application-explorer/README.md):
  interface explorations with a comparison index and a dedicated README for each
  candidate. Saved alternatives include the mixed relation overlay and the
  separated bridge workspace with a vertical inspector; no application
  implementation has been selected.

## Libraries

Select existing implementations before adding custom format code. These studies
retain versioned findings, limitations and proposed checks alongside each candidate.

- [Selection and reuse](libraries/selection-and-reuse.md): alternatives across
  parsing, certificates, bundles, resources, rewriting and signing; reuse boundaries
  and adoption criteria.
- [Bryan Matteson's Mach-O evaluation](libraries/bryanmatteson-macho-evaluation.md):
  package identity, tool similarities, feature isolation, reusable inspection,
  bounded mutation and signing-provider qualification.
- [LIEF selective builds and Wasm](libraries/lief-selective-builds-and-wasm.md):
  format selection, Rust/C++ integration, existing Wasm evidence and delivery costs.
- [LIEF native Mach-O rewriting experiment](libraries/lief-native-macho-rewriting-experiment.md):
  proposed path/rpath fixtures, layout growth, member preservation, structural
  checks and separately recorded signing/runtime evidence.

## Filesystem

The overview compares access models; the shared contract applies to every storage
route. Candidate evaluations retain detailed evidence without selecting a backend.

- [Access and backend overview](filesystem/README.md): browser and native
  capabilities, OS/filesystem distinctions, proposed sequence diagrams and open
  architecture decisions.
- [Application filesystem and I/O requirements](filesystem/requirements.md):
  fidelity, Rust-controlled bounded I/O, writable output and export; additional
  native mount checks and separate verification/loading evidence.
- [Native filesystem library evaluation](filesystem/native-filesystem-library-evaluation.md):
  reusable directory and range-read foundations, platform metadata extensions,
  incremental analyzer input, source limitations and proposed experiments.
- [Browser filesystem and Wasm boundaries](filesystem/browser-filesystem-and-wasm-boundaries.md):
  file references, memory-copy mechanisms, synthetic qualification evidence and
  proposed browser descriptor-backed reads.
- [WASI evolution and host boundaries](filesystem/wasi-evolution-and-host-boundaries.md):
  preview versions, typed resources, host/provider responsibilities and relevance
  to browser, native-hosted Wasm and ordinary native Rust variants.
- [FSKit native-mount variant](filesystem/fskit-native-mount.md): macOS integration
  through FSKitBridge and fskit-rs, host dependencies, limitations and qualification
  work; an optional adapter outside portable processing.

## Rebuilding

These designs explain the intended behavior and the work that connects libraries;
they do not describe an implemented executor.

- [Application relocation and signing](rebuilding/application-relocation-and-signing.md):
  the staging problem, resource relationships, dependency-resolution context,
  reusable plans and signing order/settings.
- [Mach-O layout growth and signing](rebuilding/macho-layout-growth-and-signing.md):
  the longer-path example, bounded editing versus reconstruction, writer selection
  and contracts between the writer and signer.

## Signing

- [Ad-hoc signing experiments](signing/ad-hoc-experiments.md): shared signer
  qualification for individual code, nested bundles, resources and packages.
  This owns signature-specific assertions and artifact coverage; whole-workflow
  qualification remains in Portability.

## Documentation beside its implementation

- [Repository agent instructions](../AGENTS.md), [web agent instructions](../apps/web/AGENTS.md)
  and the [web Claude entry point](../apps/web/CLAUDE.md): tooling instructions kept
  at their conventional locations.

Keep detailed explanations and evidence with their owning document; use links from
related subjects. Preserve source qualifications and the distinction between
proposed behavior, completed implementation and measured results when reorganizing.
