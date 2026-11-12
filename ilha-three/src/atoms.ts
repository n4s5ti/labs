import * as THREE from "three";

import { createContext } from "ilha";

import type { EventManager } from "./events.ts";
import type { Frameloop, RenderLoop } from "./loop.ts";

/** Size of the drawing buffer in CSS pixels plus derived viewport. */
export interface RootSize {
  width: number;
  height: number;
  top: number;
  left: number;
}

/**
 * Per-Canvas root state (R3F `RootState` parity, held in ilha context
 * instead of zustand). Created imperatively by `Canvas`/`createRoot`;
 * components read it with `useThree`.
 */
export interface RootState {
  /** Mount state machine: open -> closing -> disposed. */
  readonly status: "open" | "closing" | "disposed";
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  loop: RenderLoop;
  events: EventManager | null;
  size: RootSize;
  viewport: { width: number; height: number; factor: number };
  dpr: number;
  frameloop: Frameloop;
  /** Objects carrying pointer handlers, for raycast dispatch. */
  interactive: THREE.Object3D[];
  /** Attached-property targets by attach key, for disposal on replace. */
  attached: Map<string, THREE.Object3D>;
  invalidate: () => void;
  advance: (timestamp: number, manual?: boolean) => void;
  setSize: (width: number, height: number) => void;
  setDpr: (dpr: number) => void;
  setFrameloop: (mode: Frameloop) => void;
  /** Release the renderer, loop, listeners and the GL context. */
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
