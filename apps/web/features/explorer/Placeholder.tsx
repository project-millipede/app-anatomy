import type { Ref } from 'react';
import styles from './ExplorerLayout.module.css';

type PlaceholderProps = {
  /** Name of the resource represented by this preview card. */
  title: string;
  /** Use the selected-resource card's existing presentation. */
  selected?: boolean;
  /** Archer's endpoint ref, attached to the card's root element. */
  ref?: Ref<HTMLDivElement>;
};

/** Render one of the existing relationship or selected-resource preview cards. */
export function Placeholder({
  title,
  selected = false,
  ref,
}: PlaceholderProps) {
  return (
    <div
      ref={ref}
      className={
        selected ? styles.focusPlaceholder : styles.relationPlaceholder
      }
    >
      <span className={styles.placeholderEyebrow}>
        {selected ? 'Selected preview resource' : 'Connection placeholder'}
      </span>
      <strong>{title}</strong>
      {selected && <p>File details placeholder</p>}
      <PlaceholderLines count={selected ? 2 : 1} />
    </div>
  );
}

/** Preserve the existing single-line and grouped skeleton markup. */
export function PlaceholderLines({ count }: { count: number }) {
  if (count === 1) {
    return <span className={styles.placeholderLine} aria-hidden="true" />;
  }

  return (
    <div className={styles.placeholderLines} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span className={styles.placeholderLine} key={index} />
      ))}
    </div>
  );
}
