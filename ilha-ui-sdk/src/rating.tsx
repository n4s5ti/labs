// Rating (port of `@ui-sdk/solid`'s `rating`).
//
// The root renders one item per star, with the author's children (or a
// default item) in each. An item renders its radios — one per score in it,
// so a fractional step makes half stars each their own radio — after its own
// content.
import {
  rating as ratingPrimitive,
  ratingItemValues,
  type RatingItemState,
  type RatingOptions,
  type RatingState,
} from "@ui-sdk/core/rating";
import { context, createContext } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { joinField, useFieldControl } from "./field-context.ts";
import {
  childOf,
  omit,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

// The star an item is, and the step its radios split it by.
const ItemContext = createContext<{ index: number; step: () => number } | null>(
  null,
);

// The rating, for the items that score in it.
const RatingContext = createContext<PrimitiveHandle<
  typeof ratingPrimitive
> | null>(null);

function useNearestRating(): PrimitiveHandle<typeof ratingPrimitive> {
  const handle = context(RatingContext)();
  if (!handle) {
    throw new Error("RatingItem must be used inside <Rating>.");
  }
  return handle;
}

/**
 * The score, as stars. Without children it renders one item per star.
 * @stable
 */
function Rating(
  props: RatingOptions &
    Omit<PartProps<"div", RatingState>, "onChange" | "onSelect" | "children"> & {
      children?: JSX.Element | ((state: RatingState) => JSX.Element);
    },
) {
  const field = useFieldControl();
  const handle = usePrimitive(ratingPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    max: props.max,
    step: props.step,
    deselectable: props.deselectable,
    disabled: props.disabled || field?.disabled(),
    readOnly: props.readOnly,
    required: props.required,
    name: props.name ?? field?.name(),
    form: props.form,
    loop: props.loop,
    getValueLabel: props.getValueLabel,
    controller: props.controller,
  }));
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "max",
    "step",
    "deselectable",
    "disabled",
    "readOnly",
    "required",
    "name",
    "form",
    "loop",
    "getValueLabel",
    "controller",
  );
  // `props.children` is read once: every read of a JSX children getter makes the stars again.
  const children = childOf(rest);
  const max = () => props.max ?? 5;
  const step = () => props.step ?? 1;
  const content = (state: RatingState) => (
    <>
      {Array.from({ length: max() }, (_, at) => at + 1).map((index) => (
        <ItemContext.Provider key={index} value={{ index, step }}>
          {typeof children === "function"
            ? (children as (state: RatingState) => JSX.Element)(state)
            : (children ?? <RatingItem />)}
        </ItemContext.Provider>
      ))}
    </>
  );
  return (
    <RatingContext.Provider value={handle}>
      {usePart(
        handle,
        "root",
        undefined,
        joinField(field, { ...rest, children: content }, "div"),
        "div",
      )}
    </RatingContext.Provider>
  );
}

// The radio and hidden input that score an item's star.
function RatingRadio(props: { value: string }) {
  const handle = useNearestRating();
  const radio = () => ({ value: props.value });
  return (
    <>
      {usePart(handle, "radio", radio, {}, "button")}
      {usePart(handle, "input", radio, {}, "input")}
    </>
  );
}

/**
 * One star, which shows how much of the score reaches it. Holds its radios
 * after its own content.
 * @stable
 */
function RatingItem(props: PartProps<"span", RatingItemState>) {
  const item = context(ItemContext)();
  if (!item) {
    throw new Error("RatingItem must be used inside <Rating>.");
  }
  const handle = useNearestRating();
  const rest = omit(props, "children");
  const children = childOf(props);
  const radios = ratingItemValues(item.index, item.step()).map((score) => (
    <RatingRadio key={score} value={String(score)} />
  ));
  const content = (state: RatingItemState) => (
    <>
      {typeof children === "function" && (children as Function).length > 0
        ? (children as (state: RatingItemState) => JSX.Element)(state)
        : (children as JSX.Element)}
      {radios}
    </>
  );
  return usePart(
    handle,
    "item",
    () => ({ index: item.index }),
    { ...rest, children: content },
    "span",
  );
}

export { createRatingController } from "@ui-sdk/core/rating";
export type {
  RatingApi,
  RatingChangeOptions,
  RatingController,
  RatingItemProps,
  RatingItemState,
  RatingOptions,
  RatingPrimitive,
  RatingState,
  RatingValueChangeReason,
} from "@ui-sdk/core/rating";

export { Rating, RatingItem };
