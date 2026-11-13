import { Tooltip, useTooltipContext } from '@ark-ui/react/tooltip';
import {
  getPreviewArchitecture,
  type PreviewDataset,
  type PreviewFileByteLayout,
} from './previewInventory';
import {
  formatByteCount,
  formatFileByteSize,
  formatFileOffset,
} from './fileByteFormatting';
import styles from './ExplorerFileByteTooltip.module.css';

type ExplorerFileByteTooltipProps = {
  /** Original regions supplied by Rust for the owning bar. */
  readonly byteLayout: PreviewFileByteLayout;
  /** Physical file identified by the tooltip. */
  readonly fileName: string;
  /** Generated labels for the region's exact recorded CPU identity. */
  readonly dataset: Pick<PreviewDataset, 'architectureCoverage'>;
  /** Current CPU identity used only to label the matching region. */
  readonly selectedArchitectureId: string | undefined;
};

/**
 * Present the region identified by Ark's currently active trigger.
 * @param props Rust-projected file regions and their architecture labels.
 * @returns Shared tooltip content, or nothing until Ark identifies a region.
 */
export function ExplorerFileByteTooltip({
  byteLayout,
  fileName,
  dataset,
  selectedArchitectureId,
}: ExplorerFileByteTooltipProps) {
  const { triggerValue } = useTooltipContext();
  if (triggerValue === null) return null;

  const region = byteLayout.regions.find(
    (candidate) => String(candidate.offset) === triggerValue,
  );
  if (!region) return null;

  const label =
    region.architectureId === null
      ? 'Other / unmapped bytes'
      : getPreviewArchitecture(dataset, region.architectureId).label;

  return (
    <Tooltip.Positioner className={styles.positioner}>
      <Tooltip.Content className={styles.content}>
        <span className={styles.fileName}>{fileName}</span>
        <strong className={styles.heading}>{label}</strong>
        {region.architectureId === selectedArchitectureId && (
          <span className={styles.selected}>Selected context</span>
        )}
        <dl className={styles.facts}>
          <div>
            <dt>Offset</dt>
            <dd className={styles.coordinate}>
              {formatFileOffset(region.offset)}
            </dd>
          </div>
          <div>
            <dt>End (exclusive)</dt>
            <dd className={styles.coordinate}>
              {formatFileOffset(region.end)}
            </dd>
          </div>
          <div>
            <dt>Length</dt>
            <dd>
              {formatByteCount(region.size)} · {formatFileByteSize(region.size)}
            </dd>
          </div>
        </dl>
      </Tooltip.Content>
    </Tooltip.Positioner>
  );
}
