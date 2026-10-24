# Base UI and Ark UI with Panda CSS: implementation comparison

**Status: both views are implemented; evaluation criteria do not imply that
every accessibility or maintenance check has been completed.** The
[system overview](system-overview.md#application-ownership) owns runtime and model lifetime.

The workbench keeps Base UI available while evaluating Ark UI with Panda CSS. The comparison is an implementation experiment, not a decision to migrate the application.

## Views

| URL              | View                                      |
| ---------------- | ----------------------------------------- |
| `/`              | Base UI with the existing CSS Modules     |
| `/?view=ark`     | Ark UI with Panda component recipes       |
| `/?view=compare` | Both implementations alongside each other |

Start the native service with `cargo run --locked -p filesystem-service` and the web app separately with `pnpm dev`, then select an input in either implementation. In comparison mode, both panes display one shared model: observed selection, current report, pending state, errors and architecture tab. A selection or inspection initiated in either pane updates both. Switching views preserves that model and its runtime; a full page refresh creates a new owner and queries native selection. The [system overview](system-overview.md#application-ownership) defines page composition and result retention. A narrow screen stacks the comparison views vertically. A failed state query shows uncertainty; selection controls remain available for another user-requested attempt.

## What we maintain

Both Base UI and Ark UI supply interaction primitives that need application styling. Neither choice removes the work of designing tree rows, status badges, evidence panels or the overall workbench layout.

| Concern                  | Base UI view              | Ark + Panda view                                             |
| ------------------------ | ------------------------- | ------------------------------------------------------------ |
| Interactive components   | Base UI primitives        | Ark UI primitives                                            |
| Shared component styling | CSS Module classes        | Panda recipes and generated classes                          |
| Feature layout           | CSS Modules               | CSS Modules                                                  |
| Design values            | Existing CSS variables    | Scoped Panda tokens matching the existing palette            |
| Styling build work       | Next.js processes the CSS | Panda configuration, code generation and PostCSS integration |
| Future visual changes    | Edit the owned CSS        | Edit the owned tokens, recipes and layout CSS                |

The Panda setup disables preflight and explicitly includes `@pandacss/preset-base` for utility and token mappings, which Panda v2 no longer adds automatically. It introduces no ready-made component theme or global reset. We own the recipes and choose which styles to encode in them. The experiment currently covers a small set of controls; a production tree or complex list would need its own visual design and recipe work.

Panda is separate from Ark. We could retain Ark while styling it with ordinary CSS Modules if the recipe and code-generation workflow adds more maintenance than it saves. Park UI and Chakra UI are not part of this experiment.

## Separate presentations, shared application model

The component choice does not change binary interpretation or runtime ownership.
The page shell calls `useNativeSession` and `useWorkbenchModel` once, then passes
the model explicitly to either presentation or both. The workbench components
compose their controls and report without creating or disposing native bindings.

```text
Application owner → one runtime → jco → Rust component → native service
  └─ one workbench model
       ├─ Base UI presentation
       └─ Ark UI presentation

Native Rust consumer → Rust core
```

TypeScript handles presentation, interaction state and required environment bindings. Rust owns file requests, filesystem-message processing, classifications and evidence; the native service performs filesystem reads. The presentations retain their separate UI libraries and styling while sharing the application's operation results. They are part of one Next.js application and build. The UI comparison adds no certificate verification, bundle traversal, relocation or signing behavior.

## Review criteria

- Inspect once and compare the same report in both implementations, including long filenames and multiple architecture slices.
- Confirm that operations from either pane update both, including pending controls, selection, errors, report and architecture tab.
- Verify that switching views, including browser Back and Forward, retains the model without another initialization query, while refresh queries the retained native selection. Distinguish an unavailable service from a confirmed empty owner.
- Try keyboard tab navigation, focus visibility and architecture-tab activation in both implementations.
- Compare selected, disabled, loading and error states.
- Check wide and narrow layouts and both color schemes.
- Review the CSS Module and Panda recipe changes needed for one shared visual adjustment.

Similar screenshots alone do not establish accessibility or maintenance quality. Build and type checks cover integration; keyboard and assistive-technology evaluation remain separate checks.
