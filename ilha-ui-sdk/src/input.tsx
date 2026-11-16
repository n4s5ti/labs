// Input (port of `@ui-sdk/solid`'s `input`).
//
// Core writes the text of the control itself; the `value` in the attributes
// is where the text starts. A controlled value stays the live `value`, while
// an uncontrolled one becomes `defaultValue`, so re-renders never overwrite
// what the user typed since.
import {
  input as inputPrimitive,
  inputGroup,
  type InputGroupOptions,
  type InputGroupState,
  type InputOptions,
  type InputState,
} from "@ui-sdk/core/input";
import { untrack } from "ilha";
import { joinField, useFieldControl } from "./field-context.ts";
import {
  createParts,
  omit,
  usePart,
  usePrimitive,
  type PartProps,
} from "./primitive.ts";

const groupParts = createParts(inputGroup, { clear: "button" });

// Props an input takes that the part replaces.
type Native<Tag extends "input" | "textarea", State> = Omit<
  PartProps<Tag, State>,
  "value" | "defaultValue" | "onSelect"
>;

// A boolean attribute: `true` and `""` set it.
const isSet = (value: unknown) =>
  value !== undefined && value !== null && value !== false;

// The states a text field's attributes follow, from its own props and its field's.
function controlProps(
  props: { disabled?: unknown; readonly?: unknown; required?: unknown },
  field: ReturnType<typeof useFieldControl>,
) {
  return () => ({
    disabled: isSet(props.disabled) || !!field?.disabled(),
    readOnly: isSet(props.readonly),
    required: isSet(props.required),
  });
}

/**
 * A native <input>, wired to the Field it's in.
 * @stable
 */
function Input(props: InputOptions & Native<"input", InputState>) {
  const field = useFieldControl();
  const input = usePrimitive(inputPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    controller: props.controller,
    debug: props.debug,
  }));
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "controller",
    "debug",
  );
  const value = untrack(() => props.value);
  const element = {
    ...rest,
    name: props.name ?? field?.name(),
    ...(value === undefined
      ? { defaultValue: untrack(() => props.defaultValue) }
      : { value }),
  };
  return usePart(
    input,
    "root",
    controlProps(props, field),
    joinField(field, element, "input"),
    "input",
  );
}

/**
 * Holds an Input or Textarea with icons, text and buttons around it. Presses
 * on its text and icons focus the field.
 * @stable
 */
function InputGroup(
  props: InputGroupOptions & PartProps<"div", InputGroupState>,
) {
  const group = usePrimitive(inputGroup, () => ({ debug: props.debug }));
  return usePart(group, "group", undefined, omit(props, "debug"), "div");
}

/**
 * Empties the field in its group and focuses it. Shown while there's text to clear.
 * @stable
 */
const InputClear = groupParts.Clear;

export { createInputController } from "@ui-sdk/core/input";
export type {
  InputController,
  InputGroupOptions,
  InputGroupPrimitive,
  InputGroupState,
  InputOptions,
  InputPrimitive,
  InputProps,
  InputState,
  InputValueChangeReason,
  TextareaOptions,
  TextareaPrimitive,
  TextareaProps,
  TextareaState,
  TextareaSubmitDetails,
} from "@ui-sdk/core/input";

export { Input, InputClear, InputGroup };
