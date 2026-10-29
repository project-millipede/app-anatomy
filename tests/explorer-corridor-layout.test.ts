import { expect, test } from 'vitest';
import { getCorridorPage } from '../apps/web/features/explorer/corridorLayout';

const links = Array.from({ length: 8 }, (_, index) => ({
  relationshipId: `relationship-${index}`,
}));

test('corridors bound visible cards while retaining evidence order and truthful ranges', () => {
  const middle = getCorridorPage(links, 1, null);
  expect(middle.items.map((link) => link.relationshipId)).toEqual([
    'relationship-3',
    'relationship-4',
    'relationship-5',
  ]);
  expect(middle.items[0]).toBe(links[3]);
  expect(middle).toMatchObject({
    page: 1,
    pageCount: 3,
    start: 4,
    end: 6,
    total: 8,
  });

  const last = getCorridorPage(links, 2, null);
  expect(last.items.map((link) => link.relationshipId)).toEqual([
    'relationship-6',
    'relationship-7',
  ]);
  expect(last).toMatchObject({ start: 7, end: 8, total: 8 });
});

test('shrinking or empty corridors clamp stale page requests without phantom cards', () => {
  const smaller = getCorridorPage(links.slice(0, 4), 2, null);
  expect(smaller.items.map((link) => link.relationshipId)).toEqual([
    'relationship-3',
  ]);
  expect(smaller).toMatchObject({
    page: 1,
    pageCount: 2,
    start: 4,
    end: 4,
    total: 4,
  });
  expect(getCorridorPage([], smaller.page, null)).toEqual({
    items: [],
    slots: [undefined, undefined, undefined],
    page: 0,
    pageCount: 1,
    start: 0,
    end: 0,
    total: 0,
  });
  expect(getCorridorPage(links, -1, null).page).toBe(0);
});

test('a lone fourth relationship stays centered on its page when its preview is restored', () => {
  const fourLinks = links.slice(0, 4);
  const secondPage = getCorridorPage(fourLinks, 1, null);
  expect(secondPage.slots).toEqual([undefined, links[3], undefined]);
  expect(secondPage.items).toEqual([links[3]]);

  const restored = getCorridorPage(fourLinks, 0, 'relationship-3');
  expect(restored.page).toBe(1);
  expect(restored.slots).toEqual([undefined, links[3], undefined]);
  expect(restored).toMatchObject({ start: 4, end: 4, total: 4 });

  const changedContext = getCorridorPage(links, 1, 'previous-context-relation');
  expect(changedContext.page).toBe(1);
  expect(changedContext.items.map((link) => link.relationshipId)).toEqual([
    'relationship-3',
    'relationship-4',
    'relationship-5',
  ]);
});

test('visible card counts center singles and fill ordered slots for pairs and triples', () => {
  expect(getCorridorPage(links.slice(0, 1), 0, null).slots).toEqual([
    undefined,
    links[0],
    undefined,
  ]);
  expect(getCorridorPage(links.slice(0, 2), 0, null).slots).toEqual([
    links[0],
    links[1],
    undefined,
  ]);
  expect(getCorridorPage(links.slice(0, 3), 0, null).slots).toEqual([
    links[0],
    links[1],
    links[2],
  ]);
});
