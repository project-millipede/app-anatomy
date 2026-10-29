import { expect, test } from 'vitest';
import type { SelectionState } from '../packages/apple-code-browser/src/native';
import {
  nativeEntryRowId,
  nativeTreePresentation,
} from '../apps/web/features/explorer/nativeTreePresentation';

function mounted(): SelectionState {
  return {
    scope: 'application',
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

test('generic directories and legacy roots never become application scope by name', () => {
  for (const scope of ['directory', 'file', undefined] as const) {
    const state = {
      ...mounted(),
      scope,
      root: { resource: 'root', name: 'LooksLike.app' },
    };
    const view = nativeTreePresentation(state);
    expect(view.rootNode.children).toEqual([]);
    expect(view.selectedId).toBeUndefined();
    expect(view.mountId).toBe('native-empty');
  }
});

test('application contents retain resource, helper, framework and unsupported entry rows without filtering', () => {
  const state = mounted();
  const root = state.directories.find((listing) => !listing.parent)!;
  root.entries = [
    { id: 0, name: 'Contents', kind: 'directory' },
    { id: 1, name: 'Info.plist', kind: 'file' },
    { id: 2, name: 'Render Helper', kind: 'file' },
    { id: 3, name: 'Example.framework', kind: 'directory' },
    { id: 4, name: 'Current', kind: 'symlink' },
    { id: 5, name: '.metadata', kind: 'other' },
  ];
  const rows = nativeTreePresentation(state).rootNode.children![0]!.children!;
  expect(rows.map(({ name, kind }) => ({ name, kind }))).toEqual(
    root.entries.map(({ name, kind }) => ({ name, kind })),
  );
});

test('opening a standalone binary replaces application navigation with only that binary', () => {
  const application = nativeTreePresentation(mounted());
  const binary = nativeTreePresentation({
    scope: 'binary',
    file: { resource: 'standalone-binary', name: 'Tool' },
    entries: [],
    directories: [],
  });
  expect(binary.rootNode.children).toHaveLength(1);
  expect(binary.rootNode.children![0]!.name).toBe('Tool');
  expect(binary.selectedId).toBe(binary.rootNode.children![0]!.id);
  expect(binary.mountId).not.toBe(application.mountId);
  expect(binary.rootNode.children![0]!.children).toBeUndefined();
});

test('an application root remains the center selection until an internal file is chosen', () => {
  const state = { ...mounted(), file: undefined, fileEntry: undefined };
  const view = nativeTreePresentation(state);
  expect(view.selectedId).toBe(view.rootNode.children![0]!.id);
  expect(view.rootNode.children![0]!.children).toHaveLength(3);
});
