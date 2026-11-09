import { expect, test } from 'vitest';
import { arrangeCorridorSlots } from '../apps/web/features/explorer/layout/corridorSlots';

/** Empty outer slots reserve the positions surrounding a single connection. */
test('places a single connection in the middle slot and leaves both outer slots empty', () => {
  const singleConnection = {
    relationshipId: 'single-relationship',
    endpointIds: [],
  };

  const slots = arrangeCorridorSlots([singleConnection]);

  expect(slots).toEqual([undefined, singleConnection, undefined]);
});
