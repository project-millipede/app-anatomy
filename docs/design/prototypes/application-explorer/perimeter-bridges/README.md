# Perimeter bridges

**Status: exploring. This is an illustrative interaction prototype, not a selected application implementation.**

Open [index.html](index.html) in a browser to try the saved concept. No application
build, development server or native service is required.

## Saved files

| File                     | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| [index.html](index.html) | Standalone prototype page and editable source. |

The page is a single hand-written HTML file with inline CSS, inline SVG icons and
inline JavaScript. It loads no CDN libraries, and its Content Security Policy permits
no network requests. It does not use the visualize skill's exporter, so there is no
separate fragment to regenerate. The theme choice is the only value kept in browser
storage; the page works without it.

## Design question

Can a separate visualization layer explain a selected object's relationships better
than lines drawn into the tree? The physical tree keeps containment only. Selecting
an entry makes it the focus of a compass whose bridges sort relationship records by
direction and by whether they cross a perimeter around the focus.

## Relation to sibling candidates

The [separated bridge workspace](../separated-bridge-workspace/README.md) also keeps
four bridges in a canvas apart from the tree, with west/east inside Atlas.app and
north/south for external or unresolved references. Its outer inventory scope stays
fixed. This candidate tests three differences:

- **Movable perimeter.** The frame can shrink to the nearest enclosing bundle, so the
  same record can be internal under one perimeter and crossing under the other.
- **Unknown containment is not south.** Unresolved targets go to a separate tray
  instead of being treated as leaving the perimeter.
- **Two-hop notes and aggregate focus.** Crossing references that lead back inside
  are annotated, and a folder or bundle focus bridges every relationship crossing
  its boundary rather than only direct associations.

The [boundary compass layer](../boundary-compass-layer/README.md) instead uses
north/south for direction and west/east for the Atlas.app boundary.

## Interaction model

- The tree shows files, folders, bundles and reference records. It carries no
  relationship lines, counts or markers. Selecting an entry sets the focus; the
  current perimeter bundle receives a small tag so the frame can be located.
- The **perimeter** is either the nearest enclosing bundle (the focus itself when it
  is a bundle) or the whole application. A reference-record focus always uses the
  application, and the focus is drawn outside it.
- The compass follows the north–south / east–west convention for traffic that crosses
  a boundary or stays inside it. Traffic reads top to bottom and left to right:

  | Bridge                     | Meaning                                                                                                                                               |
  | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
  | North · ingress            | Relationships reaching the focus from the other side of the perimeter, through the north gate.                                                        |
  | West · internal ingress    | References to the focus from the same side of the perimeter.                                                                                          |
  | East · internal resolution | References from the focus that resolve, or are proposed to resolve, without leaving the perimeter. Runpath and version-link steps appear on the card. |
  | South · egress             | References from the focus to targets on the other side, through the south gate.                                                                       |
  | Unplaced tray              | Endpoints with unknown containment. They are neither inside nor outside and are not routed through a gate.                                            |

- A bundle or directory focus bridges only relationships crossing its own boundary.
  Relationships wholly inside the selection are counted in the focus details, not
  bridged.
- Switching the perimeter reclassifies the same records and reports what moved, for
  example North → West when a sibling bundle becomes part of the perimeter. It never
  adds, removes or upgrades evidence.
- Two-hop notes connect a crossing reference to a record that returns inside the
  perimeter: a _bypass_ (an absolute load reference leaves although a staged copy
  exists inside), a _stand-in_ (the opposite view from the staged copy), a _round
  trip_ through an OS-mediated name and a _candidate provider_.
- Selecting a card opens the inspector with evidence, resolution steps, exact source
  and target paths, and an explanation of why the relationship sits on that bridge
  and where it would sit under the other perimeter. **Locate in tree** reveals
  endpoints without changing the focus. Following an endpoint keeps the relationship
  selected from its other side. Back and Forward restore focus, perimeter,
  architecture and tree expansion.
- Architecture context and evidence-strength filters (recorded, derived or candidate,
  string or inferred) limit the records in view. Hidden counts remain visible in the
  focus details.
- Below roughly 640 px of available width, the compass becomes a reading-order stack
  (north, west, focus, east, south) without drawn connectors.

## Data and evidence limits

The tree, filenames, relationships and status labels are fixed illustrative data
created for the design conversation. They extend the data set of the
[mixed relation overlay](../mixed-relation-overlay/README.md) with signature special
slots, nested-code seal entries, a plug-in symbol binding, a nested helper framework
and a per-architecture difference in the main executable's framework reference. They
were not acquired by inspecting an application, filesystem or running process. They
are not a redistributable binary fixture corpus or qualification evidence. The tree
represents a staged copy of the example application.

Keep these distinctions when evaluating the concept:

- A recorded dependency name is static evidence; it does not prove a library was
  loaded. A resolution candidate or derived target remains a candidate, not a proven
  target. Displayed resolution steps describe the illustrative layout, not observed
  loader behavior.
- A bypass note marks a recorded path that leaves the perimeter while a contained
  candidate exists. It does not establish which file a launch would use.
- Incoming counts cover the relationships represented by the example. They do not
  inventory consumers elsewhere on the system.
- A bound special-slot hash or resource-seal entry is not integrity, signature
  validity or certificate trust. A nested-code record does not establish that the
  nested signature is valid.
- Entitlements and named services do not establish observed filesystem, network or
  IPC activity. Runtime claims would require separate observations.
- Perimeter placement uses physical containment. It is a presentation of existing
  relationship records, not an additional relationship.

## Scope

JavaScript in this prototype supplies presentation and UI interaction over the fixed
example: focus, expansion, filters, perimeter classification, two-hop notes, connector
geometry and navigation history. There is no Rust analyzer, WIT/component integration,
filesystem protocol, native selection, binary interpretation, dependency resolver,
signer or runtime tracing backend. The saved page does not add sample acquisition or
another runtime owner to the Workbench application.

Perimeter classification and the bypass, stand-in, round-trip and provider notes are
relationship semantics. In a product implementation, ordinary Rust owners would
compose them with the relationships and containment they depend on; the UI would
present the result. This prototype neither defines that API nor qualifies native or
browser processing. Any product implementation must also preserve the existing
application runtime lifecycle.

## What to evaluate

Use the **Try** buttons to compare the framework image with the nearest-bundle
perimeter (all four bridges carry traffic), the main executable's arm64 bypass and
its x86_64 bundle-relative reference, and the helper executable before and after
widening the perimeter. Then focus a folder and a reference record. Check whether the
compass positions make crossing and internal traffic easier to tell apart than the
overlay's lanes, whether the perimeter choice is understandable, and whether
**Locate in tree** compensates for the lost at-a-glance tree position of endpoints.

Large applications will place many system references on the south bridge. The
prototype shows four cards per crossing bridge, three per internal bridge and a
category summary; it does not establish usability at that scale. Whether a perimeter
should follow signing units rather than bundles, and whether a container's internal
relationships need their own view, remain open questions.
