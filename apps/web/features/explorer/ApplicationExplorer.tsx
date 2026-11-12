'use client';

import { useState } from 'react';
import { TabsRootProvider, useTabs } from '@ark-ui/react/tabs';
import { Tabs } from '../workspace/ark/Tabs';
import { useNativeSession } from '../workspace/useNativeSession';
import { useWorkbenchModel } from '../workspace/useWorkbenchModel';
import { ExplorerWorkspace } from './ExplorerWorkspace';
import { NativeExplorerWorkspace } from './NativeExplorerWorkspace';
import { NativeExplorerActions } from './NativeExplorerActions';
import { ExplorerFrame } from './layout/ExplorerFrame';
import { ExplorerDiagnostics } from './ExplorerDiagnostics';
import { nativeExplorerSubject } from './nativeTreePresentation';
import type { NativeTreeFailure } from './nativeTreeFailures';
import styles from './ExplorerLayout.module.css';

enum ExplorerSource {
  Native = 'native',
  Synthetic = 'synthetic',
}

/** Own one native session/model independently of the selected Explorer presentation. */
export function ApplicationExplorer() {
  const [treeFailures, setTreeFailures] = useState<
    readonly NativeTreeFailure[]
  >([]);
  const tabs = useTabs({
    defaultValue: ExplorerSource.Native,
    onValueChange: () => setTreeFailures([]),
    /*
     * 1. Arrow keys move focus between tab buttons without switching workspaces.
     * 2. Enter, Space or a click activates the chosen tab.
     */
    activationMode: 'manual',
  });
  const { getNativeSession } = useNativeSession();
  const model = useWorkbenchModel(getNativeSession);
  const native = tabs.value === ExplorerSource.Native;
  const { application, file } = nativeExplorerSubject(model.nativeWorkspace);
  const binary = model.nativeWorkspace?.scope === 'binary';
  const scopeResource = application?.resource ?? file?.resource ?? null;
  const currentTreeFailures = treeFailures.filter(
    (failure) =>
      native &&
      failure.operation === model.feedback.operation &&
      failure.scopeResource === scopeResource,
  );
  // Discard obsolete notifications before rendering, including completions batched
  // with a new invocation. No effect or second copy of the outcome is needed.
  if (currentTreeFailures.length !== treeFailures.length)
    setTreeFailures(currentTreeFailures);

  /**
   * Retain each independent loader failure; identity excludes repeated delivery only.
   * @param failures Ark's local failures with their original invocation and tree scope.
   * @returns Nothing; the current render excludes obsolete notifications.
   */
  function reportTreeFailures(failures: readonly NativeTreeFailure[]) {
    setTreeFailures((recordedFailures) => {
      const nextFailures = [...recordedFailures];
      for (const failure of failures) {
        if (
          nextFailures.some(
            (recorded) =>
              recorded.error === failure.error &&
              recorded.nodeId === failure.nodeId,
          )
        )
          continue;
        nextFailures.push(failure);
      }
      return nextFailures;
    });
  }
  return (
    <TabsRootProvider
      className={styles.sourceTabs}
      value={tabs}
      /*
       * 1. Defer each workspace's initial mount until its tab becomes active.
       * 2. Native mounts initially because it is the default selection.
       * 3. Synthetic remains unmounted until first selected.
       */
      lazyMount
      /*
       * 1. Unmount the inactive workspace and discard its component-local state.
       * 2. Returning to Native rebuilds tree expansion, reveals the retained
       *    selected file, clears the dependency preview and resets corridor pages.
       * 3. Returning to Synthetic opens Overview for the initial dataset/context,
       *    with a fresh relationship session, no selected file and empty history.
       * 4. The parent-owned native runtime and model remain alive, retaining the
       *    acquired selection, loaded directories, report and architecture slice.
       */
      unmountOnExit
    >
      <ExplorerFrame
        title={
          <>
            <h1>Application Explorer</h1>
            <p>
              {native
                ? 'Open one application or standalone binary. Select a file to inspect its declared references.'
                : 'Choose an architecture context, then explore relationships from one selected file.'}
            </p>
          </>
        }
        controls={
          <div className={styles.toolbarActions}>
            <Tabs.List layout="workspace" aria-label="Explorer source">
              <Tabs.Trigger layout="workspace" value={ExplorerSource.Native}>
                Native
              </Tabs.Trigger>
              <Tabs.Trigger layout="workspace" value={ExplorerSource.Synthetic}>
                Synthetic preview
              </Tabs.Trigger>
            </Tabs.List>
            {native && <NativeExplorerActions model={model} />}
          </div>
        }
        notice={
          native
            ? application
              ? `Application navigation scope: ${application.name}. Declared references have no evaluated file targets; incoming consumers are unknown.`
              : binary
                ? 'Standalone binary scope · Declared references have no evaluated file targets; incoming consumers are unknown.'
                : 'Open an application or binary for Explorer. Generic file and folder selections remain available in the workbench.'
            : 'Synthetic preview · Rust-computed candidates from authored inventory facts. No files acquired or runtime loading observed.'
        }
        workspace={
          <>
            <Tabs.Content layout="workspace" value={ExplorerSource.Native}>
              <NativeExplorerWorkspace
                model={model}
                onTreeFailures={reportTreeFailures}
              />
            </Tabs.Content>
            <Tabs.Content layout="workspace" value={ExplorerSource.Synthetic}>
              <ExplorerWorkspace />
            </Tabs.Content>
          </>
        }
        diagnostics={
          native ? (
            <ExplorerDiagnostics
              feedback={model.feedback}
              treeFailures={currentTreeFailures}
            />
          ) : null
        }
        footer={
          <>
            <span>
              {native
                ? application
                  ? `Application scope · ${application.name}`
                  : binary
                    ? 'Application Explorer · Standalone binary'
                    : 'Application Explorer · Choose an application or binary'
                : 'Application Explorer · Authored synthetic data'}
            </span>
            <span>
              {native
                ? 'Recorded evidence · Target evaluation not performed'
                : 'Rust-computed candidates · No files inspected'}
            </span>
          </>
        }
      />
    </TabsRootProvider>
  );
}
