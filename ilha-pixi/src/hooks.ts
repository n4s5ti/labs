import { Application } from "pixi.js";
import type { Ticker } from "pixi.js";

import { atom, context } from "ilha";
import { getFiber } from "ilha/renderer";
import type { FiberLocal } from "ilha/renderer";

import { RootContext } from "./atoms.ts";
import type { RootState } from "./atoms.ts";
import type { FrameState } from "./loop.ts";
import { useLoader } from "./loaders.ts";

/** Read the active Canvas root state (throws outside `<Canvas>`). */
export const useThree = (): RootState => {
  const state = context(RootContext)();
  if (state === null) {
    throw new Error("useThree must be used inside a <Canvas> component.");
  }
  return state;
};

/** Application handle returned by `useApplication`. */
export interface ApplicationState {
  app: Application;
  /** True once `app.init()` resolved (always true inside `<Canvas>`). */
  isInitialised: boolean;
  /** True while `app.init()` is still in flight. */
  isInitialising: boolean;
  /** Tear down the application (two-arg `app.destroy` parity). */
  destroy: (
    rendererDestroyOptions?: Parameters<Application["destroy"]>[0],
    destroyOptions?: Parameters<Application["destroy"]>[1],
  ) => void;
}

/**
 * Read the pixi `Application` for the active Canvas. Child-only: throws
 * outside `<Canvas>`, and guards against a foreign object in context.
 */
export const useApplication = (): ApplicationState => {
  const state = useThree();
  if (!(state.app instanceof Application)) {
    throw new Error("useApplication must be used inside a <Canvas> component.");
  }
  const app = state.app;
  return {
    app,
    destroy: (rendererDestroyOptions, destroyOptions) => {
      app.destroy(rendererDestroyOptions, destroyOptions);
    },
    isInitialised: true,
    isInitialising: false,
  };
};

/**
 * Subscribe to the render loop. `priority > 0` takes over rendering
 * (the automatic `app.render` is skipped while such a subscriber exists).
 * Stable across re-renders; unsubscribes itself once the fiber closes.
 */
export const useFrame = (
  callback: (state: RootState, delta: number) => void,
  priority = 0,
): void => {
  const store = useThree();
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

/** A raw ticker listener. */
export type TickerCallback = (ticker: Ticker) => void;

/** Object form accepted by `useTick`. */
export interface TickOptions {
  callback: TickerCallback;
  context?: unknown;
  /** When `false`, the listener is removed; re-added when `true`. */
  isEnabled?: boolean;
  priority?: number;
}

/**
 * Subscribe to the pixi ticker (`ticker.add/remove` parity). The callback
 * identity is stable across re-renders — only `latest` is swapped — and
 * the listener removes itself once the fiber closes.
 */
export const useTick = (arg: TickerCallback | TickOptions): void => {
  const store = useThree();
  const fiber: FiberLocal = getFiber();
  const opts: TickOptions =
    typeof arg === "function" ? { callback: arg } : arg;
  const slot = atom.lazy(
    () => {
      const record = {
        added: false,
        callback: opts.callback,
        context: opts.context,
        priority: opts.priority,
        tick: (ticker: Ticker): void => {
          if (fiber.closed) {
            store.ticker.remove(record.tick);
            record.added = false;
            return;
          }
          record.callback(ticker);
        },
      };
      return record;
    },
    { snapshot: false },
  );
  const record = slot();
  record.callback = opts.callback;
  const enabled = opts.isEnabled ?? true;
  if (!enabled && record.added) {
    store.ticker.remove(record.tick);
    record.added = false;
  } else if (enabled && !record.added) {
    store.ticker.add(record.tick, record.context, record.priority);
    record.added = true;
  }
};

/** Stable mutable ref container (escape hatch for imperative handles). */
export const useInstanceHandle = <T>(): { current: T | null } =>
  atom.lazy<{ current: T | null }>(() => ({ current: null }), {
    snapshot: false,
  })();

export { useLoader };
