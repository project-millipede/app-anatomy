import Link from 'next/link';
import type { WorkbenchView } from '../features/workspace/types';
import styles from './VariantNavigation.module.css';

/**
 * Link between presentations without leaving the workbench page.
 * @param props The active presentation.
 * @returns Navigation that preserves page ownership during client transitions.
 */
export function VariantNavigation({ view }: { view: WorkbenchView }) {
  return (
    <nav aria-label="Workbench versions" className={styles.navigation}>
      <span>View</span>
      {(
        [
          ['base', '/', 'Base UI'],
          ['ark', '/?view=ark', 'Ark + Panda'],
          ['compare', '/?view=compare', 'Side by side'],
        ] as const
      ).map(([value, href, label]) => (
        <Link
          key={href}
          href={href}
          scroll={false}
          aria-current={view === value ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
