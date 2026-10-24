# Linked perimeter workspace

**Status: exploring, 2026-10-22. This is an illustrative interaction prototype, not a
selected application implementation.**

Open [index.html](index.html) directly in a browser. No application build,
development server or native service is required.

## Saved files

| File                     | Purpose                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| [index.html](index.html) | Complete, editable standalone source with inline CSS, presentation JavaScript and fixed example records. |

There is no fragment or export step. The page loads no external scripts, styles,
fonts or icons, and its Content Security Policy blocks network connections.
Exploration state is held in memory; refreshing restores the initial selection.

## Design question

Does the [linked tree bridge workspace](../linked-tree-bridge-workspace/README.md)
layout become clearer when its fixed Atlas.app scope is replaced by a perimeter
the user can move, as explored in [perimeter bridges](../perimeter-bridges/README.md)?

This candidate keeps the linked layout (physical tree, four-bridge canvas with a
dashed boundary, vertical inspector outside the graph, orthogonal connectors and
the same visual tokens) and changes what the axes mean:

| Bridge   | Direction              | Meaning                                                                                                        |
| -------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| North    | Other side → selection | Ingress across the perimeter, through the north gate.                                                          |
| West     | Same side → selection  | Internal ingress from inside the perimeter.                                                                    |
| East     | Selection → same side  | Internal resolution: targets that resolve, or are proposed to resolve, without leaving the perimeter.          |
| South    | Selection → other side | Egress across the perimeter: system names, external paths, capabilities, and files outside a narrow perimeter. |
| Unplaced | Either                 | Containment unknown. Such endpoints are not treated as leaving the perimeter.                                  |

## Differences from the linked tree bridge workspace

- **Movable perimeter.** A segmented control chooses **Atlas.app** (the linked
  layout's fixed scope) or the **nearest bundle**, which is the selection itself
  when it is a bundle. Switching reports which connections moved, for example
  `West → North: 2 · East → South: 2` for the framework executable, and briefly
  marks the moved cards.
- **Tree badges name the bridge.** Linked rows carry `W · IN`, `E · OUT`, `N · IN`
  or `S · OUT` in the bridge's color. Files outside a narrow perimeter are still
  files, so north and south endpoints can be marked in the tree too. The perimeter
  bundle carries a `PERIMETER` badge, and a dashed rail runs down its contents,
  mirroring the canvas frame.
- **Tree linking can be turned off.** _Tree follows connections_ off leaves only
  containment, the selection and the perimeter in the tree. Reveal still locates an
  endpoint on request.
- **Unknown containment gets its own tray** below the south bridge instead of
  sharing it with external references.
- **Folder and bundle selections aggregate.** Connections crossing the selection's
  edge are bridged; connections wholly inside it are counted on the selected card.
  The linked layout shows direct associations only.
- **Two-hop notes.** A _bypass_ marks an absolute load reference that leaves the
  perimeter while a staged copy exists inside it; a _stand-in_ shows the same pair
  from the staged copy; a _round trip_ and a _candidate provider_ cover a service
  name that leaves through the OS and matches a bundle inside.
- **Bridge placement in the inspector.** Beside recorded evidence, resolution
  context and endpoint status, the inspector explains why the connection sits on
  its bridge and where it would sit under the other perimeter.
- **Focus keeps the connection.** Following an endpoint keeps the same connection
  selected, now seen from the other side. Back restores selection, perimeter,
  slice, preview and tree state.

## Interaction model

- Select a tree row to recenter the canvas on that exact resource. With linking on,
  ancestors of related rows open automatically and previewing a connection outlines
  and scrolls to its other endpoint without changing the selection or keyboard
  focus.
- Select a bridge card to preview it in the inspector. **Reveal** expands and marks
  the endpoint in the tree; **Focus** recenters on it. Reference records have no
  tree row and no Reveal or Focus action.
- Crossing bridges show three cards and internal bridges three cards before
  **+n more**. The example slice switches fixed arm64 and x86_64 records.
- **Try** buttons jump to the scenarios listed under _What to evaluate_. _Design
  notes_ repeats the bridge table and the evidence limits.
- Above 780 px the page itself does not scroll. Header, toolbar and footer stay
  fixed; the canvas scrolls in the middle, and the tree and inspector scroll on
  their own without chaining into the page. This differs from the linked layout,
  where the whole page scrolls around a fixed-height tree and a sticky inspector.
- At 780 px and below the page scrolls normally, the inspector follows the
  canvas, and the canvas scrolls horizontally to keep the four directions, as in
  the linked layout.

## Data and evidence limits

The tree, filenames, relationships, resolution steps and status labels are fixed
illustrative data written for the design conversation. They reuse the
[perimeter bridges](../perimeter-bridges/README.md) data set, which extends the
[mixed relation overlay](../mixed-relation-overlay/README.md) example. They were not
acquired by inspecting an application, filesystem or running process, and they are
not a binary fixture corpus or qualification evidence. The tree represents a staged
copy of the example application.

- A recorded load name is not a loaded library; a candidate or derived target is
  not a resolved target. Resolution steps describe the illustrative layout, not
  observed loader behavior.
- A bypass note marks a recorded path that leaves the perimeter while a contained
  candidate exists. It does not establish which file a launch would use.
- A seal entry or bound special-slot hash is not integrity, signature validity or
  trust. An entitlement, path string or service name is not observed access or IPC.
- Empty north bridges mean no records were supplied, not that no consumers exist
  outside the inventory.
- Perimeter placement uses physical containment. It presents existing records; it
  is not an additional relationship.

## Scope

JavaScript supplies presentation and UI interaction over the fixed example:
selection, expansion, tree linking, perimeter classification, two-hop notes,
connector geometry and navigation history. There is no Rust analyzer, WIT/component
integration, filesystem protocol, native selection, binary interpretation,
dependency resolver, signer or runtime tracing backend.

Perimeter classification and the two-hop notes are relationship semantics. In a
product implementation, ordinary Rust owners under `crates/binary/inspection` would
compose them with the relationships and containment they depend on; the UI would
present the result. Any implementation must also preserve the application's existing
runtime and filesystem boundaries.

## What to evaluate

- Select Example and switch between Atlas.app and Example.framework. Do the tree
  badges and the dashed rail make the moved connections easy to follow?
- Select Atlas on arm64, then on x86_64. Is the bypass clear, and does the same
  framework resolving east on x86_64 read as the contrast?
- Select Render Helper with the nearest-bundle perimeter: Example.framework leaves
  south while RenderKit stays east.
- Select the Frameworks folder. Is the aggregate scope with an inside count
  preferable to the linked layout's direct associations only?
- Turn tree linking off. Is a fully separated tree with explicit Reveal enough, or
  do the badges carry essential orientation?

Desktop browser checks covered presets, perimeter switching, slice switching, tree
linking on and off, Focus, Back and console errors, plus a phone-width check for page
overflow. Dense inventories, large south bridges and narrow-screen usability remain
open.
