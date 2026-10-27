import type { FC, ReactNode, RefObject } from 'react';
import {
  useRef,
  useCallback,
  useMemo,
  useEffect,
  // useImperativeHandle
} from 'react';

import { HooksUtils } from '../support';

import type { EntityRelationType, ResolvedArrowStyle } from '../types-private';
import { type SyncHandle } from '../types';
import { type EdgeLabelSyncHandle } from './edge-label/types';
import {
  type ArrowGeometry,
  useArrowGeometry,
} from '../hooks/useArrowGeometry';
import { useArrowAnimation } from '../hooks/useArrowAnimation';

// import { EdgeLabel } from './edge-label/EdgeLabel';
import { EdgeLabelWithPortal as EdgeLabel } from './edge-label/EdgeLabelWithPortal';

import { features } from '../features';

const {
  core: {
    states: { routingResolverAtom, edgeDecoratorAtom },
  },
  refs: {
    selector: { archerRefSelectorFunction },
  },
} = features;

/**
 * The specific configuration for the `SyncHandle` type.
 *
 * This object defines the behavior for the generic `augmentHandle` and
 * `removeListenerFromHandle` functions when they operate on a `SyncHandle`.
 *
 * It establishes two categories of methods:
 * 1. Broadcasted Keys:
 *    The keys listed in `broadcastKeys` (e.g., `anchorAnimationDidStart`) will
 *    be transformed into special broadcaster functions that notify all
 *    subscribed listeners.
 * 2. Passthrough Keys:
 *    All other keys on the `SyncHandle` (e.g., `sync`) are not part of the
 *    broadcasting mechanism. They will follow a simple "last writer wins"
 *    pattern, where the final handle always contains the method from the most
 *    recently added listener.
 */
const syncHandleConfig: HooksUtils.RefBroadcast.BroadcasterConfig<SyncHandle> =
  {
    broadcastKeys: [
      'sync',
      'anchorAnimationInit',
      'anchorAnimationDidStart',
      'anchorAnimationDidEnd',
    ],
  };

type SvgArrowProps = ResolvedArrowStyle & {
  source: EntityRelationType;
  target: EntityRelationType;
  arrowMarkerId: string;
  arrowLabel: ReactNode;
  doubleHeaded?: boolean;
  onClickCallback?: () => void;
  isMobile: boolean;
  surfaceContentRef: RefObject<HTMLDivElement | null>;
};

export const SvgArrow: FC<SvgArrowProps> = ({
  source,
  target,
  strokeColor,
  strokeWidth,
  strokeDasharray,
  arrowMarkerId,
  arrowLabel,
  arrowLength,
  doubleHeaded = false,
  onClickCallback,
  isMobile,
  surfaceContentRef,
}) => {
  const pathRef = useRef<SVGPathElement>(null);
  const edgeLabelSyncHandle = useRef<EdgeLabelSyncHandle>(null);
  const latestGeometryRef = useRef<ArrowGeometry | null>(null);

  const sourceRef = HooksUtils.Jotai.useAtomSelector(
    archerRefSelectorFunction,
    source.id,
  );

  const targetRef = HooksUtils.Jotai.useAtomSelector(
    archerRefSelectorFunction,
    target.id,
  );

  // Determine if the smart layout logic should be run for this arrow.
  const isSmartLayoutEnabled =
    source.layout !== 'default' && target.layout !== 'default';

  // Read the injected routing policy from the global atom (Jotai, not Context),
  // the same mechanism by which this component already reads anchor refs.
  const resolveRouting = HooksUtils.Jotai.useAtomValue(routingResolverAtom);

  // Read the injected edge decorator (flow/packets) the same way. Null ⇒ plain.
  const decorateEdge = HooksUtils.Jotai.useAtomValue(edgeDecoratorAtom);

  const calculateGeometry = useArrowGeometry({
    source,
    target,
    sourceRef,
    targetRef,
    parentRef: surfaceContentRef,
    isMobile,
    arrowLength,
    strokeWidth,
    doubleHeaded,
    isSmartLayoutEnabled,
    resolveRouting,
  });

  const updateSvgAttributes = useCallback(() => {
    const geometry = calculateGeometry(true);
    latestGeometryRef.current = geometry;

    if (pathRef.current) {
      pathRef.current.setAttribute('d', geometry?.path ?? '');
    }
    if (geometry && edgeLabelSyncHandle.current) {
      edgeLabelSyncHandle.current.updatePosition(
        geometry.label.x,
        geometry.label.y,
      );
    }
  }, [calculateGeometry]);

  // Keep DOM movement/visibility and fan-out synchronized inside the drawing library.
  // The observed content excludes the SVG, so updating a path cannot feed back into this observer.
  useEffect(() => {
    const content = surfaceContentRef.current;
    if (!content) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        updateSvgAttributes();
      });
    };
    const resize = new ResizeObserver(schedule);
    for (const element of [
      content,
      sourceRef?.ref?.current,
      targetRef?.ref?.current,
    ]) {
      if (element) resize.observe(element);
    }
    const mutations = new MutationObserver(schedule);
    mutations.observe(content, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    content.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      resize.disconnect();
      mutations.disconnect();
      content.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [surfaceContentRef, sourceRef, targetRef, updateSvgAttributes]);

  const {
    notifyAnimationStart,
    notifyAnimationEnd,
    notifyAnimationInit,
    isAnimatingRef,
  } = useArrowAnimation(updateSvgAttributes, source.id, target.id);

  // const combinedRef = HooksUtils.useMergedRef([
  //   sourceRef?.dynamicRef,
  //   targetRef?.dynamicRef
  // ]);

  // useImperativeHandle(
  //   combinedRef,
  //   (): SyncHandle => ({
  //     sync: _y => {
  //       updateSvgAttributes();
  //     },
  //     anchorAnimationInit(anchorId) {
  //       notifyAnimationInit(anchorId);
  //     },
  //     anchorAnimationDidStart(anchorId) {
  //       console.log('notifyAnimationStart called for anchorId:', anchorId);
  //       notifyAnimationStart(anchorId);
  //     },
  //     anchorAnimationDidEnd(anchorId) {
  //       console.log('notifyAnimationEnd called for anchorId:', anchorId);
  //       notifyAnimationEnd(anchorId);
  //     }
  //   }),
  //   [
  //     updateSvgAttributes,
  //     notifyAnimationInit,
  //     notifyAnimationStart,
  //     notifyAnimationEnd
  //   ]
  // );

  // Memoize the listener object for this arrow instance to ensure a stable
  // reference
  const listenerHandle = useMemo(
    (): SyncHandle => ({
      sync: (_y) => updateSvgAttributes(),
      anchorAnimationInit: notifyAnimationInit,
      anchorAnimationDidStart: notifyAnimationStart,
      anchorAnimationDidEnd: notifyAnimationEnd,
    }),
    [
      updateSvgAttributes,
      notifyAnimationInit,
      notifyAnimationStart,
      notifyAnimationEnd,
    ],
  );

  HooksUtils.RefBroadcast.useImperativeBroadcaster(
    sourceRef?.dynamicRef,
    listenerHandle,
    syncHandleConfig,
  );

  HooksUtils.RefBroadcast.useImperativeBroadcaster(
    targetRef?.dynamicRef,
    listenerHandle,
    syncHandleConfig,
  );

  // Recalculate geometry during render only when no anchor animation is active
  // (animation state is idle).
  if (!isAnimatingRef.current) {
    latestGeometryRef.current = calculateGeometry(true);
  }

  const geometry = latestGeometryRef.current;

  return (
    <>
      <path
        ref={pathRef}
        d={geometry?.path || ''}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: strokeDasharray,
          fill: 'none',
          vectorEffect: 'non-scaling-stroke',
        }}
        key={`edge-path-${source.id}-${target.id}`}
        markerStart={doubleHeaded ? `url(#${arrowMarkerId})` : undefined}
        markerEnd={`url(#${arrowMarkerId})`}
      />
      {/* Injected decoration rides the SAME path, in the SAME draw context. */}
      {decorateEdge &&
        geometry &&
        decorateEdge({
          path: geometry.path,
          pathRef,
          meta: source.meta,
          sourceId: source.id,
          targetId: target.id,
        })}
      {arrowLabel && geometry && (
        <EdgeLabel
          key={`edge-label-${source.id}-${target.id}`}
          x={geometry.label.x}
          y={geometry.label.y}
          dynamicRef={edgeLabelSyncHandle}
          onLabelClick={onClickCallback}
          surfaceContentRef={surfaceContentRef}
        >
          {arrowLabel}
        </EdgeLabel>
      )}
    </>
  );
};
