/**
 * Archer extension seams — consumer-implemented contracts + their injection
 * atoms. Each seam is a self-contained slice (`<seam>/types.ts` + `<seam>/state.ts`).
 * Depends on core (`../types`); core never depends back on this.
 */
export type { RoutingResolver } from './routing/types';
export { routingResolverAtom } from './routing/state';

export type { EdgeDecoration, EdgeDecorator } from './decoration/types';
export { edgeDecoratorAtom } from './decoration/state';
