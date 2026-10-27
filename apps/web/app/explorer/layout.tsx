import type { ReactNode } from 'react';
import { VariantNavigation } from '../../components/VariantNavigation';
import styles from './layout.module.css';

/** Own the Explorer's presentation chrome without mounting a native session. */
export default function ExplorerRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className={`ark-theme ${styles.route}`}>
      <VariantNavigation view="explorer" />
      {children}
    </div>
  );
}
