// ilha-asuka: ilha renderer over Asuka's native-host protocol.
//
// The Go store speaks the core-to-host contract from
// github.com/egoist/asuka (`ops` batches, `layout` frames): every
// mutation is recorded into an ops.Batch that replays onto a real Asuka
// host, and layout runs Asuka's own flexbox/grid engine. `paint.ts`
// adapts a synchronous host to ilha `PaintOps`, so the same ilha views
// that render to the DOM, three.js or pixi mount as Asuka ops striving
// for host/fake parity — the step before real native widgets.
import "./asuka-types.ts";
export { FfiHost, IpcHost, MemoryHost, STYLE_KEYS } from "./host.ts";
export type { AsukaTreeNode, IpcResponse, SyncHost } from "./host.ts";
export { AsukaElement, createAsukaOps, createAsukaRenderer, elementFor } from "./paint.ts";
export type { AsukaNode } from "./paint.ts";
export type { AsukaElementProps, AsukaEventProps } from "./asuka-types.ts";
export {
  extend,
  getCatalogue,
  kindName,
  parseComponentType,
  resolveKind,
  defaultStyleFor,
} from "./catalogue.ts";
export type { Catalogue } from "./catalogue.ts";
export {
  KIND_BUTTON,
  KIND_IMAGE,
  KIND_SCROLL,
  KIND_SLIDER,
  KIND_TEXT,
  KIND_TEXTFIELD,
  KIND_TOGGLE,
  KIND_VIEW,
} from "./catalogue.ts";
export {
  adoptAsukaEvents,
  dispatchAsukaEvent,
  eventForProp,
  eventTypeFromProp,
  isAsukaEventProp,
  ASUKA_EVENTS,
  resetEventWarnings,
  warnOnLowercaseEventProp,
} from "./events.ts";
export type { AsukaEventPayload } from "./events.ts";
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
  createAsukaText,
  estimateTextSize,
  getAsukaText,
  isAsukaText,
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
  useAsuka,
  useFrame,
  useHost,
  useInstanceHandle,
  useTick,
} from "./hooks.ts";
export { bootRoot, createRoot, AsukaRoot } from "./canvas.tsx";
export type { AsukaRootProps, ReconcilerRoot } from "./canvas.tsx";
