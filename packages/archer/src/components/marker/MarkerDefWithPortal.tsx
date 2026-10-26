import { type FC, type RefObject, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

import type { ResolvedArrowStyle } from '../../types-private';
import { ArrowMarker } from './ArrowMarker';

export const MARKER_DEF_OVERLAY_CLASS = 'archer-marker-def-overlay';

type MarkerDefWithPortalProps = {
  markerId: string;
  resolvedStyle: ResolvedArrowStyle;
  surfaceContentRef: RefObject<HTMLDivElement | null>;
};

/**
 * Returns the `<defs>` element that belongs to the `<svg>` sibling of the
 * supplied `surfaceContentElement`.
 *
 * @param surfaceContentElement – The content element within ArcherSurface.
 * @returns The corresponding `<defs>` element or `null` if not found.
 *
 * @remarks Steps performed:
 * 1. Ascend one level to the parent of `surfaceContentElement`.
 * 2. Perform a scoped query for `svg > defs.${DEFS_STANDARD_CLASS}`.
 */
function getSiblingDefsElement(
  surfaceContentElement: Element | null,
): SVGDefsElement | null {
  if (!surfaceContentElement) return null;

  const parentElement = surfaceContentElement.parentElement;
  if (!parentElement) return null;

  return (
    parentElement.querySelector<SVGDefsElement>(
      `:scope > svg > defs.${MARKER_DEF_OVERLAY_CLASS}`,
    ) ?? null
  );
}

/**
 * Places an `<ArrowMarker>` inside the shared `<defs>` section via React Portal.
 *
 * Implementation details:
 * 1. `useLayoutEffect` resolves the target `<defs>` synchronously after mount.
 * 2. Running before paint avoids a flash of missing markers.
 * 3. The dependency array is empty because `surfaceContentRef` is assumed to be
 *    stable for the component’s lifetime.
 * 4. If the underlying content element is replaced, re‑mount this component or
 *    supply a new key.
 */
export const MarkerDefWithPortal: FC<MarkerDefWithPortalProps> = ({
  markerId,
  resolvedStyle,
  surfaceContentRef,
}) => {
  const [targetElement, setTargetElement] = useState<SVGDefsElement | null>(
    null,
  );

  useLayoutEffect(() => {
    setTargetElement(getSiblingDefsElement(surfaceContentRef.current));
  }, []);

  if (!targetElement) return null;

  return createPortal(
    <ArrowMarker
      id={markerId}
      arrowLength={resolvedStyle.arrowLength}
      fill={resolvedStyle.strokeColor}
      ratio={1}
    />,
    targetElement,
    `portal-${markerId}`,
  );
};
