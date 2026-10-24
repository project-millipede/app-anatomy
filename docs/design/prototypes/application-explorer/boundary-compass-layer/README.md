# Boundary compass layer

**Status: exploring, 2026-10-21. This is an illustrative interaction prototype, not a selected application implementation.**

Open [index.html](index.html) directly in a browser. No application build,
development server or native service is required.

## Saved files

| File                     | Purpose                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| [index.html](index.html) | Complete, editable standalone source with inline CSS, presentation JavaScript and fixed example records. |

There is no fragment or export step. The page loads no external scripts, styles,
fonts or icons, and its content security policy blocks network connections, so it
works offline.

## Design question

Can a selected item's relationships be read by position, before reading text, if
direction and the bundle boundary occupy separate axes of a layer that is kept
completely apart from the physical tree?

- **North/south is direction.** A vertical spine runs through the selection.
  Ingress lanes join it from the north; egress lanes leave it to the south.
- **West/east is the Atlas.app boundary.** Each lane's endpoint sits on the side
  where its example resolution lands: east inside Atlas.app, west outside it
  (system locations, user-data paths, capabilities, unresolved references and the
  original installation). A dashed boundary line runs between the two territories,
  so lanes that leave the application visibly cross it.

Internal bundle resolution therefore reads as _south, then east_. Anything that
leaves the application reads as _south, then west_.

The [separated bridge workspace](../separated-bridge-workspace/README.md) also uses
a separate canvas, but assigns west/east to bundle ingress/egress and north/south
to external or unresolved references. This candidate tests the other assignment:
one axis for direction, one for containment relative to the application.

## Interaction model

- **Complete separation.** The tree shows physical containment only: no relation
  lines, counts or external pseudo-folders. Reference records outside Atlas.app
  never appear in the tree. Selecting a file, folder or bundle raises its bridge
  layer. The tree can be hidden (`T`) and the layer used alone.
- **Two explicit links between the surfaces.** _Locate_ expands the endpoint's
  ancestry and highlights it in the tree without changing the selection.
  _Re-center_ makes the endpoint the selection and keeps the same relation active,
  now seen from the other side. Back and Forward restore earlier selections.
  Breadcrumbs and membrane labels re-center on enclosing folders and bundles.
- **Each relation is one row.** The card on the spine is the recorded request
  (load name, string, property-list value, link target or seal entry) as its source
  stored it. The endpoint card shows what that request reaches in the current
  context. Lanes never cross each other, and the layout grows linearly.
- **Boundary ticks.** Small ticks on a lane count the nested bundles (code units)
  it exits and enters between source and target. The endpoint card states them in
  words, for example _exits Render Helper.app · enters Example.framework_. Atlas.app
  itself is represented by the dashed boundary line rather than a tick.
- **Routes unfold toward their side.** Opening a lane shows its authored
  resolution route, step by step (runpath probes, link hops, base-path assumptions
  and gaps), in the half of the layer where the lane ends.
- **Context switches.** _Layout_ selects the original or staged bundle root.
  _Slice_ selects arm64 or x86_64. In the staged layout, the main executable's
  absolute `/Original/Atlas.app/…` load name moves from east to west, and the staged
  `Example.framework` executable shows a dashed bypass lane in its ingress. Lanes
  recorded only in arm64 slices disappear in the x86_64 view.
- **Aggregate scope.** Selecting a bundle or folder draws only the lanes that cross
  its edge. Relations that stay inside collapse into a count that can be expanded.
- **Ingress from outside is not inventoried.** The north bridge keeps an explicit
  placeholder for consumers outside Atlas.app. An empty list does not claim that
  none exist.
- **Lane filters** limit the view to load commands, strings, declarations and
  links, or seal entries.

The in-page _Design notes_ dialog contains a step-by-step walkthrough.

## Data and evidence limits

The tree, filenames, relationships, routes and status labels are fixed illustrative
data written for the design conversation. They reuse the Atlas.app example from the
[mixed relation overlay](../mixed-relation-overlay/README.md) and extend it with
authored resolution steps. They were not acquired by inspecting an application,
filesystem or running process, and they are not a binary fixture corpus or
qualification evidence.

Keep these distinctions when evaluating the concept:

- Routes are authored, not computed. Nothing in the page resolves runpaths,
  interprets load commands, reads seals or inspects a filesystem. _Present_ means
  represented in the example inventory.
- A recorded load name is static evidence; a resolution candidate is not a loaded
  library. The runpath values, assumed host process and string base paths are
  illustrative launch-context assumptions.
- East and west describe where an example endpoint lies relative to Atlas.app. They
  do not establish that a launch would use that target.
- A boundary crossing says the endpoints belong to different code units. It is not
  a signature, integrity or trust check.
- A seal entry is not an integrity check. A declared entitlement is not observed
  access. A path or service-name string is not an observed read, write or IPC
  exchange.
- Incoming lanes cover only relations represented inside the example. They do not
  inventory consumers elsewhere on the system.

## Scope

JavaScript in this prototype supplies presentation and UI interaction over the fixed
example: selection, expansion, filters, context switches, layout and navigation
history. Browser storage remembers per-viewer conveniences such as the selection,
context and theme. There is no Rust analyzer, WIT/component integration, filesystem
protocol, native selection, binary interpretation, dependency resolver, signer or
runtime tracing backend. The saved page does not add sample acquisition or another
runtime owner to the Workbench application.

Any product implementation must receive domain facts, relationships and resolution
evidence from their ordinary Rust owners and preserve the existing application
runtime lifecycle. This prototype neither defines that API nor qualifies native or
browser processing.

## What to evaluate

Start with the walkthrough in _Design notes_: open Render Helper's lane into the
framework executable, switch to the staged layout, re-center on Atlas from the
bypass lane, then re-center on `libSystem.B.dylib`. Check whether:

- Reading position (west/east) before text speeds up staging questions such as
  "does this stay inside the copy?"
- Boundary ticks are understandable without hovering, or the endpoint text does
  the work.
- Complete separation stays comfortable, or Locate and Re-center feel like too many
  steps compared with the overlay.
- Aggregate scope on `Example.framework`, `Render Helper.app` and the application
  `CodeResources` seal stays readable as the number of lanes grows.
- A second hop (ingress of ingress, egress of egress) should fold out north and
  south.

Below about 820 pixels of layer width, lanes stack beside a left spine and the
west/east territories become side tags. This small example does not establish
performance or usability for large or virtualized relation sets.
