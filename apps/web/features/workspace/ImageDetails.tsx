import type { Image } from '@apple-code/browser';
import {
  cpuLabel,
  endiannessLabels,
  machoValueLabel,
  headerLabels,
  rangeLabel,
} from './reportPresentation';

/** Shared rendering keeps both component-library views on the same Rust evidence. */
export function ImageDetails({
  image,
  styles,
}: {
  image: Image;
  styles: { facts: string; note: string; evidence: string };
}) {
  return (
    <>
      <dl className={styles.facts}>
        <div>
          <dt>Architecture</dt>
          <dd>
            {cpuLabel(image.cpu)}
            <small>
              Raw type 0x{image.cpu.cpuType.value.toString(16)}, subtype 0x
              {image.cpu.cpuSubtype.value.toString(16)}
            </small>
          </dd>
        </div>
        <div>
          <dt>File role</dt>
          <dd>{machoValueLabel(image.fileType)}</dd>
        </div>
        <div>
          <dt>Header format</dt>
          <dd>{headerLabels[image.headerFormat]}</dd>
        </div>
        <div>
          <dt>Byte order</dt>
          <dd>{endiannessLabels[image.endianness]}</dd>
        </div>
        <div>
          <dt>File range</dt>
          <dd>
            {rangeLabel(image.fileRange)} <small>(end exclusive)</small>
          </dd>
        </div>
      </dl>
      <h3>Platform evidence</h3>
      {image.platforms.length === 0 ? (
        <p className={styles.note}>
          No recognized platform load command. The target platform is
          undetermined.
        </p>
      ) : (
        image.platforms.map((declaration) => (
          <div
            className={styles.evidence}
            key={declaration.source.fileRange.offset.toString()}
          >
            <div>
              <strong>
                {declaration.platform
                  ? machoValueLabel(declaration.platform)
                  : 'Legacy platform declaration'}
              </strong>
              <span>
                Minimum OS {declaration.minimumOs} · SDK {declaration.sdk}
              </span>
            </div>
            <code>
              {machoValueLabel(declaration.source.kind)} at file offset 0x
              {declaration.source.fileRange.offset.toString(16)}
              {' · '}
              {declaration.source.fileRange.size.toString()} bytes
            </code>
          </div>
        ))
      )}
      <h3>Signature status</h3>
      {image.signatureCommands.length === 0 ? (
        <p>No LC_CODE_SIGNATURE command</p>
      ) : (
        <>
          <p>LC_CODE_SIGNATURE present · not verified</p>
          {image.signatureCommands.map((signature) => (
            <div
              className={styles.evidence}
              key={signature.commandRange.offset.toString()}
            >
              <code>
                Command at file offset 0x
                {signature.commandRange.offset.toString(16)}
              </code>
              <p>
                Declared signature data: {rangeLabel(signature.dataRange)} (end
                exclusive)
              </p>
            </div>
          ))}
        </>
      )}
    </>
  );
}
