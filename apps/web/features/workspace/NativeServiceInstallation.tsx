import styles from './NativeServiceInstallation.module.css';

/** Present setup instructions without owning the native session or runtime. */
export function NativeServiceInstallation() {
  return (
    <section
      className={styles.installation}
      aria-label="Native filesystem installation"
    >
      <details className={styles.panel}>
        <summary>Set up native file access</summary>
        <div className={styles.content}>
          <p>
            Install Native Workbench to choose files and folders on your Mac.
          </p>
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
              Open the downloaded package and complete the macOS installation.
            </li>
            <li>
              Open Native Workbench from Applications. It runs in the
              background.
            </li>
            <li>
              Return here and reload this page, then select a native file or
              folder.
            </li>
          </ol>
          <p className={styles.note}>
            Open Native Workbench again after restarting your Mac. Automatic
            startup is not configured yet.
          </p>
        </div>
      </details>
    </section>
  );
}
