import type {
  TreeCollection,
  TreeNode,
  UseTreeViewReturn,
} from '@ark-ui/react/tree-view';

/** Ark's preorder entries after expansion has determined which nodes exist. */
type ExpandedTreeNode<T extends TreeNode> = ReturnType<
  UseTreeViewReturn<T>['getVisibleNodes']
>[number];

/** Ark's node and index path extended with coordinates for nested rendering. */
export type VisibleTreeRow<T extends TreeNode> = ExpandedTreeNode<T> & {
  /** Ark's unique node value, used for virtual item keys and value lookups. */
  value: string;
  /** Zero-based position in the complete expanded preorder, including offscreen rows. */
  rowIndex: number;
  /**
   * Zero-based index of the direct parent in rows. Null identifies a child
   * of the synthetic collection root, which has no rendered row.
   */
  parentRowIndex: number | null;
  /**
   * Exclusive end of this subtree in the expanded sequence. A leaf ends at
   * rowIndex + 1; descendants occupy the remaining rows before this end.
   */
  subtreeEndIndex: number;
  /** Full sibling-set size, including this node and unmounted siblings. */
  siblingCount: number;
};

/** Row coordinates and value lookup for one complete expanded sequence. */
export type VisibleTreeIndex<T extends TreeNode> = {
  /** Expanded nodes in preorder, including offscreen rows and excluding collapsed descendants. */
  rows: VisibleTreeRow<T>[];
  /** Maps Ark node values to their zero-based indexes in rows. */
  indexByValue: Map<string, number>;
};

/**
 * Indexes Ark's complete expanded sequence for nested viewport rendering.
 *
 * Pass the entire getVisibleNodes() result, including offscreen rows. Entries
 * must be in preorder, with nonempty index paths and ancestors before children;
 * the synthetic collection root is excluded. Collapsed descendants occupy no
 * rows. Each subtree occupies [rowIndex, subtreeEndIndex), so a branch's child
 * group reserves subtreeEndIndex - rowIndex - 1 row heights.
 *
 * One stack pass closes subtree intervals when the next sibling or ancestor's
 * sibling begins. Sibling counts are read once per parent from the complete
 * collection. Inputs are not modified. Building the index takes O(V) time and
 * storage for V expanded rows, plus O(depth) stack space. Cache the result until
 * the collection or expanded sequence changes; collection replacement must
 * invalidate it even when the node IDs and expanded IDs stay the same.
 *
 * @param collection - Ark's complete collection, supplying values and siblings.
 * @param visibleNodes - The complete expanded preorder returned by Ark.
 * @returns Row coordinates and an ID lookup shared by rendering and focus.
 */
export function createVisibleTreeIndex<T extends TreeNode>(
  collection: TreeCollection<T>,
  visibleNodes: readonly ExpandedTreeNode<T>[],
): VisibleTreeIndex<T> {
  const rows: VisibleTreeRow<T>[] = [];
  const indexByValue = new Map<string, number>();
  const ancestors: VisibleTreeRow<T>[] = [];
  const siblingCounts = new Map<T, number>();

  for (const [rowIndex, visibleNode] of visibleNodes.entries()) {
    let parentRow = ancestors.at(-1);
    while (
      parentRow &&
      parentRow.indexPath.length >= visibleNode.indexPath.length
    ) {
      parentRow.subtreeEndIndex = rowIndex;
      ancestors.pop();
      parentRow = ancestors.at(-1);
    }

    const parentNode = parentRow?.node ?? collection.rootNode;
    let siblingCount = siblingCounts.get(parentNode);
    if (siblingCount === undefined) {
      siblingCount = collection.getNodeChildren(parentNode).length;
      siblingCounts.set(parentNode, siblingCount);
    }
    const value = collection.getNodeValue(visibleNode.node);
    const row: VisibleTreeRow<T> = {
      ...visibleNode,
      value,
      rowIndex,
      parentRowIndex: parentRow?.rowIndex ?? null,
      subtreeEndIndex: visibleNodes.length,
      siblingCount,
    };
    rows.push(row);
    indexByValue.set(value, rowIndex);
    ancestors.push(row);
  }

  return { rows, indexByValue };
}

/**
 * Groups requested viewport/focus rows under their real retained ancestors.
 *
 * Ancestors remain mounted to preserve Ark's nested DOM. Each retained row is
 * included once and siblings stay in tree order, even for disjoint requests.
 * Groups contain rows only: the renderer positions them within the complete
 * reserved subtree extent instead of creating spacer rows or copying subtrees.
 * Invalid, fractional and out-of-range indexes are ignored.
 *
 * This visits requested ancestor chains and sorts only retained rows: for K
 * requests, depth D and R retained rows, O(K * D + R log R) time and O(R) storage.
 * It does not traverse the entire expanded sequence on each scroll update.
 *
 * @param index - The unchanged index for the current collection and expansion.
 * @param requestedIndexes - Virtual range, overscan and retained focus indexes.
 * @returns Retained direct children by parent row index; null is the root group.
 */
export function groupMountedTreeRows<T extends TreeNode>(
  index: VisibleTreeIndex<T>,
  requestedIndexes: readonly number[],
): Map<number | null, VisibleTreeRow<T>[]> {
  const retainedRows = new Map<number, VisibleTreeRow<T>>();
  for (const requestedIndex of requestedIndexes) {
    if (!Number.isInteger(requestedIndex)) continue;
    let row: VisibleTreeRow<T> | undefined = index.rows[requestedIndex];
    while (row && !retainedRows.has(row.rowIndex)) {
      retainedRows.set(row.rowIndex, row);
      row =
        row.parentRowIndex === null
          ? undefined
          : index.rows[row.parentRowIndex];
    }
  }

  const childrenByParent = new Map<number | null, VisibleTreeRow<T>[]>();
  for (const row of [...retainedRows.values()].sort(
    (left, right) => left.rowIndex - right.rowIndex,
  )) {
    const siblings = childrenByParent.get(row.parentRowIndex);
    if (siblings) siblings.push(row);
    else childrenByParent.set(row.parentRowIndex, [row]);
  }
  return childrenByParent;
}
