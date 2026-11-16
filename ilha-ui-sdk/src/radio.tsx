// Radio group (port of `@ui-sdk/solid`'s `radio`).
//
// The Solid root renders its instance through `parts.Root` with the group
// element as already-evaluated children. Ilha evaluates children eagerly, so
// the group makes its instance in its own body and shares it with the group
// element through `providePrimitive` — the same instance the radios find.
import {
  radioGroup,
  type RadioGroupOptions,
  type RadioGroupState,
  type RadioProps,
  type RadioState,
} from "@ui-sdk/core/radio";
import { context, createContext } from "ilha";
import {
  FieldContext,
  type FieldContextValue,
  joinField,
  useFieldControl,
} from "./field-context.ts";
import {
  createParts,
  omit,
  providePrimitive,
  usePart,
  usePrimitive,
  type PartProps,
} from "./primitive.ts";

const parts = createParts(radioGroup, { indicator: "span" });

// The field the group joined, so a radio joins only a field of its own.
const GroupFieldContext = createContext<FieldContextValue | null>(null);

/**
 * Radios that share one value, with one tab stop and arrow keys between them.
 * `T` is inferred from `value`, `defaultValue` or `onValueChange`.
 * @stable
 */
function RadioGroup<T extends string = string>(
  props: RadioGroupOptions<T> &
    Omit<PartProps<"div", RadioGroupState>, "onChange" | "onSelect">,
) {
  const field = useFieldControl();
  // Typed loosely: the union `T` infers is too large for `omit`.
  const loose = props as RadioGroupOptions<any>;
  const group = usePrimitive(radioGroup, () => ({
    value: loose.value,
    defaultValue: loose.defaultValue,
    onValueChange: loose.onValueChange,
    disabled: props.disabled || field?.disabled(),
    readOnly: props.readOnly,
    required: props.required,
    name: props.name ?? field?.name(),
    form: props.form,
    loop: props.loop,
    controller: loose.controller,
    debug: props.debug,
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
    "controller",
    "debug",
  );
  // The group's element joins the field it's in, which also names and disables it.
  return (
    <GroupFieldContext.Provider value={context(FieldContext)()}>
      {providePrimitive(group, () => usePart(
        group,
        "group",
        undefined,
        joinField(field, rest, "div"),
        "div",
      ))}
    </GroupFieldContext.Provider>
  );
}

/**
 * A radio and the hidden native radio that takes part in the form.
 * @stable
 */
function Radio(
  props: Omit<PartProps<"button", RadioState>, "value" | "onSelect"> &
    RadioProps,
) {
  // A radio in a field of its own is that field's control. In the group's field, the group is.
  const nearest = context(FieldContext)();
  const grouped = context(GroupFieldContext)();
  const fieldControl = useFieldControl();
  const field = nearest && nearest !== grouped ? fieldControl : null;
  const item = () => ({
    value: props.value,
    disabled: props.disabled || field?.disabled(),
  });
  const rest = omit(props, "value", "disabled");
  return (
    <>
      {usePart(
        radioGroup,
        "root",
        item,
        joinField(field, rest, "button"),
        "button",
      )}
      {usePart(radioGroup, "input", item, {}, "input")}
    </>
  );
}

/**
 * The dot inside the radio. Rendered while it's checked, or always with `keepMounted`.
 * @stable
 */
const RadioIndicator = parts.Indicator;

export { createRadioGroupController } from "@ui-sdk/core/radio";
export type {
  RadioGroupApi,
  RadioGroupChangeOptions,
  RadioGroupController,
  RadioGroupOptions,
  RadioGroupPrimitive,
  RadioGroupState,
  RadioGroupValueChangeReason,
  RadioIndicatorProps,
  RadioIndicatorState,
  RadioProps,
  RadioState,
} from "@ui-sdk/core/radio";

export { Radio, RadioGroup, RadioIndicator };
