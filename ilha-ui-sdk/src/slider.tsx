// Slider (port of `@ui-sdk/solid`'s `slider`).
//
// The root appends the hidden input that submits the value after its own
// children. Each thumb carries its own hidden input, joined to the field when
// the slider holds a single value in one of its own.
import {
  slider as sliderPrimitive,
  type SliderOptions,
  type SliderState,
  type SliderThumbProps,
  type SliderThumbState,
} from "@ui-sdk/core/slider";
import { context, createContext } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import {
  joinField,
  useFieldControl,
  useFieldControlId,
} from "./field-context.ts";
import {
  childOf,
  createParts,
  omit,
  usePart,
  usePrimitive,
  type PartProps,
} from "./primitive.ts";

const parts = createParts(sliderPrimitive, {
  root: "div",
  control: "div",
  track: "div",
  indicator: "div",
  value: "output",
});

type DivProps<State> = Omit<
  PartProps<"div", State>,
  "defaultValue" | "onChange" | "onSelect"
>;

// The field a single-value slider's thumbs submit through, or null for a
// range whose thumbs submit on their own.
const ThumbFieldContext = createContext<ReturnType<typeof useFieldControl> | null>(
  null,
);

function withAfter(
  children: JSX.Element | ((state: any) => JSX.Element) | undefined,
  after: JSX.Element,
) {
  return (state: any) => [
    typeof children === "function" && (children as Function).length > 0
      ? (children as (state: any) => JSX.Element)(state)
      : (children as JSX.Element),
    after,
  ];
}

/**
 * One value, or a range of two, picked by dragging thumbs. Joins the field
 * it's in, which names it and submits its value.
 * @stable
 */
function Slider<Value extends number | number[] = number | number[]>(
  props: SliderOptions<Value> & DivProps<SliderState>,
) {
  const field = useFieldControl();
  const controlId = useFieldControlId();
  const range = () => {
    const shape = props.value ?? props.defaultValue;
    return Array.isArray(shape) && shape.length > 1;
  };
  // Typed loosely: the union `Value` infers is too large for the callbacks.
  const loose = props as SliderOptions<any>;
  const handle = usePrimitive(sliderPrimitive, () => ({
    value: loose.value,
    defaultValue: loose.defaultValue,
    onValueChange: loose.onValueChange,
    onValueCommit: loose.onValueCommit,
    min: props.min,
    max: props.max,
    step: props.step,
    largeStep: props.largeStep,
    minStepsBetweenThumbs: props.minStepsBetweenThumbs,
    orientation: props.orientation,
    disabled: props.disabled || field?.disabled(),
    readOnly: props.readOnly,
    required: props.required,
    name: props.name ?? field?.name(),
    form: props.form,
    format: props.format,
    locale: props.locale,
    controller: props.controller,
  }));
  const children = childOf(props);
  const root = {
    ...joinField(field, omit(props, "children"), "div"),
    get children() {
      return withAfter(children, <SliderInput />);
    },
    thumbInputId: controlId,
  };
  return (
    <ThumbFieldContext.Provider value={range() ? null : field}>
      {usePart(handle, "root", undefined, root, "div")}
    </ThumbFieldContext.Provider>
  );
}

// The hidden input that submits the value, after the root's children.
function SliderInput() {
  return usePart(sliderPrimitive, "input", undefined, {}, "input");
}

/**
 * The control the thumbs drag along.
 * @stable
 */
const SliderControl = parts.Control;

/**
 * The track the thumbs drag along.
 * @stable
 */
const SliderTrack = parts.Track;

/**
 * The filled part of the track, from the minimum to the value.
 * @stable
 */
const SliderIndicator = parts.Indicator;

/**
 * One thumb: drags one value, named for screen readers. Carries its own
 * hidden input, joined to the field for a single value.
 * @stable
 */
function SliderThumb(props: DivProps<SliderThumbState> & SliderThumbProps) {
  const field = context(ThumbFieldContext)();
  const index = () => props.index ?? 0;
  const thumb = () => ({ index: index(), id: String(index()) });
  const { index: _index, ...aria } = props as Record<string, any> & {
    index?: number;
  };
  const { children: _children, ...rest } = aria;
  const named = {
    get "aria-label"() {
      return aria["aria-label"];
    },
    get "aria-labelledby"() {
      return aria["aria-labelledby"];
    },
    get "aria-describedby"() {
      return aria["aria-describedby"];
    },
  };
  const input = field ? joinField(field, named, "input") : named;
  const after = usePart(sliderPrimitive, "thumb-input", thumb, input, "input");
  const children = childOf(props);
  const body = {
    ...rest,
    get children() {
      return withAfter(children, after);
    },
  };
  return usePart(sliderPrimitive, "thumb", thumb, body, "div");
}

/**
 * The value as text, for screen readers and sighted users.
 * @stable
 */
function SliderValue(props: Record<string, any>) {
  const children = childOf(props);
  return (
    <parts.Value {...props}>
      {children ?? ((state: { text: string }) => state.text)}
    </parts.Value>
  );
}

export { createSliderController } from "@ui-sdk/core/slider";
export type {
  SliderApi,
  SliderChangeOptions,
  SliderController,
  SliderOptions,
  SliderPrimitive,
  SliderState,
  SliderThumbProps,
  SliderThumbState,
  SliderValueChangeDetails,
  SliderValueChangeReason,
  SliderValueCommitDetails,
  SliderValueState,
} from "@ui-sdk/core/slider";

export {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
};
