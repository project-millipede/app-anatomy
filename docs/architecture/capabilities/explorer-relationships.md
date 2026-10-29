# Explorer synthetic relationships

## Responsibility and evidence

The `/explorer` preview renders synthetic application inventories and relationship
results computed by ordinary Rust APIs in `binary-inspection::explorer`. The
Rust library validates inventory identity and containment, expands supported
references, follows represented aliases and produces direct neighborhoods. It
has no filesystem, WIT, serialization, networking or JavaScript dependency.

The preview borrows pinned `object` types for Mach-O dependency flags, command
identifiers, versions and CPU identity. Owned application records retain original reference
bytes, provenance and separate entry/image/relationship identities. A filesystem
alias and its target remain separate entries even when their basenames match.
Fixture provenance is explicit; synthetic evidence does not claim parsed offsets.

Fixture builders live outside the production library's `src/` and are shared by
native integration tests and the preview exporter. The datasets cover the Atlas
framework/version alias, architecture-dependent and ambiguous references,
incomplete evidence and dense inventories. They are preview data, never native
selection or application sample input.

## Upstream reuse and integration boundary

The native workbench report displays declared dependencies and static
import/library associations through the pinned `object` APIs in a separate
**Inspect dependencies** action. Upstream
already interprets relationships within binary metadata: `Object::import_libraries`
enumerates declarations and assigns ordinals; `Object::imports` maps ordinary
library ordinals to recorded library names. Upstream bind-program and reexport
interpretation should also be reused when those records are needed. See the
[import implementation](https://github.com/gimli-rs/object/blob/4201cd4cd8026aed31377ce4193367b8c520d522/src/read/macho/import.rs#L146-L164)
and [ordinal association](https://github.com/gimli-rs/object/blob/4201cd4cd8026aed31377ce4193367b8c520d522/src/read/macho/import.rs#L225-L255).

The boundary is:

```text
Library ordinal
    object -> recorded library name

Recorded library name + inventory + explicit context
    optional application evaluator -> candidate files

Actual runtime provider, symbol lookup and binding
    outside the current Explorer
```

A runpath's declaring image is known from the file being parsed; attaching the
inventory's image identity is bookkeeping. Retain declaration bytes, order and
source provenance without recreating upstream interpretation. Special ordinals,
flat lookup and missing associations must remain explicit instead of becoming
fabricated provider-file endpoints.

The native evidence milestone presents these declarations and upstream import
associations without requiring file-candidate evaluation. A later candidate
capability can consume an acquired inventory and explicit context when a product
interaction requires concrete file candidates. Path-token expansion and inherited
runpath search model loader semantics; the acquired inventory boundary, exact-CPU
filter and alias budget are deliberately limited application choices. They are
not required merely to display dependency evidence. The current synthetic preview
continues to exercise these choices through authored fixtures.

Keep ordinary Rust APIs and owned evidence small, preserving the existing
header-only inspection contract. Choose upstream APIs whose read scope matches
the operation: constructing `MachOFile` can acquire section and symbol metadata.
Declaration display does not require a general loader subsystem. Upstream's
[documented scope](https://github.com/gimli-rs/object/blob/4201cd4cd8026aed31377ce4193367b8c520d522/README.md#L61-L63)
excludes reproducing platform-loader behavior.

## Existing synthetic candidate computation

A resolution context supplies a main executable, referring image and ordered
runpaths, including the image declaring each runpath. The library supports exact
absolute paths and `@loader_path`, `@executable_path` and `@rpath` expansion.
`@loader_path` inside an inherited runpath uses that runpath's declaring image.
The library does not infer an actual process's complete loading context.

Inventory paths use lexical, case-sensitive matching. Synthetic alias chains
retain their intermediate entries; broken chains and cycles have explicit
failure reasons. A repeated normalized traversal state proves a cycle; otherwise
alias expansion stops after 64 steps with an explicit unsupported-limit result.
This is an evaluator bound, not a claimed operating-system limit. Candidates
initially require exact CPU identity. Broader CPU
subtype compatibility, shared caches, environment overrides and symbol binding
are unsupported.

Every attempted path and rejection remains evidence. All plausible matches are
preserved in search order; a candidate set is not a claim about dyld's selected
library. External unacquired references, unresolved references, unsupported
interpretation and unknown containment stay distinguishable. Resource mentions
do not prove access, and planning suggestions do not create dependency endpoints.

Neighborhoods are one-hop views relative to the fixed outer application
inventory, including nested bundles. Folder selection does not aggregate child
references. Separate evidence records remain separate relationships while tree
roles count each represented resource once.

## Build-time preview adapter

The Rust xtask calls the same public candidate and neighborhood APIs and converts
their results into the tracked `previewData.generated.json` asset. Serialization
and conversion of upstream wrappers belong to this adapter, outside the core.
The artifact contains inventories, contexts, evidence, candidates, attempts and
per-selection neighborhood projections.

```sh
pnpm explorer:generate
pnpm explorer:check
```

Generation is explicit. The check recomputes expected output without writing and
fails for a stale or missing asset. Typecheck and the production build require a
fresh artifact. TypeScript infers payload types from the JSON import and looks up
Rust-computed projections; it does not expand references or compute compatibility
or candidates.

The preview mounts no native runtime, workbench session or service connection.
Browser rendering of these results is not a live Wasm execution qualification.

## Presentation ownership

`ExplorerWorkspace` owns one Ark tree. Its selected value remains the sole center
selection, and Ark owns expansion and keyboard focus. React owns the selected
fixture/context, previewed relationship, explicit candidate choice and navigation
history. No application Context or global runtime store is introduced.

All directly related internal entries receive IN, OUT or IN/OUT roles. SEL marks
the center; a stronger outline marks endpoints of the previewed relationship.
Collapsed branches show counts of unique related resources rather than becoming
relationship endpoints.

Selecting a relationship retains the center and updates its connector and the
inspector. A unique internal endpoint is revealed without stealing keyboard
focus. Multiple candidates stay in one relationship; all are marked and their
ancestors opened, but an explicit candidate choice is required for reveal/focus.
Alias chains remain evidence in the inspector, not transitive tree activation.

Reveal retains selection; Focus selects the endpoint. Back restores center,
context, relationship, candidate choice, expansion and tree scroll. Context
changes retain only an applicable relationship preview. Manual collapse persists
until a later selection, context change or reveal requires expansion. External or
unresolved references do not fabricate tree entries or focus actions.

The [tree virtualization contract](explorer-tree-virtualization.md) continues to
own row geometry, nested mounting, Ark keyboard behavior and viewport scrolling.

## Qualification and later native integration

Native tests establish application-owned candidate and projection rules against
independent expectations. UI tests and real-browser checks establish linked
presentation behavior. The ordinary library can compile for browser Wasm, but
this preview does not add a component export or execute resolution inside Wasm.

`inspect_dependencies` and `inspect_dependencies_source` expose upstream dependency
declarations and import/library associations through the selected binary's
bounded-input path. `Session::inspect_dependencies` and WIT `inspect-dependencies`
compose that ordinary Rust operation. Header inspection remains a separate scope.
The workbench report displays this evidence; `/explorer` remains the synthetic
preview and does not acquire real graph endpoints. See the
[dependency API contract](../rust-analysis-core.md#dependency-evidence) for read scope,
owned evidence and unsupported capabilities. The separate
[dependency qualification record](../rust-analysis-core.md#dependency-inspection-qualification)
distinguishes native execution from compilation and presentation checks.

Whole-bundle acquisition is a separate extension: current native entry IDs are
listing-scoped; opening a directory replaces selection; symlink targets and a
retained whole-bundle inventory are unavailable. Future native inventory and
read-link capabilities must preserve selection/resource ownership and bounded
reads. Optional candidate queries can consume the acquired facts and explicit
context separately.

### Synthetic preview validation recorded on 2026-10-29

- Native workspace tests passed, including 11 Explorer rule tests. The
  `binary-inspection` suite also passed its two doctests and Clippy with warnings
  denied. The existing component library test target compiled and completed
  (there were no component library tests at that milestone).
- `pnpm engine:build`, `pnpm typecheck`, `pnpm test:web`, `pnpm build` and
  `pnpm explorer:check` passed. The core also passed a check for
  `wasm32-unknown-unknown`; this establishes compilation only.
- Export generation was byte-identical across repeated runs. A deliberately stale
  artifact was rejected without being rewritten, then restored and checked.
- Browser checks in the Codex in-app browser covered alias activation and
  focus retention, architecture-independent preview retention, both tree-selection
  and Focus/Back navigation, candidate choice, collapsed distinct counts, reveal
  and suggestion isolation. The 273-entry dense inventory revealed an offscreen
  target with 26 tree rows mounted, a 32px target row and an 8295px scroll offset;
  Focus/Back restored that exact offset and the preview.
- The repository-wide formatting check reports four unchanged baseline files:
  `error-boundaries.md`, `testing-policy.md`, and the mixed-relation-overlay and
  perimeter-bridges HTML prototypes. Changed feature files and Rust formatting
  pass their checks.

Screen-reader behavior and other browser engines were not qualified. Real native
bundle acquisition and execution of the new resolver through a live Wasm
component remain future capabilities.

### Fixed corridor layout

The linked-tree-bridge-workspace prototype remains the interaction reference.
The Explorer uses fixed readable sidebars around a fluid canvas and compact page
chrome. Desktop pane scrollers are independent; below 780px the panes stack and
the virtual tree retains its finite viewport. The graph preserves its full
848px width inside its own scroll region instead of shrinking cards.

Every relationship card is 224×112 CSS pixels, including resource paths, aliases,
ambiguous references and external evidence. Titles and status occupy fixed lines;
paths are clamped to two lines. Full evidence remains in the inspector, and native
titles expose the complete card name/path. The selected file is 280×168 pixels,
independent of content and relationship counts. West/east headings and their three
vertical rows align. North/south use matching horizontal columns. Empty slots
reserve coordinates without framed cards or Archer identities.

Each corridor shows up to three relationships per page in Rust's evidence order.
Slots are assigned from the current page's visible count: one card uses the middle
slot; two use the first and middle slots; three use all slots. First/middle/last
mean top/middle/bottom for west/east and left/middle/right for north/south. The rule
restarts on every page, so a final page with one item centers that card. Counts
refer to the complete corridor; controls give the visible range. Paging clears
preview while retaining the center. Focus/Back restores the preview's containing
page, candidate choice and existing navigation context. This windowing is
presentation only and does not change candidate computation or tree markings.

One decorative center-edge port per visible relationship uses ordered offsets at
25%, 50% and 75%. The same physical-slot array mounts cards, matching ports and
Archer source declarations. A lone card connects through the 50% port; empty slots
have no ports or source declarations, so hidden pages leave no connectors. Incoming arrows end at their
ports; outgoing arrows start there. Active card, port and route use the same
directional color; inactive routes are subdued. Ports have no domain identity,
keyboard stop or inspector entry. There is no shared center or south trunk.

Archer is unchanged: its existing sharp orthogonal path builder supplies all
routes. Opposite corridors share clearance, with 48px horizontal and 144px
vertical gaps. North's heading/controls precede its card row; south's card row
precedes its controls/heading. Both connector-facing edges remain free of text,
and vertical clearance keeps midpoint elbows outside west/east cards and
headings. The SVG shares the surface's stacking context below presentation
content. The outer application boundary stays fixed.

The dataset chooser remains in the tree pane and architecture context above the
canvas. Ark remains the sole tree selection, expansion and keyboard owner.
Relationship preview, explicit candidate choice, Reveal, Focus and Back retain
their existing semantics. No Rust facts, generated candidate data, component
runtime or native adapter changed for this layout.

Layout qualification in the in-app browser covered 1533×1127, 1100×900 and
740×900 viewports. The graph measured 848×1112px, every relationship card
224×112px and the center 280×168px. West/east row coordinates matched exactly.
The canvas retained its full width without document horizontal overflow at both
narrower sizes. South midpoint elbows cleared the final west/east row and labels.

All seven dense pages exposed the complete 19 relationships, with three matching
cards/ports/routes on full pages and one on the final page. The long-path endpoint
was revealed in the virtual tree; Focus/Back restored its final page and preview.
Explicit paging cleared preview without moving the center. Both south pages in
the incomplete dataset retained three cards/ports/routes. Per-page centering was
checked for ambiguity's lone west card, its lone east card after architecture
change, the dense final page and the broken alias's lone south reference. The
single west/east cards aligned vertically with the center and their 50% ports;
the single south card aligned horizontally and produced a straight vertical route.
The centered dense preview also survived Focus/Back. Alias activation and
ambiguous endpoint choice were rechecked. Workspace typecheck, all 22 web tests,
the production web build and changed-file formatting passed. Rust, generated
preview data and Archer source files were unchanged.

Other browser engines and screen-reader behavior remain unqualified. Nonempty
external ingress is not supplied by the current synthetic datasets.
