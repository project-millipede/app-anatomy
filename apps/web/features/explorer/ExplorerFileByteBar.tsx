import { Tooltip } from '@ark-ui/react/tooltip';
import {
  getPreviewArchitecture,
  type PreviewDataset,
  type PreviewFileByteLayout,
} from './previewInventory';
import { ExplorerFileByteTooltip } from './ExplorerFileByteTooltip';
import {
  formatByteCount,
  formatFileByteSize,
  formatFileOffset,
} from './fileByteFormatting';
import styles from './ExplorerFileByteBar.module.css';

type ExplorerFileByteBarProps = {
  /** Ordered, validated regions covering one complete physical file. */
  readonly byteLayout: PreviewFileByteLayout;
  /** File name used by the accessible description and shared tooltip. */
  readonly fileName: string;
  /** Generated CPU labels used by the architecture columns. */
  readonly dataset: Pick<PreviewDataset, 'architectureCoverage'>;
  /** Colors shared with the exact CPU columns. */
  readonly architectureColors: ReadonlyMap<string, string>;
  /** Exact CPU identity highlighted without changing region widths. */
  readonly selectedArchitectureId: string | undefined;
};

/**
 * Draw Rust-projected regions with one shared Ark tooltip for each file bar.
 * @param props Recorded layout, file label and architecture presentation.
 * @returns The total, proportional region triggers, file extent and shared tooltip.
 */
export function ExplorerFileByteBar({
  byteLayout,
  fileName,
  dataset,
  architectureColors,
  selectedArchitectureId,
}: ExplorerFileByteBarProps) {
  if (byteLayout.byteLength === 0) {
    return <p className={styles.total}>0 bytes · whole physical file</p>;
  }

  return (
    <Tooltip.Root
      interactive
      positioning={{ placement: 'top', strategy: 'fixed', gutter: 8 }}
    >
      <div className={styles.composition}>
        <p className={styles.total}>
          <strong>{formatFileByteSize(byteLayout.byteLength)}</strong> ·{' '}
          {formatByteCount(byteLayout.byteLength)} · whole physical file
        </p>
        <div
          className={styles.bar}
          role="group"
          aria-label={`${fileName}: ${formatByteCount(byteLayout.byteLength)}. Hover or keyboard-focus a region for its exact byte range.`}
        >
          {byteLayout.regions.map((region) => {
            const label =
              region.architectureId === null
                ? 'Other / unmapped bytes'
                : getPreviewArchitecture(dataset, region.architectureId).label;
            return (
              <Tooltip.Trigger
                key={region.offset}
                value={String(region.offset)}
                type="button"
                className={styles.region}
                aria-label={`${label}, offset ${formatFileOffset(region.offset)}`}
                data-highlighted={
                  region.architectureId === selectedArchitectureId
                }
                data-unmapped={region.imageId === null}
                style={{
                  width: `${(region.size / byteLayout.byteLength) * 100}%`,
                  color:
                    region.architectureId === null
                      ? undefined
                      : architectureColors.get(region.architectureId),
                }}
              />
            );
          })}
        </div>
        <div className={styles.axis} aria-hidden="true">
          <span>0x0</span>
          <span>{formatFileOffset(byteLayout.byteLength)} · file end</span>
        </div>
        <ExplorerFileByteTooltip
          byteLayout={byteLayout}
          fileName={fileName}
          dataset={dataset}
          selectedArchitectureId={selectedArchitectureId}
        />
      </div>
    </Tooltip.Root>
  );
}
