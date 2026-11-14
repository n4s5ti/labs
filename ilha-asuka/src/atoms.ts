// Per-root state for an asuka mount (pixi `ApplicationState` parity, held in
// ilha context instead of zustand). Created imperatively by
// `bootRoot`/`createRoot`; components read it with `useAsuka`.
import { createContext } from "ilha";

import type { SyncHost } from "./host.ts";
import type { Frameloop, RenderLoop } from "./loop.ts";
import type { AsukaElement } from "./paint.ts";

/** Logical size of the asuka root in device-independent px. */
export interface RootSize {
  width: number;
  height: number;
}

/**
 * Per-asuka-root state. The retained tree lives in `host` (Go or memory);
 * `root` is the mount element everything paints under.
 */
export interface RootState {
  /** Mount state machine: open -> closing -> disposed. */
  readonly status: "open" | "closing" | "disposed";
  host: SyncHost;
  root: AsukaElement;
  loop: RenderLoop;
  size: RootSize;
  frameloop: Frameloop;
  /** Resolves when the first commit lands. */
  ready: Promise<void>;
  /** Frames the loop has rendered (observability for demand mode). */
  frames: number;
  invalidate: () => void;
  advance: (timestamp: number, manual?: boolean) => void;
  setSize: (width: number, height: number) => void;
  setFrameloop: (mode: Frameloop) => void;
  /** Unmount the tree, stop the loop, release the root subtree. */
  dispose: () => void;
}

/** Context carrying the active asuka root state. */
export const RootContext = createContext<RootState | null>(null);

const byRuntime = new WeakMap<object, RootState>();

/** Stash the root state for a mount, so hooks can find it. */
export const registerRootState = (runtime: object, state: RootState): void => {
  byRuntime.set(runtime, state);
};

/** Forget a disposed mount's root state. */
export const unregisterRootState = (runtime: object): void => {
  byRuntime.delete(runtime);
};

/** Look up the root state for the runtime a fiber belongs to. */
export const rootStateOf = (runtime: object): RootState | undefined =>
  byRuntime.get(runtime);
