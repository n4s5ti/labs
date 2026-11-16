// Scroll area (port of `@ui-sdk/solid`'s `scroll-area`).
//
// The thumb of each orientation is keyed by it, so a horizontal and a
// vertical scrollbar keep their own thumbs.
import {
  scrollArea as scrollAreaPrimitive,
  type ScrollAreaScrollbarProps,
  type ScrollAreaScrollbarState,
  type ScrollAreaThumbState,
} from "@ui-sdk/core/scroll-area";
import { context, createContext } from "ilha";
import {
  createParts,
  omit,
  usePart,
  type PartProps,
} from "./primitive.ts";

const parts = createParts(scrollAreaPrimitive, {
  root: "div",
  viewport: "div",
  content: "div",
  corner: "div",
  "scroll-to-end": "button",
});

// The orientation a scrollbar and its thumb share.
const OrientationContext = createContext<"horizontal" | "vertical">("vertical");

/**
 * A viewport with its own scrollbars, which stay still while the content
 * scrolls under them.
 * @stable
 */
const ScrollArea = parts.Root;

/**
 * What scrolls: the scroll container, sized by its content.
 * @stable
 */
const ScrollAreaViewport = parts.Viewport;

/**
 * The content that scrolls, in the viewport.
 * @stable
 */
const ScrollAreaContent = parts.Content;

/**
 * One scrollbar, in an orientation of its own.
 * @stable
 */
function ScrollAreaScrollbar(
  props: ScrollAreaScrollbarProps & PartProps<"div", ScrollAreaScrollbarState>,
) {
  const orientation = props.orientation ?? "vertical";
  const rest = omit(props, "orientation");
  return (
    <OrientationContext.Provider value={orientation}>
      {usePart(
        scrollAreaPrimitive,
        "scrollbar",
        () => ({ id: orientation, orientation }),
        rest,
        "div",
      )}
    </OrientationContext.Provider>
  );
}

/**
 * The thumb that drags its scrollbar's viewport. Sits in its scrollbar.
 * @stable
 */
function ScrollAreaThumb(props: PartProps<"div", ScrollAreaThumbState>) {
  const orientation = context(OrientationContext)();
  return usePart(
    scrollAreaPrimitive,
    "thumb",
    () => ({ id: orientation, orientation }),
    props,
    "div",
  );
}

/**
 * Where a horizontal and a vertical scrollbar meet.
 * @stable
 */
const ScrollAreaCorner = parts.Corner;

/**
 * A button that scrolls to the end. Shown while not sticking to it.
 * @stable
 */
const ScrollAreaScrollToEnd = parts.ScrollToEnd;

export { createScrollAreaController } from "@ui-sdk/core/scroll-area";
export type {
  ScrollAreaController,
  ScrollAreaOptions,
  ScrollAreaPrimitive,
  ScrollAreaScrollbarProps,
  ScrollAreaScrollbarState,
  ScrollAreaScrollOptions,
  ScrollAreaScrollToEndState,
  ScrollAreaState,
  ScrollAreaThumbState,
  ScrollAreaType,
} from "@ui-sdk/core/scroll-area";

export {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaCorner,
  ScrollAreaScrollbar,
  ScrollAreaScrollToEnd,
  ScrollAreaThumb,
  ScrollAreaViewport,
};
