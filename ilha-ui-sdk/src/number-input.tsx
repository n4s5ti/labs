// Number input (port of `@ui-sdk/solid`'s `number-input`).
//
// The scrub-area cursor renders inline, in place, while scrubbing: Ilha has
// no portal, so a second island (and its broken context/atoms) is out. Core
// writes the text of the control itself, and the `value` in the attributes
// is where the text starts (see `startingText`).
import {
  numberInput as numberInputPrimitive,
  type NumberInputOptions,
  type NumberInputScrubAreaProps,
  type NumberInputState,
} from "@ui-sdk/core/number-input";
import { context, createContext, h, untrack } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { useControllerEntry, useControllerTarget } from "./controller-target.ts";
import { joinField, useFieldControl, useFieldControlId } from "./field-context.ts";
import {
  childOf,
  createParts,
  omit,
  renderStatic,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

const parts = createParts(numberInputPrimitive, {
  group: "div",
  increment: "button",
  decrement: "button",
});

type NumberInputContextValue = PrimitiveHandle<typeof numberInputPrimitive> & {
  field: ReturnType<typeof useFieldControl>;
};

const NumberInputContext = createContext<NumberInputContextValue | null>(null);

function useNumberInput(part: string) {
  const numberInput = context(NumberInputContext)();
  if (!numberInput) {
    throw new Error(`${part} must be used inside <NumberInput>.`);
  }
  return numberInput;
}

type DivProps = Omit<
  PartProps<"div", NumberInputState>,
  "defaultValue" | "onChange" | "onSelect"
>;

// Core writes the text of the control itself (see the module header).
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

/**
 * The root, and the hidden input that submits the number as is.
 * @stable
 */
function NumberInput(props: NumberInputOptions & DivProps) {
  const field = useFieldControl();
  const controlId = useFieldControlId();
  const numberInput = usePrimitive(numberInputPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    onValueCommit: props.onValueCommit,
    min: props.min,
    max: props.max,
    step: props.step,
    largeStep: props.largeStep,
    smallStep: props.smallStep,
    format: props.format,
    locale: props.locale,
    wheel: props.wheel,
    disabled: props.disabled || field?.disabled(),
    readOnly: props.readOnly,
    required: props.required,
    name: props.name ?? field?.name(),
    form: props.form,
    controller: props.controller,
    debug: props.debug,
    controlId,
  }));
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "onValueCommit",
    "min",
    "max",
    "step",
    "largeStep",
    "smallStep",
    "format",
    "locale",
    "wheel",
    "disabled",
    "readOnly",
    "required",
    "name",
    "form",
    "controller",
    "debug",
    "children",
  );
  // The handle with the field beside it. Its prototype keeps the handle's `state` getter live.
  const numberInputContext: NumberInputContextValue = Object.assign(
    Object.create(numberInput),
    { field },
  );
  useControllerEntry(() => props.controller, numberInputContext);
  const hidden = numberInput.slot("hidden-input");
  // `props.children` is read once: every read of a JSX children getter makes
  // the parts again.
  const children = childOf(props);
  const content = (current: NumberInputState) => (
    <>
      {typeof children === "function" && children.length > 0
        ? (children as (state: NumberInputState) => JSX.Element)(current)
        : (children as JSX.Element)}
      <input {...hidden} />
    </>
  );
  return (
    <NumberInputContext.Provider value={numberInputContext}>
      {usePart(
        numberInput,
        "root",
        undefined,
        { ...rest, children: content },
        "div",
      )}
    </NumberInputContext.Provider>
  );
}

/**
 * Holds the input and its buttons.
 * @stable
 */
const NumberInputGroup = parts.Group;

/**
 * The text field, which shows the formatted number and takes typing.
 * @stable
 */
function NumberInputControl(
  props: Omit<
    PartProps<"input", NumberInputState>,
    "value" | "defaultValue" | "children" | "readonly"
  >,
) {
  const numberInput = useNumberInput("NumberInputControl");
  return usePart(
    numberInput,
    "control",
    undefined,
    joinField(numberInput.field, startingText(props), "input"),
    "input",
  );
}

/**
 * Steps up once, then repeats while held. Shift steps by `largeStep`.
 * @stable
 */
const NumberInputIncrement = parts.Increment;

/**
 * Steps down once, then repeats while held. Shift steps by `largeStep`.
 * @stable
 */
const NumberInputDecrement = parts.Decrement;

// What a scrub area outside its number input renders with until that mounts.
const unconnected: NumberInputState = {
  value: null,
  disabled: false,
  readOnly: false,
  required: false,
  scrubbing: false,
};

/**
 * Drag across it to change the value. It works anywhere inside the number
 * input, and outside it through `controller`, like an icon in a toolbar.
 * @stable
 */
function NumberInputScrubArea(
  props: PartProps<"span", NumberInputState> & NumberInputScrubAreaProps,
) {
  const numberInput = useControllerTarget(
    () => (props as { controller?: NumberInputOptions["controller"] }).controller,
    context(NumberInputContext)(),
  );
  const rest = omit(props, "orientation", "pixelsPerStep", "controller");
  const current = numberInput();
  if (!current) {
    // Until the number input it names mounts, a scrub area outside it is a plain span.
    return renderStatic(
      "span",
      () => ({ attrs: {}, state: unconnected }),
      rest,
    );
  }
  const scrubAreaContext: NumberInputContextValue = Object.assign(
    Object.create(current),
    { field: (current as NumberInputContextValue).field ?? null },
  );
  return (
    <NumberInputContext.Provider value={scrubAreaContext}>
      {usePart(
        current,
        "scrub-area",
        () => ({
          orientation: props.orientation,
          pixelsPerStep: props.pixelsPerStep,
        }),
        rest,
        "span",
      )}
    </NumberInputContext.Provider>
  );
}

/**
 * Stands in for the mouse cursor while a scrub locks the pointer.
 * Renders inline, in place, while scrubbing (no portal).
 * @stable
 */
function NumberInputScrubAreaCursor(
  props: PartProps<"span", NumberInputState>,
) {
  const numberInput = context(NumberInputContext)();
  // A scrub area outside its number input renders before that mounts, with no cursor yet.
  if (!numberInput) {
    return null;
  }
  // Present only while scrubbing, so it isn't in the page otherwise.
  const open = numberInput.present("scrub-area-cursor");
  const element = usePart(numberInput, "scrub-area-cursor", undefined, props, "span");
  return open ? element : null;
}

export { createNumberInputController } from "@ui-sdk/core/number-input";
export type {
  NumberInputApi,
  NumberInputButtonProps,
  NumberInputButtonState,
  NumberInputChangeOptions,
  NumberInputController,
  NumberInputOptions,
  NumberInputPrimitive,
  NumberInputScrubAreaProps,
  NumberInputState,
  NumberInputValueChangeReason,
} from "@ui-sdk/core/number-input";

export {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
  NumberInputScrubArea,
  NumberInputScrubAreaCursor,
};
