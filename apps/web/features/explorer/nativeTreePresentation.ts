import type {
  DirectoryListing,
  SelectionState,
} from '@apple-code/browser/native';
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

/** Admit only Rust-confirmed Explorer acquisitions; generic workbench inputs stay separate. */
export function nativeExplorerSubject(state: SelectionState | null) {
  const application = state?.scope === 'application' ? state.root : undefined;
  return {
    application,
    file: application || state?.scope === 'binary' ? state?.file : undefined,
  };
}

/** Match only Rust's selected file association, never a display name. */
export function nativeSelectedRowId(
  state: SelectionState | null,
): string | undefined {
  const { application, file } = nativeExplorerSubject(state);
  if (application) {
    return file && state?.fileEntry
      ? nativeEntryRowId(state.fileEntry.directory, state.fileEntry.entryId)
      : file
        ? undefined
        : JSON.stringify(['native-root', application.resource]);
  }
  return file ? JSON.stringify(['native-file', file.resource]) : undefined;
}

/** Project only Rust-retained directory snapshots into the physical navigation tree. */
export function nativeTreePresentation(state: SelectionState | null): {
  rootNode: NativeTreeNode;
  selectedId: string | undefined;
} {
  if (state === null) {
    return {
      rootNode: { id: 'native-tree-root', name: '', children: [] },
      selectedId: undefined,
    };
  }

  const { application, file } = nativeExplorerSubject(state);
  const childListings = new Map<string, DirectoryListing>();
  for (const listing of state.directories) {
    const { parent } = listing;
    if (parent === undefined) continue;
    childListings.set(
      nativeEntryRowId(parent.directory, parent.entryId),
      listing,
    );
  }
  const rootListing = state.directories.find(
    (listing) => listing.directory.resource === state.root?.resource,
  );

  function children(listing: DirectoryListing): NativeTreeNode[] {
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

  const nodes: NativeTreeNode[] = application
    ? [
        {
          id: JSON.stringify(['native-root', application.resource]),
          name: application.name,
          kind: 'directory',
          children: rootListing ? children(rootListing) : [],
          childrenLoaded: rootListing !== undefined,
          childrenCount: rootListing?.entries.length ?? 0,
        },
      ]
    : [];
  if (file && !application) {
    nodes.push({
      id: JSON.stringify(['native-file', file.resource]),
      name: file.name,
      kind: 'file',
    });
  }
  return {
    rootNode: { id: 'native-tree-root', name: '', children: nodes },
    selectedId: nativeSelectedRowId(state),
  };
}
