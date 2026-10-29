# Explorer synthetic relationships

## Responsibility and evidence

The `/explorer` preview renders synthetic application inventories and relationship
results computed by ordinary Rust APIs in `binary-inspection::explorer`. The
Rust library validates inventory identity and containment, expands supported
references, follows represented aliases and produces direct neighborhoods. It
has no filesystem, WIT, serialization, networking or JavaScript dependency.

The pinned `object` types supply Mach-O dependency flags, command identifiers,
versions and CPU identity. Owned application records retain original reference
bytes, provenance and separate entry/image/relationship identities. A filesystem
alias and its target remain separate entries even when their basenames match.
Fixture provenance is explicit; synthetic evidence does not claim parsed offsets.

Fixture builders live outside the production library's `src/` and are shared by
native integration tests and the preview exporter. The datasets cover the Atlas
framework/version alias, architecture-dependent and ambiguous references,
incomplete evidence and dense inventories. They are preview data, never native
selection or application sample input.

## Bounded candidate computation

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

Real acquisition requires a separate extension: current native entry IDs are
listing-scoped; opening a directory replaces selection; symlink targets and a
retained whole-bundle inventory are unavailable. Future native inventory and
read-link capabilities must preserve selection/resource ownership and bounded
reads, then feed the same Rust model. Actual dependency/runpath extraction and
selected WIT adapters require their own native/browser qualification.

### Validation recorded on 2026-10-29

- Native workspace tests passed, including 11 Explorer rule tests. The
  `binary-inspection` suite also passed its two doctests and Clippy with warnings
  denied. The existing component library test target compiled and completed
  (it currently contains no tests).
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

### Reference layout correction

The linked-tree-bridge-workspace prototype is the positioning reference. The
Explorer uses fixed readable sidebars around a fluid center, compact page chrome
and intrinsic bridge rows. North is capped at 500px; south spans the canvas with
horizontal cards. Desktop pane scrollers are independent, and narrow screens
stack the panes with a finite virtual-tree viewport.

Archer's existing sharp path builder supplies orthogonal connectors. Its SVG
shares a stacking context with cards, so paths remain below their headings. A
private presentation routing port at the bottom of the middle row supplies the
south corridor, keeping horizontal south segments below the side cards. The
selected card supplies the visible trunk through its center lane. This port is
not domain data, a selectable endpoint or another analysis operation.

Physical paths and explicit alias captions appear on internal relationship
cards; original references remain in the inspector. The synthetic-dataset chooser
belongs to the tree pane, while the selected entry's architecture context stays
above the canvas. Tree indentation and controls are compact while rows remain
32px high and Ark retains selection and focus ownership.

Layout qualification used the in-app browser at 1533×1127, 1100×900 and
740×900. Desktop pane widths measured 294/929/310px; the narrower desktop
measured 230/590/280px without document horizontal overflow. At 740px the panes
stacked and the graph retained its full 599px content height rather than being
clipped; the virtual tree viewport remained bounded. North/south heights were
independent, and south branch segments ran below the bottom of the side cards.
Alias preview, retained center selection, Focus and Back were rechecked after
the changes. Typecheck, the production web build, all 18 web tests and formatting
of the changed files passed.
