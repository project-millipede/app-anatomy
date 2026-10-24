# Mixed relation overlay

**Status: exploring. This is an illustrative interaction prototype, not a selected application implementation.**

Open [index.html](index.html) in a browser to try the saved concept. No application
build, development server or native service is required.

## Saved files

| File                     | Purpose                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| [index.html](index.html) | Complete, directly editable standalone prototype, including its styles, data, interaction code and rendering support. |

Edit the markup, styles, fixture data and interaction code inside
`<template id="mixed-relation-prototype">` in `index.html`, then reload the page.
No separate source file, exporter or regeneration step is required.

The existing rendering wrapper remains inside the same file. It loads the
template into a sandboxed frame and supplies variant controls, saved-state support
and sizing. Keeping that wrapper preserves the prototype's layout, responsive
breakpoints and behavior. The Mixed lanes and Row markers presentations are
unchanged.

The page loads pinned CDN libraries: Lucide 1.17.0 and Floating UI core 1.7.3 /
DOM 1.7.4. Internet access supplies decorative icons and enhanced tooltips; the
primary prototype UI is local. This package does not guarantee offline operation.

## Design question

Can a small set of incoming and outgoing relationship lines in a gutter beside
the physical file tree make a selected item's connections easier to follow?
The adjacent context drawer remains the place to read exact endpoints, relationship
meaning and evidence. The overlay supplements that navigation.

## Interaction model

- The initial selection is the example framework's executable, with a mixture of
  incoming and outgoing relationships. The selected object keeps the same identity
  in the tree and context drawer.
- Incoming, Outgoing and Both filters limit the relationships in view. Per-relation
  line toggles control the overlay; up to six numbered lanes keep enabled lines
  distinguishable. One active relationship receives stronger emphasis.
- Lines run between visible representatives of their exact endpoints. When an
  endpoint is inside a collapsed branch, its nearest visible ancestor represents
  it. An aggregate marker means an endpoint is inside that branch; it does not
  assert a direct relationship with the directory.
- Previewing a relationship keeps the current selection. Reveal opens the endpoint
  ancestry paths so the connection can be located in the tree without following it.
  Follow navigates to the related object. Back restores the earlier navigation
  state rather than treating every reveal as a new selected object.
- Physical containment remains the tree hierarchy. Relationship lines express
  additional typed connections and their direction, not another containment tree.
- External and unresolved references remain explicit reference records. A displayed
  path or candidate does not manufacture an inspected filesystem target. Revealing
  a reference is separate from proving that its target exists or can be opened.

## Data and evidence limits

The tree, filenames, relationships and status labels are fixed illustrative data
created for the design conversation. They were not acquired by inspecting an
application, filesystem or running process. They are not a redistributable binary
fixture corpus or qualification evidence.

Keep these distinctions when evaluating the concept:

- A recorded dependency name is static evidence; it does not prove a library was
  loaded. A resolution candidate remains a candidate, not a proven target.
- Incoming counts cover the relationships represented by the example. They do not
  inventory consumers elsewhere on the system.
- A resource listed by a seal is different from an independently signed code object.
  Signature presence, decoded metadata, integrity, certificate trust and execution
  eligibility are separate questions.
- Entitlements and declared capabilities do not establish observed filesystem,
  network or IPC activity. Runtime claims would require separate observations.
- A collapsed representative is a navigation aid. Exact endpoint identity and
  relationship scope must remain available in the drawer.

## Scope

JavaScript in this prototype supplies presentation and UI interaction over the
fixed example: selection, expansion, filters, line geometry and navigation history.
There is no Rust analyzer, WIT/component integration, filesystem protocol, native
selection, binary interpretation, dependency resolver, signer or runtime tracing
backend. The saved page does not add sample acquisition or another runtime owner
to the Workbench application.

Any product implementation must receive domain facts and relationships from their
ordinary Rust owners and preserve the existing application runtime lifecycle. This
prototype neither defines that API nor qualifies native or browser processing.

## What to evaluate

Try multiple incoming relations, multiple outgoing relations and their mixture;
collapse one endpoint's ancestry; then compare Reveal, Follow and Back. Check
whether numbered lanes help match tree locations to drawer entries, whether
aggregate endpoints remain understandable and whether the overlay adds enough
orientation to justify its layout and scrolling complexity.

For large, filtered or virtualized trees, hidden and off-screen endpoints need
explicit behavior. This small example does not establish performance or usability
at that scale. The overlay can remain a bounded optional aid if the drawer and
ordinary tree navigation handle the larger case better.
