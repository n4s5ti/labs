import "./three-types.ts";

export {
  RootContext,
  registerRootState,
  rootStateOf,
  unregisterRootState,
} from "./atoms.ts";
export type { RootSize, RootState } from "./atoms.ts";
export { extend, getCatalogue, resolveConstructor } from "./catalogue.ts";
export type { Catalogue, ThreeConstructor } from "./catalogue.ts";
export {
  Canvas,
  bootRoot,
  createRoot,
} from "./canvas.tsx";
export type {
  CameraOptions,
  CanvasProps,
  ReconcilerRoot,
} from "./canvas.tsx";
export { disposeObject, markNoDispose } from "./dispose.ts";
export {
  computePointer,
  createPointerEvents,
  findEventObject,
  normalizeEventName,
  unprojectPointer,
} from "./events.ts";
export type {
  EventManager,
  PointerEventState,
  ThreeDomEvent,
  ThreeEvent,
} from "./events.ts";
export { useFrame, useGraph, useInstanceHandle, useThree } from "./hooks.ts";
export type { FrameSubscription } from "./loop.ts";
export { useLoader } from "./hooks.ts";
export { cachedLoad } from "./loaders.ts";
export type { AsyncLoader, LoaderOptions } from "./loaders.ts";
export { createLoop } from "./loop.ts";
export type { FrameState, Frameloop, RenderEffect, RenderLoop } from "./loop.ts";
export {
  adoptScene,
  createThreeElement,
  createThreeRenderer,
  createThreeText,
  isTextPlaceholder,
  resolveTarget,
  setThreeProp,
  threeOps,
} from "./reconciler-three.ts";
export type { ThreeHostObject, ThreeNode } from "./reconciler-three.ts";
export type { PrimitiveProps, ThreeElementProps } from "./three-types.ts";
