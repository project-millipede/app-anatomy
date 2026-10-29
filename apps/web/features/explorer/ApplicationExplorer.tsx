'use client';

import { useState } from 'react';
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
    <ExplorerFrame
      brand={null}
      headerActions={null}
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
      axisKey={
        <div className={styles.toolbarActions}>
          <label className={styles.selectLabel}>
            Explorer source
            <select
              value={source}
              onChange={(event) =>
                setSource(event.target.value as 'native' | 'synthetic')
              }
            >
              <option value="native">Native selection</option>
              <option value="synthetic">Synthetic datasets</option>
            </select>
          </label>
          {native ? (
            <NativeExplorerActions model={model} />
          ) : (
            <>
              <span>↔ Internal resources</span>
              <span>↕ External / unresolved</span>
            </>
          )}
        </div>
      }
      notice={
        native
          ? 'Selected-file evidence · Application containment and incoming consumers are unknown. Declared references are not acquired files.'
          : 'Synthetic preview · Rust-computed candidates from authored inventory facts. No files acquired or runtime loading observed.'
      }
      workspace={
        native ? (
          <NativeExplorerWorkspace model={model} />
        ) : (
          <ExplorerWorkspace />
        )
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
  );
}
