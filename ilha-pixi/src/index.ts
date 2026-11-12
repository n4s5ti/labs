import "./pixi-types.ts";

export {
  RootContext,
  registerRootState,
  rootStateOf,
  unregisterRootState,
} from "./atoms.ts";
export type { RootSize, RootState } from "./atoms.ts";
export { extend, getCatalogue, parseComponentType, resolveConstructor } from "./catalogue.ts";
export type { Catalogue, PixiConstructor } from "./catalogue.ts";
export {
  Canvas,
  bootRoot,
  createRoot,
} from "./canvas.tsx";
export type { CanvasProps, ReconcilerRoot } from "./canvas.tsx";
export { disposeObject, markNoDispose } from "./dispose.ts";
export type { PixiDisposeOptions } from "./dispose.ts";
export {
  isPixiEventProp,
  PIXI_EVENT_PROPS,
  resetEventWarnings,
  warnOnLowercaseEventProp,
} from "./events.ts";
export type { PixiEvent } from "./events.ts";
export { useApplication, useFrame, useInstanceHandle, useThree, useTick } from "./hooks.ts";
export type { ApplicationState, TickerCallback, TickOptions } from "./hooks.ts";
export { useLoader } from "./hooks.ts";
export { cachedLoad } from "./loaders.ts";
export type { AsyncLoader, LoaderOptions } from "./loaders.ts";
export { createLoop } from "./loop.ts";
export type { FrameState, Frameloop, RenderEffect, RenderLoop } from "./loop.ts";
export {
  adoptStage,
  bindPixiEvents,
  createPixiElement,
  createPixiRenderer,
  createPixiText,
  isTextPlaceholder,
  releaseAttached,
  resolveTarget,
  setPixiProp,
  syncEventMode,
} from "./reconciler-pixi.ts";
export type { PixiHostObject, PixiNode } from "./reconciler-pixi.ts";
export type { PixiElementProps, PixiEventProps, PrimitiveProps } from "./pixi-types.ts";
