// Popover (port of `@ui-sdk/solid`'s `popover`).
//
// The panel renders inline, in place, while its slot is present: Ilha has no
// portal, so a second island (and its broken context/atoms) is out. The
// `container` option is accepted and ignored for the same reason. Ancestor
// overflow or stacking contexts clip it; that is the documented tradeoff.
import {
  popover as popoverPrimitive,
  type PopoverContentProps,
  type PopoverContentState,
  type PopoverOptions,
  type PopoverShortcutProps,
  type PopoverShortcutState,
  type PopoverTriggerProps,
  type PopoverTriggerState,
} from "@ui-sdk/core/popover";
import { atom, context, createContext } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import {
  useControllerEntry,
  useControllerTarget,
} from "./controller-target.ts";
import {
  childOf,
  createParts,
  omit,
  providePrimitive,
  renderStatic,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

type PopoverContextValue = PrimitiveHandle<typeof popoverPrimitive>;

const parts = createParts(popoverPrimitive, {
  title: "h2",
  description: "p",
  close: "button",
  arrow: "div",
});

// The popover, for the parts that may find it through a controller.
const PopoverContext = createContext<PopoverContextValue | null>(null);
// The trigger a PopoverShortcut sits in: its shortcut, and the popover it opens. A trigger
// connected through a controller sits outside the popover, so its popover comes from here.
const TriggerContext = createContext<{
  shortcut: () => string | undefined;
  popover: () => PopoverContextValue | undefined;
} | null>(null);

let nextPopoverId = 0;

function usePopover() {
  const popover = context(PopoverContext)();
  if (!popover) {
    throw new Error("Popover parts must be used inside <Popover>.");
  }
  return popover;
}

/**
 * The props of `Popover`.
 * @stable
 */
type PopoverProps = PopoverOptions & { children?: JSX.Element };

/**
 * Rich content in a floating panel, opened from a button. Put its trigger and content inside.
 * @stable
 */
function Popover(props: PopoverProps) {
  const options = omit(props, "children", "container");
  const popover = usePrimitive(popoverPrimitive, () => ({ ...options }));
  useControllerEntry(() => props.controller, popover);
  return providePrimitive(popover, () => (
    <PopoverContext.Provider value={popover}>
      {childOf(props) as JSX.Element}
    </PopoverContext.Provider>
  ));
}

type TriggerPartProps = Omit<
  PartProps<"button", PopoverTriggerState>,
  "value" | "onChange"
> &
  PopoverTriggerProps;

/**
 * The button that opens the popover. A trigger outside the popover connects through `controller`.
 * @stable
 */
function PopoverTrigger(props: TriggerPartProps) {
  const popover = useControllerTarget(
    () => (props as { controller?: PopoverOptions["controller"] }).controller,
    context(PopoverContext)(),
  );
  const rest = omit(
    props,
    "disabled",
    "focusableWhenDisabled",
    "payload",
    "shortcut",
    "controller",
  );
  // Made once: a new id each render would make a new trigger part each render
  // (core keys parts by id), resubscribing forever.
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextPopoverId += 1)}`, {
    snapshot: false,
  });
  const shortcut = () => props.shortcut;
  const current = popover();
  return (
    <TriggerContext.Provider value={{ shortcut, popover }}>
      {!current
        // Until the popover it names mounts, a trigger outside the popover is a plain button.
        ? renderStatic(
          "button",
          () => ({
            attrs: {},
            state: { open: false, disabled: !!props.disabled },
          }),
          {
            ...rest,
            type: "button",
            get disabled() {
              return props.disabled && !props.focusableWhenDisabled;
            },
            get "aria-disabled"() {
              return (
                (props.disabled && props.focusableWhenDisabled) || undefined
              );
            },
          },
        )
        : (() => {
          const id = idBox();
          const trigger = () => ({
            id,
            disabled: props.disabled,
            focusableWhenDisabled: props.focusableWhenDisabled,
            payload: props.payload,
            shortcut: props.shortcut,
          });
          return usePart(current, "trigger", trigger, rest, "button");
        })()}
    </TriggerContext.Provider>
  );
}

/**
 * The panel itself, positioned against its trigger, named by its title and described by its description.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function PopoverContent<Payload = unknown>(
  props: PartProps<"div", PopoverContentState<Payload>> & PopoverContentProps,
) {
  const popover = usePopover();
  const content = () => ({
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
    initialFocus: props.initialFocus,
    finalFocus: props.finalFocus,
    keepMounted: props.keepMounted,
  });
  const rest = omit(
    props,
    "side",
    "align",
    "sideOffset",
    "alignOffset",
    "collisionPadding",
    "arrowPadding",
    "anchor",
    "initialFocus",
    "finalFocus",
    "keepMounted",
    "container",
  );
  const open = popover.present("content", content);
  const element = usePart(popover, "content", content, rest, "div");
  return open ? element : null;
}

/**
 * The popover's title, which names it. A level 2 heading by default.
 * @stable
 */
const PopoverTitle = parts.Title;

/**
 * Describes the popover while it's rendered. A paragraph by default.
 * @stable
 */
const PopoverDescription = parts.Description;

/**
 * A button that closes the popover.
 * @stable
 */
const PopoverClose = parts.Close;

/**
 * An arrow on the panel's edge that points at its trigger.
 * @stable
 */
const PopoverArrow = parts.Arrow;

/**
 * Shows a trigger's shortcut, like `⌘I`, inside the trigger. Hidden from screen readers, which hear `aria-keyshortcuts`.
 * @stable
 */
function PopoverShortcut(
  props: PartProps<"span", PopoverShortcutState> & PopoverShortcutProps,
) {
  const trigger = context(TriggerContext)();
  const popoverCtx = context(PopoverContext)();
  if (!popoverCtx && !trigger) {
    throw new Error("Popover parts must be used inside <Popover>.");
  }
  // A trigger outside the popover finds it through its controller only once
  // mounted, so inside one whose popover hasn't mounted yet, there's no
  // shortcut to show, as on the server.
  const popover = popoverCtx ?? trigger?.popover();
  if (!popover) {
    return null;
  }
  const shortcut = () => ({ shortcut: props.shortcut ?? trigger?.shortcut() });
  const kids = childOf(props);
  const rest = {
    ...omit(props, "shortcut"),
    get children() {
      return kids ?? ((state: PopoverShortcutState) => state.text);
    },
  };
  return usePart(popover, "shortcut", shortcut, rest, "span");
}

export { createPopoverController } from "@ui-sdk/core/popover";
export type {
  PopoverApi,
  PopoverArrowState,
  PopoverContentProps,
  PopoverContentState,
  PopoverController,
  PopoverDismissReason,
  PopoverFinalFocus,
  PopoverInitialFocus,
  PopoverOpenChangeReason,
  PopoverOptions,
  PopoverPayloadChangeReason,
  PopoverPrimitive,
  PopoverShortcutProps,
  PopoverShortcutState,
  PopoverTriggerProps,
  PopoverTriggerState,
} from "@ui-sdk/core/popover";

export {
  Popover,
  PopoverArrow,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  type PopoverProps,
  PopoverShortcut,
  PopoverTitle,
  PopoverTrigger,
};
