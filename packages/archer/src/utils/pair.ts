/** Canonical unordered endpoint key without separator collisions in opaque IDs. */
export function makePairKey(idA: string, idB: string): string {
  return JSON.stringify(idA < idB ? [idA, idB] : [idB, idA]);
}
