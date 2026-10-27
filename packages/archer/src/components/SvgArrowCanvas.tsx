import type { FC, RefObject } from 'react';

import { HooksUtils } from '../support';

import { type ResolvedArrowStyle } from '../types-private';

import { default as ArrowRenderer } from './ArrowRenderer';

import { features } from '../features';

const {
  core: {
    states: { edgeAtomsAtom },
  },
} = features;

type SvgArrowCanvasProps = {
  onResizeSetterReady: (
    resizeSetter: HooksUtils.RefCoordination.NodeSetter<HTMLElement> | null,
  ) => void;
  surfaceContentRef: RefObject<HTMLDivElement | null>;
  defaults: ResolvedArrowStyle;
  isMobile: boolean;
};

/**
 * @component SvgArrowCanvas
 * @description Renders the SVG canvas for arrows and manages resize observation
 * of a parent-defined element.
 *
 * This component employs a two-step process to enable resize observation of an
 * element owned by its parent (e.g., ArcherSurface):
 *
 * 1. Initialize Resize Observation (`useResize`):
 *    - It calls an internal resize hook (e.g., `useResizeAdv` aliased as
 *      `useResize`) to obtain:
 *      - `setRefFromUseResize`: A callback ref setter function. This function,
 *        when attached to a DOM node, will trigger the resize observation
 *        logic.
 *      - `bounds`: A reactive state object holding the dimensions of the
 *        observed node.
 *    - This component itself will use the `bounds` to correctly render or
 *      position arrows.
 *
 * 2. Export Resize Ref Setter to Parent (`useSignalCallbackPresence`):
 *    - Since the DOM element to be observed is owned by the parent, this
 *      component needs to provide its `setRefFromUseResize` function to the
 *      parent.
 *    - It uses the `useSignalCallbackPresence` utility hook for this.
 *    - `useSignalCallbackPresence` takes `setRefFromUseResize` and the
 *      `onResizeSetterReady` prop (a callback function provided by the parent).
 *    - It then calls `onResizeSetterReady(setRefFromUseResize)` when
 *      `setRefFromUseResize` is available, and `onResizeSetterReady(null)` when
 *      this component unmounts (signaling the setter is no longer active).
 *    - This allows the parent component to receive the `setRefFromUseResize`
 *      function and attach it to its own target DOM element.
 */
export const SvgArrowCanvas: FC<SvgArrowCanvasProps> = ({
  onResizeSetterReady,
  surfaceContentRef,
  defaults,
  isMobile,
}) => {
  // 1. Initialize resize observation capabilities.
  const [setRefFromUseResize, bounds] = HooksUtils.useResize();

  // 2. Export the `setRefFromUseResize` function to the parent component.
  HooksUtils.RefCoordination.useSignalCallbackPresence(
    setRefFromUseResize,
    onResizeSetterReady,
  );

  const transitionAtoms = HooksUtils.Jotai.useAtomValue(edgeAtomsAtom);

  // logs on this one

  // [RefDiff] "transitionAtoms" reference changed.  Detected changes:
  // • 0: undefined → {}

  // [RefDiff] "transitionAtoms" reference changed.  Detected changes:
  // • 1: undefined → {}

  return (
    <>
      {transitionAtoms.map((transitionAtom) => {
        const key = transitionAtom.toString();
        return (
          <ArrowRenderer
            key={key}
            transitionAtom={transitionAtom}
            bounds={bounds}
            surfaceContentRef={surfaceContentRef}
            defaults={defaults}
            isMobile={isMobile}
          />
        );
      })}
    </>
  );
};
