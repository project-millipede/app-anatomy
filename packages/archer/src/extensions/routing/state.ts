import { atom } from 'jotai';

import type { RoutingResolver } from './types';

/**
 * Primitive Atom: Shared Routing Resolver
 *
 * Holds the shared {@link RoutingResolver}. Routing is still decided
 * independently for each edge. With a metadata-driven resolver:
 *
 * 1. If a relation declares recognized routing `meta` (for example,
 *    `{ straight: true }`), the resolver decides that edge by returning
 *    `STRAIGHT_LINE`.
 * 2. If a relation does not declare recognized routing `meta`, the resolver
 *    returns `null`, and Archer's built-in ("smart") router decides that edge.
 *
 * `null` means no shared resolver is installed, so built-in routing decides
 * every edge.
 */
export const routingResolverAtom = atom<RoutingResolver | null>(null);
