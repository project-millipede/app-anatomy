# Separated bridge workspace

**Status: saved design candidate, 2026-10-21. This is an illustrative interaction
prototype, not a selected application implementation.**

Open [index.html](index.html) directly in a browser. It is the complete, editable
standalone source, with inline CSS, presentation JavaScript and fixed example
records. No application build, development server, native service, external asset
or network connection is required. There is no separate fragment or export step.

This candidate is saved beside the initial
[mixed relation overlay](../mixed-relation-overlay/README.md). It preserves the
four-bridge design and the vertical connection inspector at the far right.

## Design question

Can a separate relationship canvas explain a selected file's connections more
clearly than drawing them alongside the physical tree?

The workspace separates three responsibilities:

- **Left: physical tree.** Locate and select files through containment.
- **Center: relationship canvas.** Keep the selected file at the center of four
  bridges, independently of tree expansion and scrolling.
- **Far right: vertical inspector.** Read the active relationship's original
  evidence, resolution context, endpoint status and limitations.

## Four bridges

The horizontal axis represents resources within the outer **Atlas.app** inventory,
including nested frameworks, helper applications and service bundles. The vertical
axis represents external/system references and references whose target or
containment remains unknown.

| Bridge                               | Direction                     | Contents                                                                                 |
| ------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------- |
| West — bundle ingress                | Internal resource → selection | Files or records within Atlas.app that refer to the selected file.                       |
| East — bundle egress                 | Selection → internal resource | Internal targets or explicitly labelled candidates referenced by the selected file.      |
| North — external ingress             | External source → selection   | Incoming external associations when represented by evidence. This example supplies none. |
| South — external / unresolved egress | Selection → reference         | System library names, external paths and unresolved references.                          |

The example starts with the `Example.framework/Versions/A/Example` executable:

- West contains Render Helper's candidate dependency and the framework executable
  alias. The alias and its target remain distinct filesystem entries.
- East contains `libTelemetry.dylib`, framework `Resources/Info.plist` and the
  application's `Settings.plist`, retaining their different evidence types.
- South contains `/usr/lib/libSystem.B.dylib` and unresolved `@rpath/Optional.dylib`.
- North has an explicit empty state. This does not claim that external consumers
  do not exist.

Classify an association by the represented endpoint, not by the spelling of its
reference. `@rpath/libTelemetry.dylib` has an internal candidate in the example and
therefore appears east; its raw load name and runpath context remain in the
inspector. Unresolved `@rpath/Optional.dylib` stays south with containment unknown.
An absolute `/Original/…` reference also stays south even when the inspector shows
a separate proposed replacement within the bundle. A staging suggestion is not a
resolved internal dependency.

The outer inventory scope remains fixed while selecting nested resources.
Labels distinguish resources inside Example.framework from resources elsewhere
inside Atlas.app without changing their axis.

## Inspector and navigation

The inspector is explanatory UI, **not a graph node**. No arrow connects to it.
Previewing an incoming relationship does not create a second graph instance of
the already selected target or draw an arrow back to itself. Alias labels
distinguish entries that share the selected executable's basename.

- Select a tree entry to recenter the canvas on that exact resource.
- Select a relationship to preview its evidence while retaining the center file.
- **Reveal source/target** expands and marks the other endpoint in the tree without
  changing the selected file.
- **Focus source/target** selects the other endpoint. **Back** restores the previous
  selection, relationship preview, architecture and tree expansion.
- External and unresolved records have no fabricated file endpoint or navigation
  action. Planning suggestions retain an explicit suggested-file label.
- The architecture control switches fixed example records. It does not run
  analysis. Folder selections show direct associations, not an aggregation of all
  contained files' dependencies.

Exploration state is held in memory; refreshing the page restores its initial
example selection. The saved artifact preserves the design and interactions.

On desktop, the inspector is a separate right-hand column with vertically stacked
sections, sticky positioning and independent scrolling when needed. On narrow
screens it follows the canvas; the canvas can scroll horizontally to preserve
the four directions. Narrow-screen usability remains exploratory.

## Comparison with the earlier concepts

The [mixed relation overlay](../mixed-relation-overlay/README.md) places connections
beside the physical tree, using visible ancestor representatives when branches
collapse. This candidate uses independent resource cards, so tree collapse does
not change the diagram's endpoints or geometry.

## Evidence and implementation limits

All files, relationships, paths and status labels are authored illustrative data.
They were not acquired by inspecting an application or running process. Candidate
dependencies, aliases, resource strings, metadata and service-name matches retain
their own evidence labels. A candidate does not prove loader selection; a string
does not prove access; a service-name match does not prove IPC. Signature integrity,
certificate trust and execution eligibility are outside this study.

JavaScript controls presentation only: selection, expansion, record visibility,
navigation history and connector geometry. There is no binary parser, dependency
resolver, filesystem protocol, React presentation, WIT/component runtime, Wasm
integration or service acquisition. This candidate does not change the application.

Any implementation must obtain domain facts from their ordinary Rust owners under
`crates/binary/inspection` and preserve the application's existing runtime and
filesystem boundaries. The repository's implemented analysis remains bounded
header inspection; the prototype does not establish support for bundle graphs or
dependency resolution.

## Validation and further evaluation

Desktop browser checks covered bridge classification, absence of self-loop and
inspector arrows, preview/reveal/focus, Back, tree collapse, architecture switching
and updates to the right-hand inspector. Script syntax, local links, unique HTML
IDs and formatting were also checked. These checks do not qualify a real analyzer,
native or browser adapter, mobile workflow, or a large relationship inventory.

Evaluate dense neighborhoods, long paths, ambiguous candidates and the amount of
horizontal space consumed by the tree and inspector before selecting an
application implementation.

Related contracts: [application relocation](../../../../rebuilding/application-relocation-and-signing.md),
[Rust analysis scope](../../../../architecture/rust-analysis-core.md) and
[system overview](../../../../architecture/system-overview.md).
