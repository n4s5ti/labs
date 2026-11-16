// Resizable panels (port of `@ui-sdk/solid`'s `resizable`).
import { resizable as resizablePrimitive } from "@ui-sdk/core/resizable";
import { createParts } from "./primitive.ts";

const parts = createParts(resizablePrimitive, {
  root: "div",
  panel: "div",
  handle: "div",
});

/**
 * Panels separated by draggable handles, laid out in a row or a column.
 * @stable
 */
const Resizable = parts.Root;

/**
 * One panel, sized in pixels, percents, or shares of what's left.
 * @stable
 */
const ResizablePanel = parts.Panel;

/**
 * The draggable bar between two panels.
 * @stable
 */
const ResizableHandle = parts.Handle;

export { createResizableController, resizableStorageKey } from "@ui-sdk/core/resizable";
export type {
  ResizableApi,
  ResizableChangeOptions,
  ResizableController,
  ResizableHandleProps,
  ResizableHandleState,
  ResizableLayoutChangeDetails,
  ResizableLayoutChangeReason,
  ResizableLayoutCommitDetails,
  ResizableOptions,
  ResizablePanelProps,
  ResizablePanelState,
  ResizablePrimitive,
  ResizableSize,
  ResizableState,
  ResizableStorage,
} from "@ui-sdk/core/resizable";

export { Resizable, ResizableHandle, ResizablePanel };
