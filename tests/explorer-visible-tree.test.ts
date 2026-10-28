import { expect, test, vi } from 'vitest';
import {
  previewInventory,
  type PreviewNode,
} from '../apps/web/features/explorer/previewInventory';
import {
  createVisibleTreeIndex,
  groupMountedTreeRows,
} from '../apps/web/features/explorer/capabilities/tree-virtualization/visibleTree';

type Node = PreviewNode;
type ExpandedNode = { node: Node; indexPath: number[] };

function node(id: string, children?: Node[]): Node {
  return { id, name: id, children };
}

const app = node('app', [
  node('a', [node('a1'), node('a2')]),
  node('b', [node('b-branch', [node('b1'), node('b2')])]),
  node('closed', [node('hidden')]),
  node('last'),
]);
const collection = previewInventory.copy(node('root', [app]));
// Ark's expanded sequence excludes the child of the closed branch. The index
// receives this sequence; it does not repeat Ark's expansion/filtering policy.
const visibleNodes: ExpandedNode[] = [
  [0],
  [0, 0],
  [0, 0, 0],
  [0, 0, 1],
  [0, 1],
  [0, 1, 0],
  [0, 1, 0, 0],
  [0, 1, 0, 1],
  [0, 2],
  [0, 3],
].map((indexPath) => ({ node: collection.at(indexPath)!, indexPath }));

test('expanded intervals reserve subtree height and keep complete sibling counts', () => {
  const index = createVisibleTreeIndex(collection, visibleNodes);

  expect(
    index.rows.map((row) => [
      row.value,
      row.parentRowIndex,
      row.subtreeEndIndex,
      row.siblingCount,
    ]),
  ).toEqual([
    ['app', null, 10, 1],
    ['a', 0, 4, 4],
    ['a1', 1, 3, 2],
    ['a2', 1, 4, 2],
    ['b', 0, 8, 4],
    ['b-branch', 4, 8, 1],
    ['b1', 5, 7, 2],
    ['b2', 5, 8, 2],
    ['closed', 0, 9, 4],
    ['last', 0, 10, 4],
  ]);
  expect(index.indexByValue.get('b2')).toBe(7);
  expect(index.indexByValue.has('hidden')).toBe(false);
  expect(index.rows[4]!.subtreeEndIndex - index.rows[4]!.rowIndex - 1).toBe(3);
  expect(index.rows[8]!.subtreeEndIndex - index.rows[8]!.rowIndex - 1).toBe(0);
});

test('disjoint windows retain shared ancestors once and order real child groups', () => {
  const index = createVisibleTreeIndex(collection, visibleNodes);
  const groups = groupMountedTreeRows(index, [7, 2, 7, -1, 10, 1.5, NaN]);

  expect(
    [...groups].map(([parent, rows]) => [parent, rows.map((row) => row.value)]),
  ).toEqual([
    [null, ['app']],
    [0, ['a', 'b']],
    [1, ['a1']],
    [4, ['b-branch']],
    [5, ['b2']],
  ]);
  // B stays at expanded row 4 despite omitting A's later child; b2 remains one
  // row below b1's original position inside its real parent, rather than moving.
  expect((index.rows[4]!.rowIndex - index.rows[0]!.rowIndex - 1) * 32).toBe(96);
  expect((index.rows[7]!.rowIndex - index.rows[5]!.rowIndex - 1) * 32).toBe(32);
});

test('a wide branch retains only requested rows and reads each sibling list once', () => {
  const leaves = Array.from({ length: 10_000 }, (_, leaf) =>
    node(`leaf-${leaf}`),
  );
  const branch = node('wide', leaves);
  const wide = previewInventory.copy(node('root', [branch]));
  const getNodeChildren = vi.spyOn(wide, 'getNodeChildren');
  const expanded: ExpandedNode[] = [
    { node: branch, indexPath: [0] },
    ...leaves.map((node, leaf) => ({ node, indexPath: [0, leaf] })),
  ];
  const index = createVisibleTreeIndex(wide, expanded);
  const groups = groupMountedTreeRows(index, [
    ...Array.from({ length: 10 }, (_, row) => row + 5_001),
    9_999,
  ]);

  expect(getNodeChildren).toHaveBeenCalledTimes(2);
  expect(
    [...groups.values()].reduce((count, rows) => count + rows.length, 0),
  ).toBe(12);
  expect(groups.get(0)?.map((row) => row.value)).toEqual([
    ...Array.from({ length: 10 }, (_, leaf) => `leaf-${leaf + 5_000}`),
    'leaf-9998',
  ]);
  expect(index.rows[5_001]!.siblingCount).toBe(10_000);
  expect(index.rows[0]!.subtreeEndIndex).toBe(10_001);
  expect((index.rows[5_001]!.rowIndex - 1) * 32).toBe(160_000);
});

test('a deep target retains its complete ancestor chain without unrelated rows', () => {
  const depth = 256;
  const nodes = Array.from({ length: depth }, (_, level) =>
    node(`level-${level}`),
  );
  for (let level = 0; level < depth - 1; level++) {
    nodes[level]!.children = [nodes[level + 1]!];
  }
  const deep = previewInventory.copy(
    node('root', [nodes[0]!, node('unrelated')]),
  );
  const expanded: ExpandedNode[] = [
    ...nodes.map((node, level) => ({
      node,
      indexPath: Array<number>(level + 1).fill(0),
    })),
    { node: deep.at([1])!, indexPath: [1] },
  ];

  const index = createVisibleTreeIndex(deep, expanded);
  const groups = groupMountedTreeRows(index, [depth - 1]);

  expect([...groups.values()].flat().map((row) => row.value)).toEqual(
    nodes.map((node) => node.id),
  );
  expect(
    index.rows.slice(0, depth).every((row) => row.subtreeEndIndex === depth),
  ).toBe(true);
  expect(groups.get(null)?.map((row) => row.value)).toEqual(['level-0']);
  expect(index.rows[0]!.siblingCount).toBe(2);
});

test('an empty expanded sequence has no mountable group or reserved subtree', () => {
  const index = createVisibleTreeIndex(collection, []);

  expect(index.rows.length).toBe(0);
  expect(groupMountedTreeRows(index, [0, 1]).size).toBe(0);
});
