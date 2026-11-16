// Tooltip (port of `@ui-sdk/solid`'s `tooltip`).
//
// The content renders inline, in place, while its slot is present: Ilha has
// no portal, so a second island (and its broken context/atoms) is out. The
// `container` option is accepted and ignored for the same reason. Ancestor
// overflow or stacking contexts clip it; that is the documented tradeoff.
import {
  tooltip as tooltipPrimitive,
  type TooltipContentProps,
  type TooltipContentState,
  type TooltipOptions,
  type TooltipShortcutProps,
  type TooltipShortcutState,
  type TooltipTriggerProps,
  type TooltipTriggerState,
} from "@ui-sdk/core/tooltip";
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

type TooltipContextValue = PrimitiveHandle<typeof tooltipPrimitive>;

const parts = createParts(tooltipPrimitive, { arrow: "div" });

// The tooltip, for the parts that may find it through a controller.
const TooltipContext = createContext<TooltipContextValue | null>(null);
// The trigger a TooltipShortcut sits in: its shortcut, and the tooltip it opens.
const TriggerContext = createContext<{
  tooltip: () => TooltipContextValue | undefined;
} | null>(null);

let nextTooltipId = 0;

function useTooltip() {
  const tooltip = context(TooltipContext)();
  if (!tooltip) {
    throw new Error("Tooltip parts must be used inside <Tooltip>.");
  }
  return tooltip;
}

/**
 * The props of `Tooltip`.
 * @stable
 */
type TooltipProps = TooltipOptions & { children?: JSX.Element };

/**
 * A hint that follows its trigger's shortcut: hover or focus the trigger and
 * it appears.
 * @stable
 */
function Tooltip(props: TooltipProps) {
  const options = omit(props, "children", "container");
  const tooltip = usePrimitive(tooltipPrimitive, () => ({ ...options }));
  useControllerEntry(() => props.controller, tooltip);
  return providePrimitive(tooltip, () => (
    <TooltipContext.Provider value={tooltip}>
      {childOf(props) as JSX.Element}
    </TooltipContext.Provider>
  ));
}

type TriggerPartProps = Omit<
  PartProps<"button", TooltipTriggerState>,
  "value" | "defaultValue" | "onChange"
> &
  TooltipTriggerProps;

/**
 * What the tooltip explains. A tooltip outside the tooltip connects through
 * `controller`.
 * @stable
 */
function TooltipTrigger(props: TriggerPartProps) {
  const tooltip = useControllerTarget(
    () => (props as { controller?: TooltipOptions["controller"] }).controller,
    context(TooltipContext)(),
  );
  const rest = omit(props, "payload", "controller");
  // Made once: a new id each render would make a new trigger part each render
  // (core keys parts by id), resubscribing forever.
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextTooltipId += 1)}`, {
    snapshot: false,
  });
  const current = tooltip();
  return (
    <TriggerContext.Provider value={{ tooltip }}>
      {!current
        // Until the tooltip it names mounts, a trigger outside the tooltip is a plain button.
        ? renderStatic(
          "button",
          () => ({ attrs: {}, state: { open: false } }),
          { ...rest, type: "button" },
        )
        : (() => {
          const id = idBox();
          const trigger = () => ({ id, payload: props.payload });
          return usePart(current, "trigger", trigger, rest, "button");
        })()}
    </TriggerContext.Provider>
  );
}

/**
 * The hint itself, positioned against its trigger.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function TooltipContent<Payload = unknown>(
  props: PartProps<"div", TooltipContentState<Payload>> & TooltipContentProps,
) {
  const tooltip = useTooltip();
  const content = () => ({
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
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
    "container",
  );
  const open = tooltip.present("content", content);
  const element = usePart(tooltip, "content", content, rest, "div");
  return open ? element : null;
}

/**
 * An arrow on the hint's edge that points at its trigger.
 * @stable
 */
const TooltipArrow = parts.Arrow;

/**
 * Shows a trigger's shortcut, like `⌘I`, inside the trigger. Hidden from screen readers, which hear `aria-keyshortcuts`.
 * @stable
 */
function TooltipShortcut(
  props: PartProps<"span", TooltipShortcutState> & TooltipShortcutProps,
) {
  const trigger = context(TriggerContext)();
  const tooltipContext = context(TooltipContext)();
  if (!tooltipContext && !trigger) {
    throw new Error("Tooltip parts must be used inside <Tooltip>.");
  }
  const tooltip = () => tooltipContext ?? trigger?.tooltip();
  const shortcut = () => ({ shortcut: props.shortcut });
  const children = childOf(props);
  const rest = {
    ...omit(props, "shortcut"),
    get children() {
      return children ?? ((state: TooltipShortcutState) => state.text);
    },
  };
  const current = tooltip();
  return current ? usePart(current, "shortcut", shortcut, rest, "span") : null;
}

export { createTooltipController } from "@ui-sdk/core/tooltip";
export type {
  TooltipApi,
  TooltipArrowState,
  TooltipContentProps,
  TooltipContentState,
  TooltipController,
  TooltipOpenChangeReason,
  TooltipOptions,
  TooltipPayloadChangeReason,
  TooltipPrimitive,
  TooltipShortcutProps,
  TooltipShortcutState,
  TooltipTriggerProps,
  TooltipTriggerState,
} from "@ui-sdk/core/tooltip";

export { Tooltip, TooltipArrow, TooltipContent, TooltipShortcut, TooltipTrigger, type TooltipProps };
