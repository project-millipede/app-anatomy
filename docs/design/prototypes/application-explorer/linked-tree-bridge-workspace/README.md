# Linked tree bridge workspace

**Status: exploratory copy, 2026-10-21. The approved separated bridge workspace
remains unchanged.**

Open [index.html](index.html) directly in a browser. The standalone HTML contains
inline CSS, presentation JavaScript and fixed example records; no build, service
or external assets are required.

This sibling copies the [separated bridge workspace](../separated-bridge-workspace/README.md)
and adds automatic relationship highlighting in the physical tree. Its four
bridges and vertical inspector retain the original design and evidence limits.

## Tree follows the connections

One file remains selected at the center. Related resources receive secondary
highlights rather than becoming additional selections:

| Tree marking   | Meaning                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| Blue · SEL     | Selected file and center of the canvas.                                                 |
| Teal · IN      | Internal source referring to the selected file, matching the west bridge.               |
| Purple · OUT   | Internal target or candidate referenced by the selected file, matching the east bridge. |
| IN/OUT         | A resource appearing in both directions.                                                |
| Strong outline | Other endpoint of the connection currently previewed in the inspector.                  |
| Neutral +count | Related resources inside a collapsed branch; the branch itself is not an endpoint.      |

Selecting a file or changing the example architecture expands the ancestors of
its related internal resources. Previewing a connection reveals and scrolls to
its other endpoint in the tree while retaining the center file and keyboard
focus. Colors, badges and accessible names communicate the same roles.

Manual collapse stays respected until a selection, architecture change or
connection preview needs to reveal a resource. The canvas remains independent
of tree expansion. **Focus source/target** recenters the canvas; **Back** restores
the previous selection, preview, architecture, expansion and tree scroll.

Only represented internal endpoints receive automatic highlights. External and
unresolved references do not create tree entries. A proposed staging replacement
is not automatically marked as a resolved target. Aliases and their targets retain
separate file identities even when their names match.

## Scope and validation

This is a presentation experiment using authored data, not an analysis or
resolution implementation. The original prototype's [evidence and implementation
limits](../separated-bridge-workspace/README.md#evidence-and-implementation-limits)
apply. No React, Rust, Wasm, runtime or service code is changed.

Validation covers the initial role highlights, collapsed counts, automatic
preview reveal, external references, focus/Back and architecture changes in a
desktop browser, plus script syntax and local links. Dense inventories and
narrow-screen usability remain subjects for further design evaluation.
