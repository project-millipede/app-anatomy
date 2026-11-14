# Explorer relationship sources

## Responsibility and evidence

The `/explorer` page defaults to native selected-file evidence and separately
retains the synthetic inventory experiment. `ApplicationExplorer` owns one instance
of the existing native session/model hooks across source switches. Native reports
come from explicit **Inspect dependencies** invocations; synthetic candidate
queries consume authored facts. Neither presentation performs binary analysis or
filesystem-client protocol work in TypeScript.

The synthetic mode renders inventories and relationship results computed by
ordinary Rust APIs in `binary-inspection::explorer`. That library validates
inventory identity and containment, expands supported references, follows
represented aliases and produces direct neighborhoods. It has no filesystem, WIT,
serialization, networking or JavaScript dependency.

The synthetic preview borrows pinned `object` types for Mach-O dependency flags, command
identifiers, versions and CPU identity. Owned application records retain original reference
bytes, provenance and separate entry/image/relationship identities. A filesystem
alias and its target remain separate entries even when their basenames match.
Fixture provenance is explicit; authored byte lengths and image ranges do not
claim parsed offsets or acquired files.

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

## Native application or binary presentation

On entry, the page's model queries the service's retained selection. Explorer offers **Open application** and **Open binary** through native controls
and ordinary Rust acquisition APIs. Inspection is explicit; entering the route or switching source modes
does not trigger dependency analysis. The runtime, pending operation, native model
and its report survive a source-mode switch. Route navigation disposes the old
page owner; a new owner queries selection and begins without its previous report.
The Ark source tabs are **Native** (default) and **Synthetic preview**. The
page owns its runtime and model above the tab root. **Open** stays in the native
toolbar, dependency inspection is beside the canvas context, and direction labels
stay in the canvas legend. Shared navigation provides the **Download Native
Workbench** setup dialog in every view; it owns no runtime.

The shared-control increment was checked in the in-app browser on 2026-10-29:
Arrow/Enter source switching preserved an inspected native report and its second
architecture slice. Download dialog dismissal returned focus to its trigger in
Explorer and Base UI; Ark and comparison each exposed the same single action.
The default architecture-tab recipe retained its report spacing. Preview freshness,
workspace typecheck, all 22 web tests and the production build passed. This
increment changed presentation only; Rust, WIT and native acquisition were unchanged.

**Open application** selects one macOS `.app` bundle as the fixed outer root in
Files. `/Applications` is a chooser location, not an Explorer root. The tree keeps
all captured bundle contents, including resources, frameworks, nested helpers,
plists and aliases. It does not filter the tree down to binary files. Ark expands
directories on demand and owns keyboard focus and expansion. A listed file becomes
the center only after native acquisition succeeds. Expansion preserves that file
and its report; file selection retains the application root and loaded siblings.
Before a file is selected, the canvas identifies the application subject.

**Open binary** acquires a standalone supported Mach-O file, including a universal
file. Acquisition checks headers through the existing ordinary Rust inspector;
dependency inspection remains explicit. A successful external choice replaces the
preceding subject. Cancel or failed validation preserves it.

The service reports an explicit `SelectionScope`: `Empty`, `File`, `Directory`,
`Application` or `Binary`. Generic file/folder acquisition remains available to the
Base/Ark workbench. Explorer admits only `Application` and `Binary` and never
infers scope from a display name. The native owner retains application scope while
its selected file changes. A missing scope means an older service, not an empty
owner: new acquisition methods report an update requirement before sending an
unsupported request.

Application acquisition uses the native package picker and then independently
validates observed filesystem facts through `binary-inspection`. The supported
root layout is a directory named `*.app`, containing a `Contents` directory and
regular `Contents/Info.plist`. The suffix is case-sensitive; the native adapter
does not follow a symlink at any of these three observed entries. This structural
check does not verify plist content,
code signatures or launch eligibility. Older flat application layouts are not
supported. Native adapters gather filesystem facts; the portable core owns the
application-layout policy.

`filesystem_native::NativeSelection` owns the root, captured child listings and
selected file origin. Its ordinary Rust APIs work without a service or component.
The service assigns opaque identities to retained directories; entry IDs are scoped
to their parent listing. The Rust operations session retains bounded listing
projections and hydrates the root/ancestor chain on a fresh observation. WIT carries
those records to React, which projects them into Ark nodes without resolving paths
or implementing filesystem workflow. A loaded empty directory differs from an
unloaded directory. Failed expansion remains retryable and does not install an
empty listing.

Each mount retains at most 64 directories. Each captured immediate listing retains
the existing 512-entry and 64-KiB name limits. There is no recursive scan or live
watcher. Captured listings are not a filesystem snapshot; later opens may fail if
the filesystem changes. Symlinks are displayed but are not followed. Successful
external application or binary selection replaces the mount; Cancel and failed acquisition
preserve it. Returning to the route re-observes the root and selected file's
ancestors, while presentation expansion and reports start with the new page owner.

Resource IDs identify nodes; display names do not supply exact filesystem paths.
The selected application establishes the outer navigation scope. Lazy directory
listings do not establish a complete inspected bundle relationship graph.

Declared libraries use the south corridor with **Target not evaluated** status.
These cards represent declarations, not external-file findings, missing providers
or evaluated candidates. They have no acquired target endpoints to reveal or focus.
The inspector shows source runpaths and ID-dylib names, per-declaration imports,
and special/flat/otherwise unassociated imports.

[`DependencyEvidence::group_imports`](../../../crates/binary/inspection/src/model.rs)
produces per-declaration indices into the original imports list using upstream
ordinary ordinals. Symbol-table ordinals require `MH_TWOLEVEL`; explicit dyld-bind
ordinals retain their own context. Duplicate library names stay separate. Special,
flat, unspecified and absent-declaration associations remain in the unassociated
index list. WIT `apple-code:analysis@0.9.0` carries these lists as
`declared-library.import-indices` and
`dependency-evidence.unassociated-import-indices`. The original imports and flags
remain available; React consumes the supplied indices without reinterpreting them.

This mode does not call the candidate evaluator, acquire a complete inspected
bundle inventory, resolve runpaths against disk or perform runtime symbol binding. The
[native Explorer qualification](../rust-analysis-core.md#native-explorer-qualification)
records retained-file runs through the native remote and live browser adapters;
live picker acquisition remains unverified.

## Explorer diagnostics

Explorer reserves a status strip below the workspace and above the scope footer.
Pending state, failure counts and **Details** occupy the same height. Details opens
a nonmodal panel over the workspace; neither the strip's content nor the panel
changes the relationship canvas dimensions. Failures do not open it or move focus.
Close and Escape hide the panel without clearing diagnostics or changing native
selection. A panel already open updates to the next operation's pending state and
result.

`ApplicationExplorer` retains the existing model owner. The model holds one
current-feedback record with the invocation identity, pending state, original Rust
outcome and separate host failure. Existing workbench presentation properties are
derived from that record; this diagnostics UI is available only in Explorer.
Switching to Synthetic hides native feedback and closes the panel. Returning to
Native shows the retained current native feedback with details closed.

Every failed Rust step is labeled from its generated step kind and displayed in
returned order. Equal messages in different steps remain separate. Host/component
rejections and independent folder-loading failures have their own sections; they
are not invented Rust steps. Technical details preserve the supplied message and
whitespace without parsing transport strings or inferring a recovery action.

Directory expansion carries its invocation identity through the model-to-tree
boundary. A typed rejection distinguishes failures already reported by the model
from independent tree-loading failures. Ark still receives a rejection for failed
loads, so it cannot install an empty successful listing. Explorer processes all
reported nodes, suppresses only explicitly delegated duplicates, and excludes
obsolete invocation or tree-scope notifications. Starting another admitted
invocation replaces the displayed failure group; there is no operation history,
automatic retry or diagnostic persistence.

The [report lifecycle](../system-overview.md#application-ownership) is unchanged:
a new inspection, or a different, empty or unavailable selection, may still clear
the displayed report. This placement removes feedback-driven canvas resizing; it
does not retain stale graphs or alter Rust selection, transport or inspection
semantics.

## Application subject qualification

On 2026-10-29, workspace and component Rust tests passed (67 tests), along with
Rust formatting, `pnpm engine:build`, generated-preview freshness, workspace
typecheck, all 29 web/Archer tests and the production build. Native tests cover
application validation, internal-file scope retention, invalid replacement,
standalone binary acquisition and Cancel. Operations tests independently enforce
scope/resource consistency and reject legacy providers before sending a new
acquisition request.

A temporary native service and matching browser component used an alternate
address and real temporary bundle files. Only the OS chooser input was scripted;
the ordinary Rust acquisition, validation, retained owner, WebSocket protocol,
component and Explorer were exercised together. The browser showed one
`Fixture.app` root, resources and plists, a framework and a nested helper, then
inspected an internal universal Mach-O file with two slices and 37 imports while
keeping the application root. Cancel preserved the root, a generic directory was
rejected without replacement, and opening an extensionless binary replaced the
application tree with one file. These checks do not qualify live macOS package
picker interaction, other operating systems or other browser engines.

The updated macOS installer is staged behind the shared download action. The
installed owner was not replaced or restarted by this increment. Opening an
Explorer subject requires the updated service; install/relaunch and a page reload
are necessary when upgrading from the preceding generic-folder service.

## Historical retained native folder qualification

This records the general folder-navigation milestone before Explorer acquisition
was restricted to one application or binary. On 2026-10-29, workspace native tests
and the component test target passed after
the directory ownership and WIT 0.8 changes. Focused tests cover sibling retention,
transactional acquisition/replacement, the 64-directory bound, protocol reply
correspondence, hydration ancestry and replacement rejection. The maximum allowed
listing plus selection metadata fits the unchanged 96-KiB response limit.
`pnpm engine:build`, preview freshness, typecheck, all 26 web tests and the production
build passed.

An in-process Rust composition selected a temporary root, loaded two sibling
folders, inspected a file through `inspect_dependencies_source`, and retained its
root/file while loading the other sibling. It reported two images and 37 imports
without a service, JavaScript or Wasm. The ordinary native remote adapter inspected
an equivalent copy through a real WebSocket service and reported the same data.

A separate temporary service/component build used a matching alternate address to
avoid replacing the installed native owner's selection. In the in-app browser,
root and sibling expansion remained intact across file selection; expansion kept
an existing 37-import report. Empty listings, failed-expansion retry, repeated file
activation, selected-file ancestry after refresh, and an 80-file virtualized folder
were exercised. An offscreen file was selected with 24 tree rows mounted and a
2479.5px scroll offset. Refresh revealed the retained selected row at a 2256px
scroll offset while keyboard focus stayed on the document body. No frontend
filesystem provider or candidate evaluation was
used. The temporary service began with a Rust-acquired fixture root; live OS picker
interaction was not qualified by this run. Other operating systems and browser
engines remain unqualified.

The updated installer is staged behind the shared download action. Folder mounting
requires this new native service; an older service's standalone-file inspection
remains usable, and an older directory cursor displays an update instruction.
Install/relaunch of the user's existing native owner was not performed.

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

`Inventory::matching_images(entry, requested_cpu)` exposes exact image matching
independently of resolution contexts and neighborhoods. It returns all matching
image IDs for that entry in recorded inventory order, comparing the complete
existing `CpuIdentity`, including subtype bits. An empty result means no recorded
image matches; missing or foreign entry IDs return `InventoryError`. The query
does not follow aliases or evaluate relationships. Dependency candidate evaluation
reuses it after path and alias evaluation identifies the target entry. This is an
ordinary Rust API with no filesystem or component-runtime dependency.

Every attempted path and rejection remains evidence. All plausible matches are
preserved in search order; a candidate set is not a claim about dyld's selected
library. External unacquired references, unresolved references, unsupported
interpretation and unknown containment stay distinguishable. Resource mentions
do not prove access, and planning suggestions do not create dependency endpoints.

Neighborhoods are one-hop views relative to the fixed outer application
inventory, including nested bundles. Folder selection does not aggregate child
references. Separate evidence records remain separate relationships while tree
roles count each represented resource once.

## Synthetic file-byte composition

`Inventory::file_byte_layout` is an ordinary Rust query over a regular file entry,
its supplied byte length and borrowed `ImageByteRange` records. Each record pairs
an exact inventory image identity with the existing checked `FileRange` type.
The query validates entry/image ownership, repeated image identities, nonempty
image ranges, overlap and file bounds. It orders ranges by offset and returns
image regions plus the complementary **Other / unmapped bytes** regions spanning
the supplied file length. Coordinates and lengths remain `u64`, and range ends
are exclusive.

Ranges may omit recorded images whose byte coordinates are unknown. An omitted
range does not remove that image from architecture coverage. Complementary bytes
are not classified as padding, headers, resources or signature data. The query
does not detect thin/universal format, parse binary bytes or determine memory use.
Several images with the same CPU identity remain separate image regions.

Synthetic file lengths and image ranges are explicitly authored sidecar fixtures
outside production `src/`. They are independent of CPU coverage: coverage states
which recorded images belong to each file, while byte composition states where
supplied image ranges lie inside that particular file. A missing byte layout is
unknown, not a zero-byte file or an equal division among architectures.

## Build-time preview adapter

The Rust xtask calls the public candidate, neighborhood, exact image matching and
file-byte layout APIs and converts their results into the tracked
`previewData.generated.json` asset. Serialization and conversion of upstream
wrappers belong to this adapter, outside the core. The artifact contains
inventories, contexts, evidence, candidates, attempts, per-selection neighborhood
projections, application-level architecture coverage and authored per-file byte
composition.

The private coverage projection composes `Inventory::matching_images` without
adding a public Rust API or availability classification. Columns retain distinct
recorded CPU identities in first-seen image order; rows retain inventory entry
order and include only entries with recorded images. Each cell preserves all
exactly matching image IDs, including an empty list when no image matches.
Matching includes the complete CPU subtype bits and does not follow aliases.
Generation failures propagate rather than becoming empty successful coverage.

`architectureCoverage` supplies architecture descriptors and binary rows with
per-architecture matches. Each context's `architectureId` uses the same stable
key derived from the complete raw CPU type and subtype. React compares these
supplied keys to highlight a column; it does not reproduce CPU matching. Names
and paths remain in the existing entry records, and displayed totals are derived
from the supplied data.

Each binary row also carries `byteLayout`: either `null` when no file-byte facts
were supplied, or a file `byteLength` with ordered `regions`. Every region retains
`offset`, `size` and exclusive `end`; image regions identify their exact `imageId`
and `architectureId`, while complementary regions set both identities to `null`.
The exporter rejects byte values outside JavaScript's safe-integer range before
writing JSON. It does not round, clamp or silently omit unrepresentable ranges.
React uses these supplied regions for proportional display and exact-range
details; it does not validate or reconstruct the file partition.

```sh
pnpm explorer:generate
```

The web package generates this artifact before development startup, production
builds and typechecking, including when those commands are run directly through
the package filter. The root `test:web` command also generates it before tests
import the preview. Generation failures stop the consuming command. The Rust
fixtures and exporter are the source of the tracked JSON. Run the command
above to regenerate it manually after changing those sources during a running
development session. TypeScript infers payload types from the JSON import and
looks up Rust-computed projections; it does not expand references or compute
compatibility or candidates.

The synthetic presentation does not invoke native inspection or a live Wasm
resolver. The page-owned native runtime/model remains mounted across source
switches. Rendering the generated candidate results is not a live resolver
execution qualification.

## Synthetic presentation ownership

Synthetic Explorer opens on **Overview**, which contains the dataset chooser and
architecture/context selector. It starts with the dataset's `initialContextId`
and presents the supplied scope, CPU identity, executable and ordered runpaths,
including their declaring images. These are authored context facts, not a native
binary-layout report. **Relationships** displays the selected context as read-only;
the Overview tab is the place to change it.

Overview's main visualization is a read-only architecture matrix across the
application inventory. Each row identifies a file and its path; each column
identifies a recorded CPU identity. A present cell means **Recorded image** and
shows a count when several images match. An absent cell means **No image recorded
for this CPU identity**. Neither cell claims runtime compatibility or launch
eligibility. Entries without recorded images are omitted without classifying
them as nonbinary or architecture-independent. Aliases are not followed to create
additional binary rows.

Matrix columns come from recorded images, not from the context menu. For example,
the Ambiguity dataset records an `arm64e` image without an authored `arm64e`
exploration context. That image contributes a column but does not create a new
context. The selected context highlights its matching column; a context without
a recorded column highlights none. Rows with supplied byte facts show their full
size display beneath the file path: a readable and exact byte total, a 2rem-high
bar with square corners, and an axis from `0x0` to the exclusive file end. Each
image or unmapped region is a named, keyboard-focusable Ark Tooltip trigger.
Hovering or keyboard-focusing a region reveals its exact byte facts without
selecting a relationship center or changing tree selection. File selection for
relationship traversal remains in Relationships.

One full context selector retains architecture, executable and ordered runpaths
as a single choice. Its details appear beside the matrix on wide screens and
above it on narrow screens. Normal Overview scrolling accommodates dense
inventories; the table can scroll horizontally when space is limited. This view
does not infer thin or universal container format from image counts or replace an
individual binary's anatomy view.

Each bar represents that file's supplied byte length; it is not a comparison of
application-wide file sizes. Regions retain their recorded byte order and exact
proportions, including tiny spans. One Ark `Tooltip.Root` per file shares content
across region triggers, keyed by each region's unique offset. Ark owns opening,
active-trigger identity, dismissal and positioning. The tooltip looks up the
original Rust-projected region and shows its architecture or unmapped label,
offset, exclusive end and exact/readable length. Raw image IDs remain in the
payload; offsets distinguish displayed regions sharing a CPU identity.

`ExplorerOverview` has no expanded-file state or focus-return handlers. There is
no expanded row or detached detail panel. Tooltip positioners remain beside their
bars under the existing theme, using fixed positioning to avoid the current
scroll containers' clipping. Labels identify the values as authored synthetic
data. Missing byte facts remain unavailable rather than producing estimated
widths or sizes; zero-byte files show their total without region triggers.

This interaction supports pointer hover and keyboard focus. It does not add tap
activation or click-to-pin behavior; touch-specific inspection remains a separate
interaction decision. Architecture changes update highlights without selecting a
file, and dataset replacement remounts the tooltip owners. These transient
previews do not change relationship-tree selection, candidates or history.

`ExplorerWorkspace` owns the dataset. `DatasetWorkspace` owns the context and
Overview/Relationships navigation. A `RelationshipSession`, keyed by context ID,
owns its tree collection, Ark tree, preview, candidate choice, navigation history,
pending reveal/scroll work and canvas pagination. Ark's selected value remains
the sole center selection; Ark also owns expansion and keyboard focus. No
application React Context or global runtime store is introduced.

A fresh relationship session rebuilds the physical tree with the application root
expanded and scroll at the top. It has no selected entry, center, preview, candidate
choice or history. Before a file is selected, the canvas prompts for a selection;
it mounts no relationship cards, ports or connectors, and the inspector shows no
relationship evidence or endpoint actions. Selecting an entry looks up its
Rust-generated neighborhood in the session's fixed context. An absent selection
is intentional; a missing generated projection for a selected entry is a data
error, not a successful empty neighborhood.

Selecting a different context disposes the relationship session and creates a
fresh one, resetting selection, expansion, scroll, preview, history and pagination.
Disposal cancels pending animation-frame work so the preceding session cannot
scroll the new tree. Returning to a previously used context also starts fresh;
there is no per-context history. Selecting the current context is a no-op. Visiting
Overview and returning without changing context retains the mounted relationship
session and its state.

Rebuilding uses the existing physical inventory shared by the contexts, so the
same file paths can appear after a context change. It does not filter tree entries
by architecture, compare the preceding center with another image, add frontend
availability classifications, or recompute architecture coverage. The existing
Rust matching query serves candidate evaluation and the separate build-time
Overview projection. This workspace reload does not refresh the browser, rescan
native files or execute a live Wasm evaluator.

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
relationship, candidate choice, expansion and tree scroll within the current
session. Context is not stored in Back history and cannot change during traversal.
Manual collapse persists until a later selection or reveal requires expansion.
External or unresolved references do not fabricate tree entries or focus actions.

The Overview/Relationships boundary changes only the synthetic presentation.
Native Explorer retains its architecture selector, declaration behavior and
page-owned runtime/model. Native overview integration is a separate milestone.

The [tree virtualization contract](explorer-tree-virtualization.md) continues to
own row geometry, nested mounting, Ark keyboard behavior and viewport scrolling.

## Qualification and later native integration

Native tests establish application-owned candidate and projection rules against
independent expectations. UI tests and real-browser checks establish linked
presentation behavior. The ordinary library can compile for browser Wasm, but
the synthetic candidate preview does not execute resolution inside Wasm. Native
mode invokes the separately implemented dependency-evidence component operation.

`inspect_dependencies` and `inspect_dependencies_source` expose upstream dependency
declarations and import/library associations through the selected binary's
bounded-input path. `Session::inspect_dependencies` and WIT `inspect-dependencies`
compose that ordinary Rust operation. Header inspection remains a separate scope.
The workbench report and native Explorer display this evidence. The Explorer's
native mode still does not acquire dependent-file graph endpoints. See the
[dependency API contract](../rust-analysis-core.md#dependency-evidence) for read scope,
owned evidence and unsupported capabilities. The current
[native Explorer qualification](../rust-analysis-core.md#native-explorer-qualification)
and preceding historical dependency record distinguish adapter execution from
compilation and presentation checks.

Whole-bundle acquisition is a separate extension. Native entry IDs are
listing-scoped and lazy expansion retains directory identities, but symlink targets
and a complete inspected bundle inventory remain unavailable. Future native
inventory and read-link capabilities must preserve selection/resource ownership
and bounded reads. Optional candidate queries can consume the acquired facts and explicit
context separately.

Native file-byte display is a separate integration. A native adapter must supply
observed file lengths and exact image ranges from the existing Rust inspection
path, associate them with acquired inventory entries/images, and call the same
ordinary `file_byte_layout` query. Authored preview ranges do not qualify this
acquisition path. This increment adds no native scan, read-link capability, WIT
operation or live Wasm byte-layout execution, and does not change native Explorer
or an individual binary's anatomy report.

### Synthetic preview validation recorded on 2026-10-29

This is the historical synthetic milestone before native-source integration;
its checks do not qualify the subsequent native Explorer workflow. The
`explorer:check` command recorded below was later replaced by automatic generation
before consuming commands.

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

### Synthetic fixed corridor layout and historical qualification

This records the synthetic layout increment before native-source integration.
The browser checks below apply to that increment, not to native file acquisition.

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

At this historical milestone, the dataset chooser was in the tree pane and
architecture context above the canvas. Ark remained the sole tree selection,
expansion and keyboard owner.
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
