// One-time password input (port of `@ui-sdk/solid`'s `otp-input`).
//
// Core writes the input's value itself, and the `value` in the attributes is
// where the text starts: on the client it becomes `defaultValue`, so
// re-renders never overwrite what the user typed since.
import {
  otpInput as otpInputPrimitive,
  type OTPInputOptions,
  type OTPInputSlotProps,
  type OTPInputSlotState,
  type OTPInputState,
} from "@ui-sdk/core/otp-input";
import { untrack } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { useFieldControl } from "./field-context.ts";
import {
  childOf,
  createParts,
  omit,
  usePart,
  usePrimitive,
  type PartProps,
} from "./primitive.ts";

const parts = createParts(otpInputPrimitive, { group: "div", separator: "div" });

type DivProps<State> = Omit<
  PartProps<"div", State>,
  "defaultValue" | "onChange" | "onSelect"
>;

// Props that belong to the input, which is what takes focus and is named.
// Partial: Ilha's aria props come from an index signature, which `Pick` alone
// would make required; in the Solid adapter they are all optional.
type InputProps = Partial<
  Pick<
    JSX.IntrinsicElements["input"],
    | "id"
    | "autofocus"
    | "aria-label"
    | "aria-labelledby"
    | "aria-describedby"
    | "aria-invalid"
  >
>;

const named = [
  "id",
  "autofocus",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-invalid",
] as const;

// Core writes the text of the control itself (see the module header): the
// `value` in its attributes is where the text starts, for the server. On the
// client it becomes `defaultValue`, which a form reset returns to.
function defaultValueProps(
  props: Record<string, any>,
  initial: () => unknown = () => props.value,
) {
  if (typeof document === "undefined") {
    return props;
  }
  return { ...omit(props, "value"), defaultValue: initial() };
}

/**
 * The root: the slots, and the one real input over them. `id`, `autofocus`
 * and the `aria-*` naming props go to that input.
 * @stable
 */
function OTPInput(
  props: OTPInputOptions & InputProps & DivProps<OTPInputState>,
) {
  const field = useFieldControl();
  const otp = usePrimitive(otpInputPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    onValueCommit: props.onValueCommit,
    maxLength: props.maxLength,
    pattern: props.pattern,
    inputMode: props.inputMode,
    textAlign: props.textAlign,
    autoComplete: props.autoComplete,
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
    "onValueCommit",
    "maxLength",
    "pattern",
    "inputMode",
    "textAlign",
    "autoComplete",
    "disabled",
    "readOnly",
    "required",
    "name",
    "form",
    "controller",
    "debug",
    "children",
    ...named,
  );
  const slot = otp.slot("control", undefined, pick(props, named));
  // The core writes the input's value, so Ilha only renders where it starts.
  const initial = untrack(() => slot.value);
  const inputProps = defaultValueProps(
    field ? field.props(slot) : slot,
    () => initial,
  );
  // The content, then the input after it. `props.children` is read once:
  // every read of a JSX children getter makes the slots again.
  const children = childOf(props);
  const content = (current: OTPInputState) => (
    <>
      {typeof children === "function" && children.length > 0
        ? (children as (state: OTPInputState) => JSX.Element)(current)
        : (children as JSX.Element)}
      <input {...inputProps} />
    </>
  );
  return usePart(
    otp,
    "root",
    undefined,
    { ...rest, children: content },
    "div",
  );
}

// A live view of some of the props, by key.
function pick(props: Record<string, any>, keys: readonly string[]) {
  return omit(props, (key) => !keys.includes(key as never));
}

/**
 * Lays out a run of slots.
 * @stable
 */
const OTPInputGroup = parts.Group;

/**
 * One character of the code. Without children, it shows the character.
 * @stable
 */
function OTPInputSlot(props: OTPInputSlotProps & DivProps<OTPInputSlotState>) {
  // Keyed by its index, which isn't a string value.
  const part = () => ({ index: props.index, id: String(props.index) });
  const kids = childOf(props);
  const rest = {
    ...omit(props, "index"),
    get children() {
      return kids ?? ((state: OTPInputSlotState) => state.char);
    },
  };
  return usePart(otpInputPrimitive, "slot", part, rest, "div");
}

/**
 * Drawn between groups, like a dash.
 * @stable
 */
const OTPInputSeparator = parts.Separator;

export { createOTPInputController } from "@ui-sdk/core/otp-input";
export type {
  OTPInputApi,
  OTPInputChangeOptions,
  OTPInputController,
  OTPInputOptions,
  OTPInputPattern,
  OTPInputSlotData,
  OTPInputSlotProps,
  OTPInputSlotState,
  OTPInputState,
  OTPInputValueChangeReason,
  OtpInputPrimitive,
} from "@ui-sdk/core/otp-input";

export { OTPInput, OTPInputGroup, OTPInputSeparator, OTPInputSlot };
