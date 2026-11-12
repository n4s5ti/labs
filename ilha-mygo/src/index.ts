// ilha-mygo: Go retained-host bindings for ilha.
//
// Primary transport is `bun:ffi` over `go/libmygo.so` (`FfiHost`); the
// `mygo-ipc` child process (`IpcHost`) is the fallback when the shared
// library cannot load. `MemoryHost` mirrors the store semantics in pure
// TypeScript. `paint.ts` adapts a synchronous host to ilha `PaintOps`.
import "./mygo-types.ts";
export { FfiHost, IpcHost, MemoryHost } from "./host.ts";
export type { IpcResponse, MygoTreeNode, SyncHost } from "./host.ts";
export { MygoElement, createMygoOps, createMygoRenderer, elementFor } from "./paint.ts";
export type { MygoNode } from "./paint.ts";
export type { MygoElementProps, MygoEventProps } from "./mygo-types.ts";
export {
  extend,
  getCatalogue,
  parseComponentType,
  resolveKind,
} from "./catalogue.ts";
export type { Catalogue, MygoKind } from "./catalogue.ts";
export {
  adoptMygoEvents,
  dispatchMygoEvent,
  eventTypeFromProp,
  isMygoEventProp,
  MYGO_EVENT_PROPS,
  resetEventWarnings,
  warnOnLowercaseEventProp,
} from "./events.ts";
export type { MygoEventPayload } from "./events.ts";
export { createLoop } from "./loop.ts";
export type {
  FrameState,
  Frameloop,
  FrameSubscription,
  RenderEffect,
  RenderLoop,
} from "./loop.ts";
export {
  cachedLoad,
  clearLoader,
  preload,
  useLoader,
} from "./loaders.ts";
export type { AsyncLoader, LoaderOptions } from "./loaders.ts";
export {
  createMygoText,
  estimateTextSize,
  getMygoText,
  isMygoText,
  TEXT_KIND,
  TEXT_PROP,
} from "./text.ts";
export type { TextMetrics } from "./text.ts";
export {
  registerRootState,
  rootStateOf,
  RootContext,
  unregisterRootState,
} from "./atoms.ts";
export type { RootSize, RootState } from "./atoms.ts";
export { disposeObject, markNoDispose, NO_DISPOSE_PROP } from "./dispose.ts";
export {
  useFrame,
  useHost,
  useInstanceHandle,
  useMygo,
  useTick,
} from "./hooks.ts";
export { bootRoot, createRoot, MygoRoot } from "./canvas.tsx";
export type { MygoRootProps, ReconcilerRoot } from "./canvas.tsx";
