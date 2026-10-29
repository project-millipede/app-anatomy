'use client';

import { useState } from 'react';
import { Tabs } from '../workspace/ark/Tabs';
import { useNativeSession } from '../workspace/useNativeSession';
import { useWorkbenchModel } from '../workspace/useWorkbenchModel';
import { ExplorerWorkspace } from './ExplorerWorkspace';
import { NativeExplorerWorkspace } from './NativeExplorerWorkspace';
import { NativeExplorerActions } from './NativeExplorerActions';
import { ExplorerFrame } from './layout/ExplorerFrame';
import styles from './ExplorerLayout.module.css';

/** Own one native session/model independently of the selected Explorer presentation. */
export function ApplicationExplorer() {
  const [source, setSource] = useState<'native' | 'synthetic'>('native');
  const { getNativeSession } = useNativeSession();
  const model = useWorkbenchModel(getNativeSession);
  const native = source === 'native';
  return (
    <Tabs.Root
      className={styles.sourceTabs}
      value={source}
      onValueChange={({ value }) => setSource(value as 'native' | 'synthetic')}
      activationMode="manual"
      lazyMount
      unmountOnExit
    >
      <ExplorerFrame
        title={
          <>
            <h1>Application Explorer</h1>
            <p>
              {native
                ? 'Inspect declared references while the selected file stays at the center.'
                : 'Related resources follow in the tree. One selected file stays at the center.'}
            </p>
          </>
        }
        controls={
          <div className={styles.toolbarActions}>
            <Tabs.List layout="workspace" aria-label="Explorer source">
              <Tabs.Trigger layout="workspace" value="native">
                Native file
              </Tabs.Trigger>
              <Tabs.Trigger layout="workspace" value="synthetic">
                Synthetic preview
              </Tabs.Trigger>
            </Tabs.List>
            {native && <NativeExplorerActions model={model} />}
          </div>
        }
        notice={
          native
            ? 'Selected-file evidence · Application containment and incoming consumers are unknown. Declared references are not acquired files.'
            : 'Synthetic preview · Rust-computed candidates from authored inventory facts. No files acquired or runtime loading observed.'
        }
        workspace={
          <>
            <Tabs.Content layout="workspace" value="native">
              <NativeExplorerWorkspace model={model} />
            </Tabs.Content>
            <Tabs.Content layout="workspace" value="synthetic">
              <ExplorerWorkspace />
            </Tabs.Content>
          </>
        }
        footer={
          <>
            <span>
              {native
                ? 'Application Explorer · Native selection'
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
    </Tabs.Root>
  );
}
