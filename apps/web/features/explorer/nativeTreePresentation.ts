import type { SelectionState } from '@apple-code/browser/native';
import type { PreviewNode } from './previewInventory';

/** Opaque native identities plus UI-only branch state; no paths are reconstructed. */
export interface NativeTreeNode extends PreviewNode {
  children?: NativeTreeNode[];
  parentDirectory?: string;
  entryId?: number;
  childrenLoaded?: boolean;
  childrenCount?: number;
}

export function nativeEntryRowId(directory: string, entryId: number): string {
  return JSON.stringify(['native-entry', directory, entryId]);
}

/** Match only Rust's selected file association, never a display name. */
export function nativeSelectedRowId(
  state: SelectionState | null,
): string | undefined {
  if (!state?.file) return undefined;
  return state.fileEntry
    ? nativeEntryRowId(state.fileEntry.directory, state.fileEntry.entryId)
    : JSON.stringify(['native-file', state.file.resource]);
}

/** Project only Rust-retained directory snapshots into the physical navigation tree. */
export function nativeTreePresentation(state: SelectionState | null): {
  rootNode: NativeTreeNode;
  selectedId: string | undefined;
  mountId: string;
} {
  const childListings = new Map(
    (state?.directories ?? [])
      .filter((listing) => listing.parent !== undefined)
      .map((listing) => [
        nativeEntryRowId(listing.parent!.directory, listing.parent!.entryId),
        listing,
      ]),
  );
  const rootListing = state?.directories.find(
    (listing) => listing.directory.resource === state.root?.resource,
  );

  function children(
    listing: SelectionState['directories'][number],
  ): NativeTreeNode[] {
    return listing.entries.map((entry) => {
      const id = nativeEntryRowId(listing.directory.resource, entry.id);
      const childListing = childListings.get(id);
      return {
        id,
        name: entry.name,
        kind: entry.kind,
        parentDirectory: listing.directory.resource,
        entryId: entry.id,
        ...(entry.kind === 'directory'
          ? {
              children: childListing ? children(childListing) : [],
              childrenLoaded: childListing !== undefined,
              // Ark uses a non-null count to recognize an unloaded/empty branch.
              childrenCount: childListing?.entries.length ?? 0,
            }
          : {}),
      };
    });
  }

  const nodes: NativeTreeNode[] = state?.root
    ? [
        {
          id: JSON.stringify(['native-root', state.root.resource]),
          name: state.root.name,
          kind: 'directory',
          children: rootListing ? children(rootListing) : [],
          childrenLoaded: rootListing !== undefined,
          childrenCount: rootListing?.entries.length ?? 0,
        },
      ]
    : [];
  const standaloneId = state?.file
    ? JSON.stringify(['native-file', state.file.resource])
    : undefined;
  if (state?.file && !state.fileEntry) {
    nodes.push({ id: standaloneId!, name: state.file.name, kind: 'file' });
  }
  return {
    rootNode: { id: 'native-tree-root', name: '', children: nodes },
    selectedId: nativeSelectedRowId(state),
    mountId: state?.root?.resource ?? state?.file?.resource ?? 'native-empty',
  };
}
