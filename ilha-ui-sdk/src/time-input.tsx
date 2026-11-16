// Time input (port of `@ui-sdk/solid`'s `time-input`).
//
// The root renders every segment the locale orders — hour, minute, day
// period — plus the hidden input the ISO value submits with. Segments you
// type in keep what you typed; the root's segment rendering is shared with
// the date input through `segmented-input`.
import { timeInput as timeInputPrimitive } from "@ui-sdk/core/time-input";
import type { TimeInputOptions } from "@ui-sdk/core/time-input";
import { useFieldControl } from "./field-context.ts";
import { omit, usePrimitive } from "./primitive.ts";
import {
  renderRoot,
  renderSegment,
  type RootProps,
  type SegmentProps,
} from "./segmented-input.tsx";

/**
 * A time of day typed segment by segment, submitted as an ISO string under
 * `name`. Without children it renders every segment; its children can be a
 * function of its state that renders `state.segments`.
 * @stable
 */
function TimeInput(props: TimeInputOptions & RootProps) {
  const field = useFieldControl();
  const handle = usePrimitive(timeInputPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    granularity: props.granularity,
    hourCycle: props.hourCycle,
    min: props.min,
    max: props.max,
    locale: props.locale,
    disabled: props.disabled || field?.disabled(),
    readOnly: props.readOnly,
    required: props.required,
    name: props.name ?? field?.name(),
    form: props.form,
    controller: props.controller,
  }));
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "granularity",
    "hourCycle",
    "min",
    "max",
    "locale",
    "disabled",
    "readOnly",
    "required",
    "name",
    "form",
    "controller",
  );
  return renderRoot(handle, field, rest, TimeInputSegment);
}

/**
 * One time segment: hour, minute, second, fractional second or day period,
 * typed in place.
 * @stable
 */
function TimeInputSegment(props: SegmentProps) {
  return renderSegment(timeInputPrimitive, props);
}

export { createTimeInputController } from "@ui-sdk/core/time-input";
export type {
  HourCycle,
  TimeInputApi,
  TimeInputChangeOptions,
  TimeInputController,
  TimeInputGranularity,
  TimeInputOptions,
  TimeInputPrimitive,
  TimeInputSegmentData,
  TimeInputSegmentProps,
  TimeInputSegmentState,
  TimeInputSegmentType,
  TimeInputState,
  TimeInputValueChangeReason,
} from "@ui-sdk/core/time-input";

export { TimeInput, TimeInputSegment };
