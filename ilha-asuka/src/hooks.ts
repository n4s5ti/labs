// Hooks for asuka roots.
//
// `useAsuka` reads the active root state (throws outside `<AsukaRoot>`);
// `useHost` returns its retained host. `useFrame` subscribes to the
// demand-by-default loop (priority > 0 takes over the render pass, R3F
// parity); `useTick` is the raw subscription with the same lifecycle.
// Stable across re-renders; each subscription removes itself once its fiber
// closes.
import { atom, context } from "ilha";
import { getFiber } from "ilha/renderer";
import type { FiberLocal } from "ilha/renderer";

import { RootContext } from "./atoms.ts";
import type { RootState } from "./atoms.ts";
import type { SyncHost } from "./host.ts";
import type { FrameState } from "./loop.ts";
import { useLoader } from "./loaders.ts";

/** Read the active asuka root state (throws outside `<AsukaRoot>`). */
export const useAsuka = (): RootState => {
  const state = context(RootContext)();
  if (state === null) {
    throw new Error("useAsuka must be used inside an <AsukaRoot> component.");
  }
  return state;
};

/** Read the retained host for the active asuka root. */
export const useHost = (): SyncHost => useAsuka().host;

/**
 * Subscribe to the render loop. `priority > 0` takes over rendering
 * (the automatic flush is skipped while such a subscriber exists).
 * Stable across re-renders; unsubscribes itself once the fiber closes.
 */
export const useFrame = (
  callback: (state: RootState, delta: number) => void,
  priority = 0,
): void => {
  const store = useAsuka();
  const fiber: FiberLocal = getFiber();
  const latest = { callback };
  const slot = atom.lazy(
    () => {
      const subscription = {
        callback: (frame: FrameState, delta: number): void => {
          if (fiber.closed) {
            unsubscribe();
            return;
          }
          latest.callback(store, delta);
          void frame;
        },
        priority,
        ref: {},
      };
      const unsubscribe = store.loop.subscribe(subscription);
      return subscription;
    },
    { snapshot: false },
  );
  const subscription = slot();
  subscription.priority = priority;
  latest.callback = callback;
};

/**
 * Raw loop subscription (`useTick` parity). Same lifecycle as `useFrame`
 * with priority 0; prefer `useFrame` for render passes.
 */
export const useTick = (
  callback: (state: FrameState, delta: number) => void,
): void => {
  const store = useAsuka();
  const fiber: FiberLocal = getFiber();
  const latest = { callback };
  const slot = atom.lazy<{ callback: (frame: FrameState, delta: number) => void; priority: number }>(
    () => {
      const subscription = {
        callback: (frame: FrameState, delta: number): void => {
          if (fiber.closed) {
            unsubscribe();
            return;
          }
          latest.callback(frame, delta);
        },
        priority: 0,
        ref: {},
      };
      const unsubscribe = store.loop.subscribe(subscription);
      return subscription;
    },
    { snapshot: false },
  );
  void slot();
  latest.callback = callback;
};

/** Stable mutable ref container (escape hatch for imperative handles). */
export const useInstanceHandle = <T>(): { current: T | null } =>
  atom.lazy<{ current: T | null }>(() => ({ current: null }), {
    snapshot: false,
  })();

export { useLoader };
