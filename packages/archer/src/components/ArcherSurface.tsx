import { type FC, useCallback, useEffect, useMemo, useRef } from 'react';
import { createStore, Provider } from 'jotai';

import { useAtomCallback } from 'jotai/utils';

import { HooksUtils } from '../support';

import type { ArcherSurfaceProps, ResolvedArrowStyle } from '../types-private';

import { SvgArrowCanvas } from './SvgArrowCanvas';

import { MARKER_DEF_OVERLAY_CLASS } from './marker/MarkerDefWithPortal';
import { EDGE_LABEL_OVERLAY_CLASS } from './edge-label/EdgeLabelWithPortal';
import { features } from '../features';

import styles from './ArcherSurface.module.css';

const {
  core: {
    actions: { resetArcherActionAtom },
  },
  refs: {
    actions: { resetArcherRefsActionAtom },
  },
} = features;

// Define the system defaults for arrow styles
const DEFAULT_ARROW_STYLE: ResolvedArrowStyle = {
  arrowLength: 6,
  strokeColor: 'gray',
  strokeWidth: 1,
  strokeDasharray: undefined,
};

/**
 * ArcherSurface is the root container for Archer elements and the arrows that
 * float above them, visually connecting these elements.
 *
 * It renders two siblings:
 * 1. <div> — content wrapper (ref = surfaceContentRef) that holds {children}
 * 2. <svg> — hosts SvgArrowCanvas, which draws the arrows
 *
 * Coordinate origin
 * - surfaceContentRef anchors the local coordinate space:
 *   every x/y used by SvgArrowCanvas → ArrowRenderer → SvgArrow → EdgeLabel is
 *   measured from the wrapper’s top-left corner (0, 0).
 *   No viewport math required.
 * - The absolutely positioned <svg> and the .archer-edge-label-overlay <div>
 *   stretch to the wrapper’s bounds, so they share that same origin.
 *
 * --- Resize handshake ---
 * 1. ArcherSurface ▶ useCoordinateParentNodeWithChildSetter(surfaceContentRef)
 *      ↳ returns
 *         a. callbackRefForParentNode  – attached to the wrapper
 *         b. onChildSetterReady        – passed to SvgArrowCanvas
 *
 * 2. SvgArrowCanvas ▶ useResize() → setRefFromUseResize
 *      ▶ useSignalCallbackPresence(setRefFromUseResize, onChildSetterReady)
 *
 * 3. The hook links setRefFromUseResize to the wrapper node.
 *    Now only SvgArrowCanvas re-renders on size change; ArcherSurface stays out
 *    of the render loop.
 */
/** Keep rendering edges and refs private to this surface, independent of application state. */
export const ArcherSurface: FC<ArcherSurfaceProps> = (props) => {
  const storeRef = useRef<ReturnType<typeof createStore> | null>(null);
  if (storeRef.current === null) storeRef.current = createStore();
  return (
    <Provider store={storeRef.current}>
      <ArcherSurfaceContent {...props} />
    </Provider>
  );
};

const ArcherSurfaceContent: FC<ArcherSurfaceProps> = ({
  defaultArrowStyle,
  surfaceStyle,
  className,
  style,
  svgElementProps,
  onSurfaceUnmount,
  isMobile = false,
  children,
}) => {
  const defaults = useMemo(() => {
    return { ...DEFAULT_ARROW_STYLE, ...(defaultArrowStyle ?? {}) };
  }, [defaultArrowStyle]);

  const surfaceContentRef = useRef<HTMLDivElement | null>(null);
  const onUnmountRef = useRef(onSurfaceUnmount);
  onUnmountRef.current = onSurfaceUnmount;

  // 1a & 1b. Setup ref coordination for resize observation.
  const [callbackRefForParentNode, onChildSetterReady] =
    HooksUtils.RefCoordination.useCoordinateParentNodeWithChildSetter();

  const performArcherReset = useAtomCallback(
    useCallback((_get, set) => {
      set(resetArcherActionAtom);
      set(resetArcherRefsActionAtom);
    }, []),
  );

  useEffect(() => {
    return () => {
      /**
       * Reset internal transition composed state.
       *
       * Note:
       * The reset of archer elements and their respective transitions gets handled
       * in an archer-element effect (unmount - segment).
       */
      performArcherReset();

      /**
       * Reset higher-level states via the provided callback.
       * Allows the consumer to hook into the unmount lifecycle.
       */
      onUnmountRef.current?.();
    };
  }, [performArcherReset]);

  const combinedRef = HooksUtils.useMergedRef([
    surfaceContentRef,
    callbackRefForParentNode,
  ]);

  return (
    <div
      className={[styles.archerSurface, className].filter(Boolean).join(' ')}
      style={style}
    >
      {/* Content wrapper — surfaceContentRef is attached here */}

      <div
        ref={combinedRef}
        className={styles.surfaceContent}
        style={surfaceStyle}
      >
        {children} {/* All land here even bot html and svg based */}
      </div>

      {/* Portal target for <EdgeLabel> components. */}
      <div
        // `styles.edgeLabelOverlay` for layout;
        // `EDGE_LABEL_OVERLAY_CLASS` is a JS marker.
        className={`${styles.edgeLabelOverlay} ${EDGE_LABEL_OVERLAY_CLASS}`}
      />

      <svg
        {...svgElementProps}
        className={[styles.svgCanvas, svgElementProps?.className]
          .filter(Boolean)
          .join(' ')}
        preserveAspectRatio="xMinYMid meet"
      >
        {/* Portal target for <ArrowMarker> definitions. */}
        <defs
          // `MARKER_DEF_OVERLAY_CLASS` is a JS marker.
          className={MARKER_DEF_OVERLAY_CLASS}
        />

        <SvgArrowCanvas
          onResizeSetterReady={onChildSetterReady}
          surfaceContentRef={surfaceContentRef}
          defaults={defaults}
          isMobile={isMobile}
        />
      </svg>
    </div>
  );
};
