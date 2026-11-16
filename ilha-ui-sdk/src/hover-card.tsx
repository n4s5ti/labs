// Hover card (port of `@ui-sdk/solid`'s `hover-card`).
//
// The card renders inline, in place, while its slot is present: Ilha has no
// portal, so a second island (and its broken context/atoms) is out. Ancestor
// overflow or stacking contexts clip it; that is the documented tradeoff.
// The `container` option is accepted and ignored for the same reason.
import {
  hoverCard as hoverCardPrimitive,
  type HoverCardContentProps,
  type HoverCardContentState,
  type HoverCardOptions,
  type HoverCardTriggerProps,
  type HoverCardTriggerState,
} from "@ui-sdk/core/hover-card";
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

type HoverCardContextValue = PrimitiveHandle<typeof hoverCardPrimitive>;

const parts = createParts(hoverCardPrimitive, { arrow: "div" });

// The card, for the parts that may find it through a controller.
const HoverCardContext = createContext<HoverCardContextValue | null>(null);

function useHoverCard() {
  const hoverCard = context(HoverCardContext)();
  if (!hoverCard) {
    throw new Error("HoverCard parts must be used inside <HoverCard>.");
  }
  return hoverCard;
}

/**
 * The props of `HoverCard`.
 * @stable
 */
type HoverCardProps = HoverCardOptions & { children?: JSX.Element };

/**
 * A preview of what a link points to, shown when the pointer rests on the link or keyboard focus stays on it.
 * @stable
 */
function HoverCard(props: HoverCardProps) {
  const options = omit(props, "children", "container");
  const hoverCard = usePrimitive(hoverCardPrimitive, () => ({ ...options }));
  useControllerEntry(() => props.controller, hoverCard);
  return providePrimitive(hoverCard, () => (
    <HoverCardContext.Provider value={hoverCard}>
      {childOf(props) as JSX.Element}
    </HoverCardContext.Provider>
  ));
}

type TriggerPartProps = PartProps<"a", HoverCardTriggerState> &
  HoverCardTriggerProps;

let nextHoverCardId = 0;

/**
 * A link by default: pressing it follows the link, and hover or focus opens the card.
 * A trigger outside the card connects through `controller`.
 * @stable
 */
function HoverCardTrigger(props: TriggerPartProps) {
  const hoverCard = useControllerTarget(
    () => (props as { controller?: HoverCardOptions["controller"] }).controller,
    context(HoverCardContext)(),
  );
  const rest = omit(props, "payload", "controller");
  // Made once: a new id each render would make a new trigger part each render
  // (core keys parts by id), resubscribing forever.
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextHoverCardId += 1)}`, {
    snapshot: false,
  });
  const current = hoverCard();
  return !current
    // Until the card it names mounts, a trigger outside the card is a plain link.
    ? renderStatic("a", () => ({ attrs: {}, state: { open: false } }), rest)
    : (() => {
      const id = idBox();
      const trigger = () => ({ id, payload: props.payload });
      return usePart(current, "trigger", trigger, rest, "a");
    })();
}

/**
 * The card itself, positioned against its trigger.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function HoverCardContent<Payload = unknown>(
  props: PartProps<"div", HoverCardContentState<Payload>> &
    HoverCardContentProps,
) {
  const hoverCard = useHoverCard();
  const content = () => ({
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
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
    "keepMounted",
    "container",
  );
  const open = hoverCard.present("content", content);
  const element = usePart(hoverCard, "content", content, rest, "div");
  return open ? element : null;
}

/**
 * An arrow on the card's edge that points at its trigger.
 * @stable
 */
const HoverCardArrow = parts.Arrow;

export { createHoverCardController } from "@ui-sdk/core/hover-card";
export type {
  HoverCardApi,
  HoverCardArrowState,
  HoverCardContentProps,
  HoverCardContentState,
  HoverCardController,
  HoverCardOpenChangeReason,
  HoverCardOptions,
  HoverCardPayloadChangeReason,
  HoverCardPrimitive,
  HoverCardTriggerProps,
  HoverCardTriggerState,
} from "@ui-sdk/core/hover-card";

export {
  HoverCard,
  HoverCardArrow,
  HoverCardContent,
  type HoverCardProps,
  HoverCardTrigger,
};
