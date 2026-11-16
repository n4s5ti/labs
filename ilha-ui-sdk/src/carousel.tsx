// Carousel (port of `@ui-sdk/solid`'s `carousel`).
import {
  carousel as carouselPrimitive,
  type CarouselControlProps,
  type CarouselIndicatorGroupState,
  type CarouselIndicatorProps,
  type CarouselIndicatorState,
  type CarouselOptions,
  type CarouselPlayToggleState,
  type CarouselState,
  type CarouselStepState,
} from "@ui-sdk/core/carousel";
import { atom, context, createContext } from "ilha";
import {
  useControllerEntry,
  useControllerTarget,
} from "./controller-target.ts";
import {
  createParts,
  omit,
  renderStatic,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

type CarouselContextValue = PrimitiveHandle<typeof carouselPrimitive>;

// The carousel, for parts that may also connect from outside it through a controller.
const CarouselContext = createContext<CarouselContextValue | null>(null);

const parts = createParts(carouselPrimitive, {
  content: "div",
  item: "div",
  viewport: "div",
});

let nextCarouselId = 0;

// The carousel a part belongs to: the one its `controller` drives, from
// anywhere on the page, or else the one it's inside. Parts outside their
// carousel before it mounts render the unconnected fallback.
function useConnectedCarousel(
  controller: () => CarouselControlProps["controller"],
) {
  return useControllerTarget(controller, context(CarouselContext)());
}

/**
 * A region of slides that scroll a page at a time. Name it with `aria-label`.
 * @stable
 */
function Carousel(props: CarouselOptions & PartProps<"div", CarouselState>) {
  const carousel = usePrimitive(carouselPrimitive, () => ({
    align: props.align,
    controller: props.controller,
    debug: props.debug,
    defaultPage: props.defaultPage,
    defaultPlaying: props.defaultPlaying,
    drag: props.drag,
    dragFree: props.dragFree,
    interval: props.interval,
    loop: props.loop,
    onPageChange: props.onPageChange,
    onPageChangeComplete: props.onPageChangeComplete,
    onPlayingChange: props.onPlayingChange,
    orientation: props.orientation,
    page: props.page,
    playing: props.playing,
    skipSnaps: props.skipSnaps,
    slidesPerPage: props.slidesPerPage,
  }));
  const rest = omit(
    props,
    "page",
    "defaultPage",
    "onPageChange",
    "onPageChangeComplete",
    "playing",
    "defaultPlaying",
    "onPlayingChange",
    "interval",
    "orientation",
    "align",
    "slidesPerPage",
    "loop",
    "skipSnaps",
    "dragFree",
    "drag",
    "controller",
    "debug",
  );
  useControllerEntry(() => props.controller, carousel);
  return (
    <CarouselContext.Provider value={carousel}>
      {usePart(carousel, "root", undefined, rest, "div")}
    </CarouselContext.Provider>
  );
}

/**
 * The scrolling window onto the slides. Touch, wheels and keys scroll it natively.
 * @stable
 */
const CarouselViewport = parts.Viewport;

/**
 * The row, or column, of slides inside the viewport.
 * @stable
 */
const CarouselContent = parts.Content;

/**
 * One slide. It's labelled "1 of 5" unless it has an `aria-label`, and inert while out of view.
 * @stable
 */
const CarouselItem = parts.Item;

type StepProps = Omit<
  PartProps<"button", CarouselStepState>,
  "value" | "defaultValue" | "onChange"
> &
  CarouselControlProps;

// What a part outside its carousel renders with until that mounts.
const unconnected: CarouselStepState = { disabled: true };

// A plain button, for a part outside its carousel until that mounts.
function plainButton(props: Record<string, any>, state: object) {
  return renderStatic(
    "button",
    () => ({ attrs: {}, state }),
    { ...props, type: "button" },
  );
}

function stepPart(name: "previous" | "next", props: StepProps) {
  const carousel = useConnectedCarousel(() => props.controller)();
  const rest = omit(props, "controller");
  if (!carousel) {
    return plainButton(rest, unconnected);
  }
  return usePart(carousel, name, undefined, rest, "button");
}

/**
 * Goes to the previous page. `aria-disabled` on the first page without `loop`, where it stays focusable.
 * @stable
 */
function CarouselPrevious(props: StepProps) {
  return stepPart("previous", props);
}

/**
 * Goes to the next page. `aria-disabled` on the last page without `loop`, where it stays focusable.
 * @stable
 */
function CarouselNext(props: StepProps) {
  return stepPart("next", props);
}

/**
 * The indicators, as a tablist with one tab stop. Its children can be a function of the state.
 * @stable
 */
function CarouselIndicatorGroup(
  props: PartProps<"div", CarouselIndicatorGroupState> & CarouselControlProps,
) {
  const carousel = useConnectedCarousel(() => props.controller)();
  const rest = omit(props, "controller");
  if (!carousel) {
    return renderStatic(
      "div",
      () => ({ attrs: {}, state: { page: 1, pageCount: null } }),
      rest,
    );
  }
  return (
    <CarouselContext.Provider value={carousel}>
      {usePart(carousel, "indicator-group", undefined, rest, "div")}
    </CarouselContext.Provider>
  );
}

type IndicatorProps = Omit<
  PartProps<"button", CarouselIndicatorState>,
  "value" | "defaultValue" | "onChange"
> &
  CarouselIndicatorProps;

/**
 * Shows a page and goes to it. Indicators past the page count hide themselves.
 * @stable
 */
function CarouselIndicator(props: IndicatorProps) {
  const carousel = context(CarouselContext)();
  const rest = omit(props, "page");
  // Made once: a new id each render would make a new indicator part each
  // render (core keys parts by id), resubscribing forever.
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextCarouselId += 1)}`, {
    snapshot: false,
  });
  // In a group outside its carousel, before that mounts, it's a plain button.
  if (!carousel) {
    return plainButton(rest, {
      page: props.page ?? 0,
      selected: false,
    });
  }
  const id = idBox();
  return usePart(
    carousel,
    "indicator",
    () => ({ id, page: props.page }),
    rest,
    "button",
  );
}

/**
 * Starts and stops rotation. Label it from `playing` in its state, as the carousel pattern asks.
 * @stable
 */
function CarouselPlayToggle(
  props: Omit<
    PartProps<"button", CarouselPlayToggleState>,
    "value" | "defaultValue" | "onChange"
  > &
    CarouselControlProps,
) {
  const carousel = useConnectedCarousel(() => props.controller)();
  const rest = omit(props, "controller");
  if (!carousel) {
    return plainButton(rest, { paused: false, playing: false });
  }
  return usePart(carousel, "play-toggle", undefined, rest, "button");
}

export { createCarouselController } from "@ui-sdk/core/carousel";
export type {
  CarouselAlign,
  CarouselApi,
  CarouselContentState,
  CarouselControlProps,
  CarouselController,
  CarouselIndicatorGroupState,
  CarouselIndicatorProps,
  CarouselIndicatorState,
  CarouselItemState,
  CarouselNextState,
  CarouselOptions,
  CarouselOrientation,
  CarouselPageChangeReason,
  CarouselPageOptions,
  CarouselPlayToggleState,
  CarouselPlayingChangeReason,
  CarouselPlayingOptions,
  CarouselPreviousState,
  CarouselPrimitive,
  CarouselSlidesPerPage,
  CarouselState,
  CarouselStepState,
  CarouselViewportState,
} from "@ui-sdk/core/carousel";

export {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselNext,
  CarouselPlayToggle,
  CarouselPrevious,
  CarouselViewport,
};
