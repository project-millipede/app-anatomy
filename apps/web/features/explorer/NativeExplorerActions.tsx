'use client';

import { Menu } from '@base-ui/react/menu';
import type { WorkbenchModel } from '../workspace/types';
import styles from './NativeExplorerActions.module.css';

/** Forward native acquisition intents; retained folder contents appear in Files. */
export function NativeExplorerActions({ model }: { model: WorkbenchModel }) {
  return (
    <div className={styles.actions}>
      <Menu.Root>
        <Menu.Trigger className={styles.button}>
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
                onClick={() => void model.chooseNativeDirectory()}
              >
                Browse native folder…
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
