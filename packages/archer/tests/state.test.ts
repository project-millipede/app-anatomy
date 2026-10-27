import { describe, expect, it } from 'vitest';
import { createStore } from 'jotai/vanilla';
import {
  ingestEdgesAtom,
  removeSourceEdgesAtom,
  resetArcherActionAtom,
} from '../src/features/core/actions';
import { edgeFamily, pairKeyRegistryAtom } from '../src/features/core/states';
import { makePairKey } from '../src/utils/pair';
import type { SourceToTargetType } from '../src/types-private';

describe('Archer surface edges', () => {
  it('removes exactly the declared source when opaque endpoint IDs contain separators', () => {
    const store = createStore();
    const first: SourceToTargetType = {
      source: { id: 'a-file', anchor: 'right' },
      target: { id: 'z-target', anchor: 'left' },
    };
    const second: SourceToTargetType = {
      source: { id: 'a', anchor: 'bottom' },
      target: { id: 'file-z-target', anchor: 'top' },
    };
    store.set(ingestEdgesAtom, [first, second]);
    expect(store.get(pairKeyRegistryAtom).size).toBe(2);

    store.set(removeSourceEdgesAtom, first.source.id);
    expect([...store.get(pairKeyRegistryAtom)]).toEqual([
      makePairKey(second.source.id, second.target.id),
    ]);
    expect(
      store.get(edgeFamily(makePairKey(first.source.id, first.target.id))),
    ).toBeNull();
    expect(
      store.get(edgeFamily(makePairKey(second.source.id, second.target.id)))
        ?.source,
    ).toEqual(second.source);
  });

  it('keeps another surface intact when one surface resets identical endpoint IDs', () => {
    const firstSurface = createStore();
    const secondSurface = createStore();
    const edge: SourceToTargetType = {
      source: { id: 'selected-resource', anchor: 'right' },
      target: { id: 'relation-card', anchor: 'left' },
    };
    firstSurface.set(ingestEdgesAtom, [edge]);
    secondSurface.set(ingestEdgesAtom, [edge]);

    firstSurface.set(resetArcherActionAtom);
    expect(firstSurface.get(pairKeyRegistryAtom).size).toBe(0);
    expect(secondSurface.get(pairKeyRegistryAtom).size).toBe(1);
    expect(
      secondSurface.get(edgeFamily(makePairKey(edge.source.id, edge.target.id)))
        ?.source,
    ).toEqual(edge.source);
  });
});
