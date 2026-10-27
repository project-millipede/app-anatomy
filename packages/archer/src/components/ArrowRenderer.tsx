import { type FC, type RefObject, useId, useMemo } from 'react';
import { useAtomValue, type PrimitiveAtom } from 'jotai';

import type { SourceToTargetType, ResolvedArrowStyle } from '../types-private';
import { SvgArrow } from './SvgArrow';
import { MarkerDefWithPortal } from './marker/MarkerDefWithPortal';
import type { HooksUtils } from '../support';

type ArrowRendererProps = {
  transitionAtom: PrimitiveAtom<SourceToTargetType | null>;
  bounds: HooksUtils.MeasuredDimensions;
  surfaceContentRef: RefObject<HTMLDivElement | null>;
  defaults: ResolvedArrowStyle;
  isMobile: boolean;
};

/** Subscribe to one original Archer edge; keep hooks mounted only with valid edge data. */
export const ArrowRenderer: FC<ArrowRendererProps> = (props) => {
  const transition = useAtomValue(props.transitionAtom);
  return transition ? (
    <ArrowContents {...props} transition={transition} />
  ) : null;
};

const ArrowContents = ({
  transition,
  surfaceContentRef,
  defaults,
  isMobile,
}: ArrowRendererProps & { transition: SourceToTargetType }) => {
  // React's identifier also isolates SVG markers when two surfaces use the same node IDs.
  const markerId = `archer-marker-${useId()}`;
  const resolvedStyle = useMemo(
    () => ({ ...defaults, ...(transition.style ?? {}) }),
    [defaults, transition.style],
  );

  return (
    <>
      <MarkerDefWithPortal
        markerId={markerId}
        resolvedStyle={resolvedStyle}
        surfaceContentRef={surfaceContentRef}
      />
      <SvgArrow
        source={transition.source}
        target={transition.target}
        strokeColor={resolvedStyle.strokeColor}
        strokeWidth={resolvedStyle.strokeWidth}
        strokeDasharray={resolvedStyle.strokeDasharray}
        arrowLength={resolvedStyle.arrowLength}
        arrowLabel={transition.label}
        arrowMarkerId={markerId}
        doubleHeaded={transition.doubleHeaded ?? false}
        surfaceContentRef={surfaceContentRef}
        isMobile={isMobile}
      />
    </>
  );
};

export default ArrowRenderer;
