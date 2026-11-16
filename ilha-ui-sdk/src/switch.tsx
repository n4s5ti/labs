// Switch (port of `@ui-sdk/solid`'s `switch`).
import {
  switchPrimitive,
  type SwitchOptions,
  type SwitchState,
} from "@ui-sdk/core/switch";
import {
  joinField,
  useFieldControl,
  type ButtonControlProps,
} from "./field-context.ts";
import { createParts, omit, usePart, usePrimitive } from "./primitive.ts";

const parts = createParts(switchPrimitive, { thumb: "span" });

/**
 * A control that turns a setting on or off, with the hidden native input that takes part in the form.
 * @stable
 */
function Switch(props: SwitchOptions & ButtonControlProps<SwitchState>) {
  const field = useFieldControl();
  const control = usePrimitive(switchPrimitive, () => ({
    checked: props.checked,
    controller: props.controller,
    debug: props.debug,
    defaultChecked: props.defaultChecked,
    disabled: props.disabled || field?.disabled(),
    form: props.form,
    name: props.name ?? field?.name(),
    onCheckedChange: props.onCheckedChange,
    readOnly: props.readOnly,
    required: props.required,
    value: props.value,
  }));
  const rest = omit(
    props,
    "checked",
    "defaultChecked",
    "onCheckedChange",
    "disabled",
    "readOnly",
    "required",
    "name",
    "value",
    "form",
    "controller",
    "debug",
  );
  const input = control.slot("input");
  return (
    <>
      {usePart(control, "root", undefined, joinField(field, rest, "button"), "button")}
      <input {...input} />
    </>
  );
}

/**
 * The thumb that slides along the switch as it turns on or off.
 * @stable
 */
const SwitchThumb = parts.Thumb;

export { createSwitchController } from "@ui-sdk/core/switch";
export type {
  SwitchApi,
  SwitchCheckedChangeReason,
  SwitchController,
  SwitchOptions,
  SwitchPrimitive,
  SwitchState,
  SwitchThumbState,
} from "@ui-sdk/core/switch";

export { Switch, SwitchThumb };
