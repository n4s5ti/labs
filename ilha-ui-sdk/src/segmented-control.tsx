// Segmented control (port of `@ui-sdk/solid`'s `segmented-control`).
//
// One value picked from segments in a row: each item is a radio and the
// hidden input that submits the value, with an indicator behind the checked
// one.
import {
  segmentedControl as segmentedControlPrimitive,
  type SegmentedControlItemProps,
  type SegmentedControlItemState,
  type SegmentedControlOptions,
  type SegmentedControlState,
} from "@ui-sdk/core/segmented-control";
import { joinField, useFieldControl } from "./field-context.ts";
import {
  createParts,
  omit,
  usePart,
  usePrimitive,
  type PartProps,
} from "./primitive.ts";

const parts = createParts(segmentedControlPrimitive, { indicator: "span" });

/**
 * One value picked from segments in a row. `T` is inferred from `value`,
 * `defaultValue` or `onValueChange`.
 * @stable
 */
function SegmentedControl<T extends string = string>(
  props: SegmentedControlOptions<T> &
    Omit<PartProps<"div", SegmentedControlState>, "onChange" | "onSelect">,
) {
  const field = useFieldControl();
  // Typed loosely: the union `T` infers is too large for `omit`.
  const loose = props as SegmentedControlOptions<any>;
  const handle = usePrimitive(segmentedControlPrimitive, () => ({
    value: loose.value,
    defaultValue: loose.defaultValue,
    onValueChange: loose.onValueChange,
    disabled: props.disabled || field?.disabled(),
    readOnly: props.readOnly,
    required: props.required,
    name: props.name ?? field?.name(),
    form: props.form,
    loop: props.loop,
    orientation: props.orientation,
    controller: loose.controller,
  }));
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "disabled",
    "readOnly",
    "required",
    "name",
    "form",
    "loop",
    "orientation",
    "controller",
  );
  return usePart(
    handle,
    "root",
    undefined,
    joinField(field, rest, "div"),
    "div",
  );
}

/**
 * One segment: a radio and the hidden input that submits the value.
 * @stable
 */
function SegmentedControlItem(props: Omit<PartProps<"button", SegmentedControlItemState>, "value" | "onSelect"> & SegmentedControlItemProps) {
  const item = () => ({ value: props.value, disabled: props.disabled });
  const rest = omit(props, "value", "disabled");
  return (
    <>
      {usePart(segmentedControlPrimitive, "item", item, rest, "button")}
      {usePart(segmentedControlPrimitive, "input", item, {}, "input")}
    </>
  );
}

/**
 * The marker behind the checked segment.
 * @stable
 */
const SegmentedControlIndicator = parts.Indicator;

export { createSegmentedControlController } from "@ui-sdk/core/segmented-control";
export type {
  SegmentedControlApi,
  SegmentedControlChangeOptions,
  SegmentedControlController,
  SegmentedControlIndicatorState,
  SegmentedControlItemProps,
  SegmentedControlItemState,
  SegmentedControlOptions,
  SegmentedControlOrientation,
  SegmentedControlPrimitive,
  SegmentedControlState,
  SegmentedControlValueChangeReason,
} from "@ui-sdk/core/segmented-control";

export { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem };
