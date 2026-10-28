# Explorer tree virtualization

## Purpose and ownership

Bound mounted rows for large expanded inventories while preserving Ark Tree View
as the sole collection, selection, expansion and keyboard owner. This is
presentation and UI lifecycle behavior. The authored preview does not acquire
files or implement Rust analysis, filesystem protocol or workflow semantics.

- `ExplorerWorkspace` owns one Ark tree through `useVirtualizedTree` and derives
  the selected canvas name/path from that same model.
- `ExplorerFileTree` composes the Ark root, pane slots and virtual viewport.
- `ExplorerTreeNode` owns Explorer-specific node markup, icons, labels, compact
  selection surfaces and the folder-click policy. Row clicks open folders; their
  chevrons separately toggle expansion.
- `NavigationPane` allocates the tree region's available height.
- `VirtualTreeViewport` owns its one scroll container, positioned nested groups
  and node-rendering slot. It imports no preview inventory type or node UI.
- `useTreeViewport` adapts the cached expanded sequence to TanStack Virtual and
  connects Ark's keyboard-scroll callback through a typed ref.
- `visibleTree` indexes expanded-row ancestry/extents and groups retained rows by
  their real direct parent. It has no DOM, styling or interaction ownership.
- The recipe declares row geometry, and `ExplorerFileTree` supplies matching
  viewport values. Overscan belongs to the adapter, not the recipe.

No application Context, global store, second selection/expansion/focus model,
pending keyboard target state, row-size observer or height-restoration hook is
introduced. All Ark objects and callbacks remain inside the client subtree.

## Nested positioning instead of spacer projection

Ark supplies a flat preorder sequence of expanded nodes and their collection
index paths. TanStack supplies the virtual row range and size/offset calculation.
Neither supplies the nested rendering groups required to preserve actual Ark
Branch/BranchContent relationships.

Build a small index once per topology change. Each expanded row records its
sequence index, parent row index, exclusive subtree end and full sibling count.
A preorder stack calculates subtree ends in one pass. Sibling counts come from
the complete collection, including unmounted siblings.

For each virtual window, retain requested rows and their ancestor chains, then
group those rows by direct parent. A relative child group reserves its complete
expanded descendant height; retained children are absolutely positioned inside
that group. For row index `i`, parent row index `p`, subtree end `e` and row height
`h`, the child offset is `(i - p - 1) * h` and its descendant group height is
`(e - i - 1) * h`. Top-level offsets use `i * h` plus the tree's padding.

There is no `nestedProjection.ts`, node/gap instruction union, spacer generation,
flat-row renderer or replacement ancestry-connector algorithm. This remains a
small application-owned nesting adapter; it is not supplied by TanStack.

The existing two-column nested grid, root/last/leaf selectors, BranchContent slot
and first-row connector anchor remain. A branch's connector spans its complete
subtree, so replacing that first-row anchor with `50%` would be incorrect.

## Geometry and scroll ownership

Interactive rows have an exact 32 CSS-pixel border-box height. Labels retain their
existing single-line ellipsis and full title. The recipe declares `32px` rows and
a `3px` tree inset; `ExplorerFileTree` passes matching numeric viewport props.
Keep these declarations aligned. The inset matches the previous 0.1875rem at the
application's 16px root font size. Padding is included in TanStack's start/end
extent, scroll-alignment insets and top-level offsets. No per-row measurement is required.

Density is fixed for a mounted viewport. Text-size or spacing changes must still
fit that row height or accompany an explicit geometry update. CSS-pixel browser
zoom applies to CSS and JS coordinates together. Ark's existing Collapsible may
measure its own branch content; this adapter adds no row measurement machinery.

NavigationPane allocates space with a zero minimum block size and no overflow
owner. The virtual viewport owns overflow and overscroll containment. No workspace
breakpoint, pane ratio, header/footer spacing or canvas/inspector styles change.

## Cache and focus contracts

The adapter's expanded-row index and item-key function depend on collection
identity and the serialized expanded IDs. Ark's API object and expanded array
receive new identities during focus/selection updates, so those object identities
are intentionally not cache keys. Replace the collection when its contents
change. Serialization is proportional to expanded-folder count; rebuilding the
row index is proportional to expanded-row count. Expansion order changes can
safely cause an extra rebuild.

Wheel updates stay inside the viewport. The range extractor retains the actual
focused DOM row, or Ark's mounted `tabindex="0"` entry while focus is outside the
tree, through a value-to-index lookup. Keeping the tab stop prevents scrolling
from removing the tree's only keyboard entry point. A topology-cached first
eligible row handles initial windows whose enabled entry starts offscreen;
eligibility comes from the collection. Candidates are checked against the current
collection so stale DOM from a collection update cannot pin a newly disabled row.
There is no scan of every row's interaction state or mirrored focus in React
state. A previously retained row can remain until the next range change after
focus moves.

Ark's `scrollToIndexFn` calls the viewport's typed callback. Instant index scrolling
and TanStack's `useFlushSync` commit a window before Ark's next-frame DOM focus
attempt. `useImperativeHandle` publishes and clears the callback with viewport
lifetime. Qualify the supported browser path; smooth-scroll or every browser's
focus timing is not established by this contract.

The cache removes duplicate adapter traversal/indexing/key churn. Ark's own
keyboard actions can still compute and scan their visible sequence. Do not claim
constant-time keyboard navigation or zero collection traversal upstream.

## Boundaries and limitations

DOM size is bounded by viewport/overscan rows plus retained focus and ancestor
paths. A deep chain retains every ancestor required for real nesting. The entire
inventory and expanded index remain in memory. This is viewport virtualization,
not server paging, lazy filesystem acquisition, search or ancestor-preserving
filtering. Distant files keep their ordinary scroll positions.

## Validation

Test the owned index and ancestor-group transformation: subtree extents, complete
sibling metadata, sparse disjoint paths, wide folders, deep chains and empty
ranges. Browser-qualify a fully expanded 10,124-node fixture for bounded mounted
rows, exact full extent, fixed row heights, actual nested DOM, unchanged connectors,
Home/End/typeahead/arrows, collapse/reopen, manual focus retention, Tab re-entry
after blur and an initially offscreen enabled entry.

Instrument adapter visible-sequence reads and owner renders to distinguish
upstream Ark work from adapter cache rebuilds. Focus/selection must reuse the
adapter index; expansion and collection replacement must invalidate it. Exercise
normal and React Strict Mode, viewport resizing and remounting, then run typecheck,
relevant tests and the production build. Report browser and screen-reader modes
that were not qualified.
