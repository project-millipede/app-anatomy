import { expect, test } from 'vitest';
import type { SelectionState } from '../packages/apple-code-browser/src/native';
import {
  nativeEntryRowId,
  nativeTreePresentation,
} from '../apps/web/features/explorer/nativeTreePresentation';

function mounted(): SelectionState {
  return {
    root: { resource: 'root', name: 'Application' },
    directory: { resource: 'root', name: 'Application' },
    file: { resource: 'opened-right-file', name: 'same' },
    fileEntry: { directory: 'right', entryId: 0 },
    entries: [
      { id: 0, name: 'same', kind: 'directory' },
      { id: 1, name: 'same', kind: 'directory' },
      { id: 2, name: 'Unloaded', kind: 'directory' },
    ],
    directories: [
      {
        directory: { resource: 'right', name: 'same' },
        parent: { directory: 'root', entryId: 1 },
        entries: [{ id: 0, name: 'same', kind: 'file' }],
      },
      {
        directory: { resource: 'root', name: 'Application' },
        entries: [
          { id: 0, name: 'same', kind: 'directory' },
          { id: 1, name: 'same', kind: 'directory' },
          { id: 2, name: 'Unloaded', kind: 'directory' },
        ],
      },
      {
        directory: { resource: 'left', name: 'same' },
        parent: { directory: 'root', entryId: 0 },
        entries: [{ id: 0, name: 'same', kind: 'file' }],
      },
    ],
  };
}

test('directory-scoped identities locate the selected file despite repeated names and entry ids', () => {
  const view = nativeTreePresentation(mounted());
  const mount = view.rootNode.children![0]!;
  const leftFile = mount.children![0]!.children![0]!;
  const rightFile = mount.children![1]!.children![0]!;
  expect(leftFile.name).toBe(rightFile.name);
  expect(leftFile.id).not.toBe(rightFile.id);
  expect(view.selectedId).toBe(rightFile.id);
  expect(rightFile.id).toBe(nativeEntryRowId('right', 0));
  expect(mount.children!.map((node) => node.name)).toEqual([
    'same',
    'same',
    'Unloaded',
  ]);
});

test('loading an empty directory preserves sibling identities and distinguishes it from an unloaded branch', () => {
  const state = mounted();
  const before = nativeTreePresentation(state);
  const beforeChildren = before.rootNode.children![0]!.children!;
  const unloaded = beforeChildren[2]!;
  expect(unloaded.childrenLoaded).toBe(false);
  expect(unloaded.children).toEqual([]);

  const after = nativeTreePresentation({
    ...state,
    directories: [
      ...state.directories,
      {
        directory: { resource: 'empty-child', name: 'Unloaded' },
        parent: { directory: 'root', entryId: 2 },
        entries: [],
      },
    ],
  });
  const afterChildren = after.rootNode.children![0]!.children!;
  expect(afterChildren.map((node) => node.id)).toEqual(
    beforeChildren.map((node) => node.id),
  );
  expect(afterChildren[2]!.childrenLoaded).toBe(true);
  expect(afterChildren[2]!.children).toEqual([]);
  expect(afterChildren[2]!.childrenCount).toBe(0);
  expect(after.mountId).toBe(before.mountId);
  expect(after.selectedId).toBe(before.selectedId);
});

test('file replacement changes the authoritative selection without changing the retained mount', () => {
  const state = mounted();
  const before = nativeTreePresentation(state);
  const after = nativeTreePresentation({
    ...state,
    file: { resource: 'opened-left-file', name: 'same' },
    fileEntry: { directory: 'left', entryId: 0 },
  });
  expect(after.mountId).toBe(before.mountId);
  expect(after.rootNode).toEqual(before.rootNode);
  expect(after.selectedId).toBe(nativeEntryRowId('left', 0));
  expect(after.selectedId).not.toBe(before.selectedId);
});

test('an acquired file without a Rust parent association is shown outside the mounted folder', () => {
  const state = { ...mounted(), fileEntry: undefined };
  const view = nativeTreePresentation(state);
  expect(view.rootNode.children).toHaveLength(2);
  const standalone = view.rootNode.children![1]!;
  expect(view.selectedId).toBe(standalone.id);
  expect(standalone.parentDirectory).toBeUndefined();
  expect(standalone.id).not.toBe(nativeEntryRowId('right', 0));
});
