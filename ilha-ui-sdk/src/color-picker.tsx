// Color picker (port of `@ui-sdk/solid`'s `color-picker`).
import {
  colorPicker,
  type ColorPickerChannelInputProps,
  type ColorPickerState,
} from "@ui-sdk/core/color-picker";
import { atom, untrack } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { joinField, useFieldControl } from "./field-context.ts";
import {
  childOf,
  createParts,
  omit,
  usePart,
  type PartProps,
} from "./primitive.ts";

const parts = createParts(colorPicker, {
  area: "div",
  "area-canvas": "canvas",
  "area-thumb": "div",
  "eye-dropper": "button",
  root: "div",
  slider: "div",
  "slider-thumb": "div",
  swatch: "div",
  "swatch-item": "button",
  swatches: "div",
});

type InputProps = Omit<
  PartProps<"input", ColorPickerState>,
  "value" | "defaultValue" | "children" | "readonly"
>;

// Children that take the part's state are called with it. A function that
// takes nothing is a child component's accessor, and goes through as it is.
const resolve = (value: unknown, state: unknown) =>
  typeof value === "function" && (value as (...args: unknown[]) => unknown).length > 0
    ? (value as (state: unknown) => unknown)(state)
    : value;

// Core writes the text of the inputs itself, and the `value` in the
// attributes is where the text starts, for the server. On the client, writing
// it as the live value on every render would overwrite what the user typed
// since, so it becomes `defaultValue`: the `value` attribute, which a form
// reset returns to.
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
      return element;
    },
  };
}

let nextColorId = 0;

/**
 * The root: a group around the picker's parts, and the hidden input the form submits.
 * @experimental
 */
function ColorPicker(props: Record<string, any>) {
  const field = useFieldControl();
  const joined = joinField(field, props, "div");
  const root = {
    ...joined,
    get children() {
      const children = childOf(props);
      return (state: ColorPickerState) => (
        <>
          {resolve(children, state) as JSX.Element}
          <HiddenInput />
        </>
      );
    },
    get disabled() {
      return props.disabled || field?.disabled();
    },
    get name() {
      return props.name ?? field?.name();
    },
  };
  return <parts.Root {...root} />;
}

function HiddenInput() {
  return usePart(colorPicker, "hidden-input", undefined, {}, "input");
}

/**
 * A surface for two channels, `x` and `y`. Its background comes from
 * `--color-area-background` where gradients draw it, or a `ColorPickerAreaCanvas`.
 * @experimental
 */
const ColorPickerArea = parts.Area;

/**
 * The area's thumb: a slider screen readers hear as both channels.
 * @experimental
 */
const ColorPickerAreaThumb = parts.AreaThumb;

/**
 * Paints the area pixel by pixel, for channels no gradient draws, like OKLCH's
 * chroma by lightness. Colors outside the gamut stay transparent.
 * @experimental
 */
const ColorPickerAreaCanvas = parts.AreaCanvas;

/**
 * A track for one `channel`, drawn by `--color-slider-background`.
 * @experimental
 */
const ColorPickerSlider = parts.Slider;

/**
 * The slider's thumb, at `--color-slider-thumb-position`.
 * @experimental
 */
const ColorPickerSliderThumb = parts.SliderThumb;

/**
 * A text input that reads any CSS color on Enter or blur. Text that isn't
 * one goes back to the value.
 * @experimental
 */
function ColorPickerInput(props: InputProps) {
  return usePart(colorPicker, "input", undefined, startingText(props), "input");
}

/**
 * A number input for one `channel`, in the units people read it in.
 * @experimental
 */
function ColorPickerChannelInput(
  props: InputProps & ColorPickerChannelInputProps,
) {
  // Made once: a new id each render would make a new channel-input part each
  // render (core keys parts by id), resubscribing forever.
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextColorId += 1)}`, {
    snapshot: false,
  });
  const id = idBox();
  const part = () => ({ channel: props.channel, id });
  return usePart(
    colorPicker,
    "channel-input",
    part,
    startingText(omit(props, "channel")),
    "input",
  );
}

/**
 * The color itself, as `--color-picker-color`, named for screen readers.
 * @experimental
 */
const ColorPickerSwatch = parts.Swatch;

/**
 * A button that picks a color from the screen, where the browser can.
 * Elsewhere it's disabled, with `data-unsupported`.
 * @experimental
 */
const ColorPickerEyeDropper = parts.EyeDropper;

/**
 * A list of preset colors. Arrow keys move between them.
 * @experimental
 */
const ColorPickerSwatches = parts.Swatches;

/**
 * A preset color, as `--color-picker-color`. Pressing it sets the value.
 * @experimental
 */
const ColorPickerSwatchItem = parts.SwatchItem;

export { createColorPickerController } from "@ui-sdk/core/color-picker";
export type {
  Color,
  ColorChannel,
  ColorFormat,
  ColorGamut,
  ColorPickerApi,
  ColorPickerAreaProps,
  ColorPickerChangeOptions,
  ColorPickerChannelInputProps,
  ColorPickerController,
  ColorPickerOptions,
  ColorPickerPrimitive,
  ColorPickerSliderProps,
  ColorPickerSliderState,
  ColorPickerSpace,
  ColorPickerState,
  ColorPickerSwatchItemProps,
  ColorPickerSwatchItemState,
  ColorPickerValueChangeDetails,
  ColorPickerValueChangeReason,
  ColorPickerValueCommitDetails,
} from "@ui-sdk/core/color-picker";

export {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaCanvas,
  ColorPickerAreaThumb,
  ColorPickerChannelInput,
  ColorPickerEyeDropper,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  ColorPickerSwatch,
  ColorPickerSwatches,
  ColorPickerSwatchItem,
};
