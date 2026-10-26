import Link from 'next/link';
import type { WorkbenchView } from '../features/workspace/types';
import styles from './VariantNavigation.module.css';

/**
 * Link to the Explorer and the three presentations of the native workbench.
 * @param props The current page or workbench presentation.
 * @returns View links that retain scroll only within the workbench page.
 */
export function VariantNavigation({
  view,
}: {
  view: WorkbenchView | 'explorer';
}) {
  return (
    <nav aria-label="Workbench versions" className={styles.navigation}>
      <span>View</span>
      {(
        [
          ['base', '/', 'Base UI'],
          ['ark', '/?view=ark', 'Ark + Panda'],
          ['compare', '/?view=compare', 'Side by side'],
          ['explorer', '/explorer', 'Explorer'],
        ] as const
      ).map(([value, href, label]) => (
        <Link
          key={href}
          href={href}
          scroll={view === 'explorer' || value === 'explorer'}
          aria-current={view === value ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
