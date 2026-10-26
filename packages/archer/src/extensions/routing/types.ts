import type { Relation, RoutingInstruction } from '../../types';

/**
 * Injected routing policy.
 *
 * A consumer supplies one resolver that decides, per edge, how it should be
 * routed — overriding Archer's built-in ("smart") router. This is the single
 * extension point for consumer routing intent; Archer core does not interpret
 * that intent.
 *
 * The resolver is mount-stable: install one for the owning application
 * lifetime before its first arrow calculation. Its identity is not a live
 * routing-update signal. The returned instruction participates in the final
 * `layoutInstruction` cache; forced measurements may invoke the resolver again,
 * so it must remain pure.
 *
 * @param edge          Minimal, opaque description of the edge being drawn.
 * @param edge.sourceId Source anchor id (e.g. `'clientX-g1-anchor-right'`).
 * @param edge.targetId Target anchor id.
 * @param edge.meta     The relation's opaque {@link Relation.meta}, forwarded
 *                      unchanged. Archer does not interpret it.
 * @returns A {@link RoutingInstruction} to force a specific path for this edge,
 *          or `null` to decline. `null` is the "no opinion" signal: Archer then
 *          falls through to its default smart router (and finally `NO_LOOP`),
 *          leaving stock behaviour unchanged.
 */
export type RoutingResolver = (edge: {
  sourceId: string;
  targetId: string;
  meta?: unknown;
}) => RoutingInstruction | null;
