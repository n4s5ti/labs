// Date input (port of `@ui-sdk/solid`'s `date-input`).
//
// The Solid package shares its root/segment rendering with time-input through
// `segmented-input`; time-input is out of scope for this tranche, so the two
// helpers are inlined here (unexported) instead of adding that module. Core
// writes the text of the segments itself, and the `value` in the attributes
// is where the text starts: on the client it becomes `defaultValue`, so
// re-renders never overwrite what the user typed since.
import {
  dateInput as dateInputPrimitive,
  type DateInputOptions,
  type DateInputSegmentData,
  type DateInputSegmentState,
  type DateInputState,
} from "@ui-sdk/core/date-input";
import { h, untrack } from "ilha";
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

type RootProps = Omit<
  PartProps<"div", DateInputState>,
  "defaultValue" | "onChange" | "onSelect"
>;

type SegmentProps = Omit<
  PartProps<"input", DateInputSegmentState>,
  "value" | "defaultValue" | "children" | "onSelect"
> & {
  /** The segment it shows, from the root's `segments`. */
  segment: DateInputSegmentData;
  /** The text between segments, which it shows unless it has children. Segments you type in take none. */
  children?: JSX.Element | ((state: DateInputSegmentState) => JSX.Element);
};

// A segment's key, and so whether it's typed in, never changes.
type Segmented = typeof dateInputPrimitive;

// Core writes the text of the segments itself (see the module header).
function startingText(props: Record<string, any>) {
  const render = untrack(() => props.render);
  return {
    ...props,
    render: (merged: Record<string, any>, state: unknown) => {
      const element =
        typeof document === "undefined"
          ? merged
          : { ...omit(merged, "value"), defaultValue: merged.value };
      if (typeof render === "function") {
        return render(element, state);
      }
      return h("input", element);
    },
  };
}

function renderSegment(primitive: Segmented, props: SegmentProps) {
  const part = () => ({ segment: props.segment, id: props.segment.key });
  const rest = omit(props, "segment");
  if (untrack(() => props.segment.editable)) {
    return usePart(primitive, "segment", part, startingText(rest), "input");
  }
  const children = childOf(rest);
  const text = {
    ...rest,
    get children() {
      return children ?? ((state: DateInputSegmentState) => state.text);
    },
  };
  return usePart(primitive, "segment", part, text as never, "span");
}

function renderRoot(
  handle: PrimitiveHandle<Segmented>,
  field: ReturnType<typeof useFieldControl>,
  props: RootProps,
  Segment: (props: SegmentProps) => JSX.Element,
) {
  const input = handle.slot("hidden-input");
  const hidden = <input {...input} />;
  // `props.children` is read once: every read of a JSX children getter makes the segments again.
  const children = childOf(props);
  const content = (state: DateInputState) => (
    <>
      {children === undefined ? (
        <>
          {state.segments.map((segment) => (
            <Segment key={segment.key} segment={segment} />
          ))}
        </>
      ) : typeof children === "function" ? (
        (children as (state: DateInputState) => JSX.Element)(state)
      ) : (
        (children as JSX.Element)
      )}
      {hidden}
    </>
  );
  return usePart(
    handle,
    "root",
    undefined,
    joinField(field, { ...props, children: content }, "div"),
    "div",
  );
}

/**
 * The root: a group of segments the locale orders, like month, day and year,
 * and the hidden input the ISO value submits with. Without children it renders
 * every segment; its children can be a function of its state that renders
 * `state.segments`.
 * @stable
 */
function DateInput(props: DateInputOptions & RootProps) {
  const field = useFieldControl();
  const handle = usePrimitive(dateInputPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    granularity: props.granularity,
    hourCycle: props.hourCycle,
    min: props.min,
    max: props.max,
    unavailable: props.unavailable,
    locale: props.locale,
    disabled: props.disabled || field?.disabled(),
    readOnly: props.readOnly,
    required: props.required,
    name: props.name ?? field?.name(),
    form: props.form,
    controller: props.controller,
    debug: props.debug,
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
    "unavailable",
    "locale",
    "disabled",
    "readOnly",
    "required",
    "name",
    "form",
    "controller",
    "debug",
  );
  return renderRoot(handle, field, rest, DateInputSegment);
}

/**
 * A segment, like the month: an input arrow keys step and digits fill, named
 * by its unit. The text between segments renders as a span.
 * @stable
 */
function DateInputSegment(props: SegmentProps) {
  return renderSegment(dateInputPrimitive, props);
}

export { createDateInputController } from "@ui-sdk/core/date-input";
export type {
  DateInputApi,
  DateInputChangeOptions,
  DateInputController,
  DateInputGranularity,
  DateInputOptions,
  DateInputPrimitive,
  DateInputSegmentData,
  DateInputSegmentProps,
  DateInputSegmentState,
  DateInputSegmentType,
  DateInputState,
  DateInputValueChangeReason,
  DateMatcher,
  DateMatchers,
  HourCycle,
} from "@ui-sdk/core/date-input";

export { DateInput, DateInputSegment };
