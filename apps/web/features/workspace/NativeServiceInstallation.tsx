'use client';

import { Dialog } from '@base-ui/react/dialog';
import styles from './NativeServiceInstallation.module.css';

/** Shared application download and setup; owns no native session or runtime. */
export function NativeServiceInstallation() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className={styles.trigger}>
        Download Native Workbench
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.dialog}>
          <div className={styles.dialogHeader}>
            <Dialog.Title className={styles.title}>
              Download Native Workbench
            </Dialog.Title>
            <Dialog.Close className={styles.close}>Close</Dialog.Close>
          </div>
          <Dialog.Description className={styles.description}>
            Install Native Workbench to choose files and folders on your Mac.
          </Dialog.Description>
          <NativeServiceInstallationContent />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Shared download and setup details; opening them does not change native ownership. */
export function NativeServiceInstallationContent() {
  return (
    <div className={styles.content}>
      {/* The package must be staged in public/installers before serving this website. */}
      <a
        className={styles.download}
        href="/installers/native-workbench-0.1.0-macos-arm64.pkg"
        download
      >
        Download for macOS · Apple silicon
      </a>
      <p className={styles.note}>
        Version 0.1.0 · unsigned development package
      </p>
      <ol>
        <li>
          Quit Native Workbench if it is running, then open the downloaded
          package and complete the macOS installation.
        </li>
        <li>
          Open Native Workbench from Applications. It runs in the background.
        </li>
        <li>
          Return here and reload this page, then select a native file or folder.
        </li>
      </ol>
      <p className={styles.note}>
        Open Native Workbench again after restarting your Mac. Automatic startup
        is not configured yet.
      </p>
    </div>
  );
}
