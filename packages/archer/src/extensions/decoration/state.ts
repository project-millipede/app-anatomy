import { atom } from 'jotai';

import type { EdgeDecorator } from './types';

/**
 * Primitive Atom: Injected Edge Decorator
 *
 * Holds the active {@link EdgeDecorator} (flow/packets/pulses), if any. Injected
 * exactly like {@link routingResolverAtom} — a Jotai atom, written by the
 * consumer on mount, read by `SvgArrow` per edge. `null` ⇒ plain edges.
 */
export const edgeDecoratorAtom = atom<EdgeDecorator | null>(null);
