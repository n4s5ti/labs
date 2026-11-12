import type { Application, Container, Ticker } from "pixi.js";

import { createContext } from "ilha";

import type { Frameloop, RenderLoop } from "./loop.ts";

/** Size of the drawing buffer in CSS pixels plus derived viewport. */
export interface RootSize {
  width: number;
  height: number;
  top: number;
  left: number;
}

/**
 * Per-Canvas root state (@pixi/react `ApplicationState` parity, held in
 * ilha context instead of zustand). Created imperatively by
 * `Canvas`/`createRoot`; components read it with `useApplication`.
 */
export interface RootState {
  /** Mount state machine: open -> closing -> disposed. */
  readonly status: "open" | "closing" | "disposed";
  app: Application;
  stage: Container;
  ticker: Ticker;
  loop: RenderLoop;
  size: RootSize;
  viewport: { width: number; height: number; factor: number };
  dpr: number;
  frameloop: Frameloop;
  invalidate: () => void;
  advance: (timestamp: number, manual?: boolean) => void;
  setSize: (width: number, height: number) => void;
  setDpr: (dpr: number) => void;
  setFrameloop: (mode: Frameloop) => void;
  /** Release the ticker, listeners, stage subtree and the renderer. */
  dispose: () => void;
}

/** Context carrying the active Canvas root state. */
export const RootContext = createContext<RootState | null>(null);

const byRuntime = new WeakMap<object, RootState>();

/** Stash the root state for a mount, so `bindEvents` can find it. */
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
