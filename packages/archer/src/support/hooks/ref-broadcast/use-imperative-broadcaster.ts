import { type RefObject, useEffect } from 'react';
import {
  type ListenerHandle,
  type BroadcasterConfig,
  augmentHandle,
  removeListenerFromHandle,
} from './broadcaster-utils';

/**
 * Subscribes a stable `listenerHandle` object to a shared ref’s imperative
 * handle. Think of it as `useImperativeHandle` + multicast.
 *
 * Lifecycle
 * 1. Mount → `augmentHandle` merges the new listener into `dynamicRef.current`.
 * 2. Cleanup (unmount or prop change) → listener is removed via
 *    `removeListenerFromHandle`.
 *
 * Because `augmentHandle` is immutable, it always returns a new handle object;
 * the hook then replaces `dynamicRef.current` with that new object.
 *
 * @typeParam T - The specific listener‑handle shape (e.g. `SyncHandle`).
 * @param dynamicRef - The shared ref object (`{ current: … }`).
 *                     All arrows and the anchor hold the same instance.
 * @param listenerHandle - A memo‑ised object whose function properties are the
 *                         callbacks for this particular arrow.
 * @param config - Which keys should be broadcast (passed straight to
 *                 `augmentHandle`).
 */
export const useImperativeBroadcaster = <T extends ListenerHandle>(
  dynamicRef: RefObject<T | null> | null | undefined,
  listenerHandle: T,
  config: BroadcasterConfig<T>,
) => {
  useEffect(() => {
    if (!dynamicRef) {
      return;
    }

    // Subscribe by augmenting the handle.
    dynamicRef.current = augmentHandle(
      dynamicRef.current,
      listenerHandle,
      config,
    );

    // Unsubscribe on cleanup by removing the listener.
    return () => {
      dynamicRef.current = removeListenerFromHandle(
        dynamicRef.current,
        listenerHandle,
        config,
      );
    };
  }, [dynamicRef, listenerHandle, config]);
};
