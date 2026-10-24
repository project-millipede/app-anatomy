# Application explorer prototypes

**Status: exploring. Saved candidates are documented below; no application implementation has been selected.**

These prototypes explore how a physical application tree and relationship views
can work together. The tree provides location and hierarchy; an overlay or separate
canvas shows connections involving the selected item, with evidence in an adjacent
inspector.

| Candidate                                                              | Question                                                                                                                                                                                   | Status                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| [Mixed relation overlay](mixed-relation-overlay/README.md)             | Can a few incoming and outgoing connections beside the tree improve orientation without overwhelming navigation?                                                                           | Exploring              |
| [Separated bridge workspace](separated-bridge-workspace/README.md)     | Can west/east bundle relationships and north/south external or unresolved references stay clear in a separate canvas with a vertical inspector at the far right?                           | Saved design candidate |
| [Linked tree bridge workspace](linked-tree-bridge-workspace/README.md) | Can automatic incoming/outgoing highlights connect the physical tree to the four-bridge canvas while keeping one selected file?                                                            | Exploratory copy       |
| [Boundary compass layer](boundary-compass-layer/README.md)             | Can north/south direction and an east/west Atlas.app boundary, in a layer kept fully apart from the tree, answer "does this stay inside the copy?" by position?                            | Exploring              |
| [Perimeter bridges](perimeter-bridges/README.md)                       | Can a switchable perimeter (nearest bundle or whole application) separate crossing from internal traffic, keep unknown containment apart and flag references that bypass a contained copy? | Exploring              |
| [Linked perimeter workspace](linked-perimeter-workspace/README.md)     | Does the linked tree layout become clearer with a switchable perimeter (Atlas.app or nearest bundle), bridge-named tree badges and a separate tray for unknown containment?                | Exploring              |

The saved candidates use illustrative data. They are design experiments, not
additional presentations connected to the current Workbench model, Rust analyzer,
component runtime or native filesystem service. Displayed bundle, dependency,
signing and resolution information does not establish implemented analysis support.

Open a candidate's README for its interaction model and viewing instructions.
Keep future alternatives in sibling directories, each with its own README and
prototype files. Compare candidates here before choosing an implementation; a
saved prototype does not make that choice.

Relevant product contracts remain in the [system overview](../../../architecture/system-overview.md),
[application relocation design](../../../rebuilding/application-relocation-and-signing.md)
and [filesystem requirements](../../../filesystem/requirements.md).
