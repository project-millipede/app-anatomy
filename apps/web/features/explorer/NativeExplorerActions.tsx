'use client';

import { useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { DirectoryListing } from '../workspace/base/DirectoryListing';
import { ErrorMessage } from '../workspace/ErrorMessage';
import { OutcomeErrors } from '../workspace/OutcomeErrors';
import type { WorkbenchModel } from '../workspace/types';
import styles from './NativeExplorerActions.module.css';

/** Native acquisition intents and temporary dialogs, using the page-owned model. */
export function NativeExplorerActions({ model }: { model: WorkbenchModel }) {
  const [folderOpen, setFolderOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  function browseFolder() {
    // The current listing remains authoritative even if the picker is cancelled or fails.
    setFolderOpen(true);
    void model.chooseNativeDirectory();
  }

  return (
    <div className={styles.actions}>
      <Menu.Root>
        <Menu.Trigger ref={openButtonRef} className={styles.button}>
          Open <span aria-hidden="true">▾</span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            className={styles.positioner}
            align="start"
            sideOffset={6}
          >
            <Menu.Popup className={styles.menu}>
              <Menu.Item
                className={styles.menuItem}
                disabled={model.operationPending}
                onClick={() => void model.chooseNativeFile()}
              >
                Select file…
              </Menu.Item>
              <Menu.Item
                className={styles.menuItem}
                disabled={model.operationPending}
                onClick={browseFolder}
              >
                Browse folder…
              </Menu.Item>
              {model.nativeDirectory && (
                <Menu.Item
                  className={styles.menuItem}
                  onClick={() => setFolderOpen(true)}
                >
                  Current folder…
                </Menu.Item>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <Dialog.Root open={folderOpen} onOpenChange={setFolderOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} finalFocus={openButtonRef}>
            <div className={styles.dialogHeader}>
              <Dialog.Title className={styles.title}>
                Browse native folder
              </Dialog.Title>
              <Dialog.Close className={styles.button}>Close</Dialog.Close>
            </div>
            <Dialog.Description className={styles.description}>
              Open a folder to view its immediate entries, or choose a file for
              the Explorer.
            </Dialog.Description>
            <button
              type="button"
              className={styles.button}
              disabled={model.operationPending}
              onClick={() => void model.chooseNativeDirectory()}
            >
              Choose another folder…
            </button>
            {model.operationPending && (
              <p role="status">Waiting for response…</p>
            )}
            <OutcomeErrors outcome={model.outcome} className={styles.error} />
            {model.hostError !== null && (
              <ErrorMessage
                message={model.hostError}
                className={styles.error}
                aria-label="Host execution error"
              />
            )}
            <div className={styles.folderListing}>
              {model.nativeDirectory ? (
                <DirectoryListing
                  directory={model.nativeDirectory}
                  operationPending={model.operationPending}
                  openNativeEntry={model.openNativeEntry}
                />
              ) : (
                <p className={styles.description}>
                  No native folder is currently available.
                </p>
              )}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
