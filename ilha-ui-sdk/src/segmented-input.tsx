// Segmented input root/segment rendering (port of `@ui-sdk/solid`'s
// `segmented-input`).
//
// Shared by the date and time inputs: the root renders every segment (or its
// children's render of `state.segments`) plus the hidden input the ISO value
// submits with. An editable segment is a text input whose starting text the
// core writes; any other segment is a span of its text.
import type { JSX } from "ilha/jsx-runtime";
import type { Primitive } from "@ui-sdk/core";
import { dateInput } from "@ui-sdk/core/date-input";
import type {
  DateInputSegmentData,
  DateInputSegmentState,
  DateInputState,
} from "@ui-sdk/core/date-input";
import { timeInput } from "@ui-sdk/core/time-input";
import type { useFieldControl } from "./field-context.ts";
import { joinField } from "./field-context.ts";
import { childOf, omit, usePart, type PartProps, type PrimitiveHandle } from "./primitive.ts";
import { startingText } from "./text-control.tsx";

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

// Either segmented primitive: the date and time inputs share segment slot
// shapes (`TimeInputSegment*` are aliases of the date ones), so one cast
// covers both at the type level; the runtime shapes already match.
type Segmented = typeof dateInput | typeof timeInput;

function renderSegment(primitive: Segmented, props: SegmentProps) {
  const dated = primitive as unknown as typeof dateInput;
  const part = () => ({ segment: props.segment, id: props.segment.key });
  const rest = omit(props, "segment");
  if (props.segment.editable) {
    return usePart(dated, "segment", part, startingText(rest), "input");
  }
  const children = childOf(rest);
  const text = {
    ...rest,
    get children() {
      return children ?? ((state: DateInputSegmentState) => state.text);
    },
  };
  return usePart(dated, "segment", part, text as never, "span");
}

function renderRoot(
  handle: PrimitiveHandle<Primitive>,
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

export { renderRoot, renderSegment, type RootProps, type SegmentProps, type Segmented };
