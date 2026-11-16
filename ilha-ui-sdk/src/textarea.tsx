// Textarea (port of `@ui-sdk/solid`'s `textarea`).
//
// A multi-line text field over the `textarea` primitive of
// `@ui-sdk/core/input`. The `Input*` controllers and types stay in
// `input.tsx`; only the component lives here, like in Solid.
import { textarea as textareaPrimitive } from "@ui-sdk/core/input";
import type { TextareaOptions, TextareaState } from "@ui-sdk/core/input";
import { joinField, useFieldControl } from "./field-context.ts";
import { usePart, usePrimitive } from "./primitive.ts";
import {
  controlProps,
  elementProps,
  type Native,
} from "./text-control.tsx";

/**
 * A multi-line text field that grows with its content when `autoResize`.
 * Controlled with `value`, uncontrolled with `defaultValue`, submitted under
 * `name`.
 * @stable
 */
function Textarea(
  props: TextareaOptions & Omit<Native<"textarea", TextareaState>, "onSubmit">,
) {
  const field = useFieldControl();
  const textarea = usePrimitive(textareaPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    controller: props.controller,
    autoResize: props.autoResize,
    onSubmit: props.onSubmit,
    submitShortcut: props.submitShortcut,
  }));
  const {
    value: _value,
    defaultValue: _default,
    onValueChange: _change,
    controller: _controller,
    autoResize: _resize,
    onSubmit: _submit,
    submitShortcut: _shortcut,
    ...rest
  } = props;
  const element = elementProps(
    rest,
    field,
    () => props.value,
    () => props.defaultValue,
  );
  return usePart(
    textarea,
    "root",
    controlProps(props, field),
    joinField(field, element, "textarea"),
    "textarea",
  );
}

export { Textarea };
