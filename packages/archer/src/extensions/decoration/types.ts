import type { ReactNode, RefObject } from 'react';

/**
 * An injected, OPTIONAL edge decorator — the visual sibling of
 * {@link RoutingResolver}.
 *
 * Same contract: Archer owns MECHANISM (it computes the path), the consumer owns
 * POLICY / VOCABULARY (what rides it). Archer hands over the already-computed
 * edge path `d` + the opaque `meta`; the consumer returns SVG drawn in the SAME
 * layer as the arrow, so it follows every re-route (converge, resize, viewBox
 * scale) for free. Archer core never learns the words "packet" or "flow" — just
 * as it never learned "straight".
 *
 * @param decoration         The edge being drawn.
 * @param decoration.path    The path `d` SNAPSHOT at React render time. Good for
 *                           keys/fallback, but it is STALE during the converge
 *                           animation (Archer updates the path imperatively and
 *                           does not re-render). For anything that must track the
 *                           live geometry every frame, use `pathRef` instead.
 * @param decoration.pathRef The LIVE arrow `<path>` element. Archer keeps its `d`
 *                           current imperatively each frame, so reading it (e.g.
 *                           `getPointAtLength`) follows the converge with no lag.
 * @param decoration.meta    The relation's opaque {@link Relation.meta}, verbatim.
 * @returns SVG nodes to render in the arrow's draw context, or `null` to decline.
 */
export type EdgeDecoration = {
  path: string;
  pathRef: RefObject<SVGPathElement | null>;
  meta?: unknown;
  sourceId: string;
  targetId: string;
};

export type EdgeDecorator = (decoration: EdgeDecoration) => ReactNode;
