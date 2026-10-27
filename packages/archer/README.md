# Archer drawing package

This workspace package reuses the active renderer and geometry implementation
from Millipede's `packages/app/archer` (`@app/archer` 0.3.0), together with its
required ref-coordination, broadcasting, resize and cache helpers. The Millipede
reference checkout is read-only; all integration changes live here. Scratch files
and uncalled historical routing variants are excluded.

## Base use

```tsx
import { Archer } from '@apple-code/archer';

const { ArcherSurface, ArcherElement } = Archer;

<ArcherSurface svgElementProps={{ 'aria-hidden': true }}>
  <div className="your-css-grid">
    <ArcherElement
      id="source-resource"
      relations={[
        {
          targetId: 'target-resource',
          sourceAnchor: 'right',
          targetAnchor: 'left',
          layout: 'default',
          pathStyle: 'smooth',
        },
      ]}
    >
      <div>Source placeholder</div>
    </ArcherElement>
    <ArcherElement id="target-resource">
      <div>Target placeholder</div>
    </ArcherElement>
  </div>
</ArcherSurface>;
```

Each endpoint must render a single element accepting the supplied DOM ref.
Consumers own layout and choose endpoint IDs, anchors and appearance. Arrow
styles accept CSS colors, including scoped custom properties. `layout: 'default'`
uses the original simple routing path; `pathStyle` exposes the existing sharp,
smooth and sharp-animatable builders. Default routing remains sharp.

`ArcherSurface` creates a private Jotai store for rendering edges and refs.
Unmounting one surface cannot reset another surface's arrows. Application state,
native selection and component runtime lifetime do not belong in this store.

## Integration changes

- Replaced monorepo barrels and custom Jotai-internal subscriptions with the
  necessary original helper subset and Jotai's public subscription API.
- Encapsulated the rendering store per surface, forwarded surface/SVG style
  properties and isolated marker IDs across simultaneous surfaces.
- Encoded unordered endpoint pairs structurally and removed edges by their actual
  source ID, so opaque IDs containing separators remain safe.
- Applied configured stroke widths and removed the demonstration label-click
  mutation and rendering diagnostics.
- Exposed the original smooth path builder through `Relation.pathStyle`.
- Synchronized each arrow after content changes, endpoint/surface resize and
  scrolling using DOM observers and one scheduled animation frame. Observing
  content rather than the SVG prevents drawing updates from observing themselves.
  Endpoint animation notifications and explicit sync broadcast to every attached
  arrow. Observers and scheduled frames are removed on unmount.
- Cleared paths when endpoints disappear or have no rendered client rectangle.
- Corrected strict TypeScript contracts and excluded uncalled historical routing
  experiments without replacing the active drawing engine.

## Boundaries and qualification

Archer is browser presentation code. DOM measurement, ResizeObserver,
MutationObserver, SVG, portals and requestAnimationFrame are required to draw
connections between rendered elements. There are no binary-analysis,
filesystem-client, native-service, WIT or Wasm-runtime dependencies.

One rendered edge represents an unordered pair of visual endpoint IDs; reciprocal
relations share a double-headed edge. Give distinct evidence cards distinct
visual endpoint IDs when several relations refer to the same domain resource.

Automated tests cover opaque-ID edge removal, store isolation and base path
geometry. The Explorer integration qualifies its small four-bridge layout in a
browser. Dense inventories, virtualization, transformed SVG anchors, advanced
smart routing and the optional animation/extension seams need separate
qualification before relying on them in a new application scenario.

```sh
pnpm --filter @apple-code/archer typecheck
pnpm exec vitest run packages/archer/tests
```
