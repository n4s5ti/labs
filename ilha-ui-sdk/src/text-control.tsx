// Text field prop helpers (port of `@ui-sdk/solid`'s `text-control`).
//
// Shared by the text inputs (`input`, `textarea`, the segmented date/time
// inputs): controlled/uncontrolled value wiring that never overwrites what
// the user typed. On the client the core-written `value` becomes
// `defaultValue`, so re-renders keep the user's text; on the server it stays
// `value` for the first paint.
import { h, untrack } from "ilha";
import type { useFieldControl } from "./field-context.ts";
import type { PartProps } from "./primitive.ts";

// Element props that mean something else on a text part.
type Native<Tag extends "input" | "textarea", State> = Omit<
  PartProps<Tag, State>,
  "value" | "defaultValue" | "onSelect"
>;

type TextProps = {
  disabled?: unknown;
  readonly?: unknown;
  required?: unknown;
};

// Whether the part is disabled, read-only or required, by itself or by its
// field. `readonly` (not `readOnly`) is the attribute the part reads.
function controlProps(
  props: TextProps,
  field: ReturnType<typeof useFieldControl>,
) {
  return () => ({
    disabled:
      (props.disabled !== undefined &&
        props.disabled !== null &&
        props.disabled !== false) ||
      !!field?.disabled(),
    readOnly:
      props.readonly !== undefined &&
      props.readonly !== null &&
      props.readonly !== false,
    required:
      props.required !== undefined &&
      props.required !== null &&
      props.required !== false,
  });
}

// The value wiring for an element: `value` on the server, `defaultValue`
// for a controlled value on the client.
function valueProps(
  value: () => string | undefined,
  defaultValue: () => string | undefined,
) {
  return () => {
    if (typeof document === "undefined") {
      return { value: value() ?? defaultValue() };
    }
    return value() === undefined
      ? { defaultValue: defaultValue() }
      : { value: value() };
  };
}

// A text element's props: the field's name over the author's, with the
// value wiring above.
function elementProps(
  props: Record<string, any>,
  field: ReturnType<typeof useFieldControl>,
  value: () => string | undefined,
  defaultValue: () => string | undefined,
) {
  return {
    ...props,
    get name() {
      return props.name ?? field?.name();
    },
    ...valueProps(value, defaultValue)(),
  };
}

// Without a `value`, an element's props with `defaultValue` in `value`'s
// place, so the core-written text starts the input without controlling it.
function defaultValueProps(
  props: Record<string, any>,
  initial: () => unknown = () => (props as { value?: unknown }).value,
) {
  if (typeof document === "undefined") {
    return props;
  }
  const { value: _dropped, ...rest } = props;
  return { ...rest, defaultValue: initial() };
}

// Core writes the text of the segments itself, and the `value` in the
// attributes is where the text starts: on the client it becomes
// `defaultValue`, so re-renders never overwrite what the user typed since.
function startingText(props: Record<string, any>) {
  const render = untrack(() => props.render);
  return {
    ...props,
    render: (merged: Record<string, any>, state: unknown) => {
      const element = defaultValueProps(merged);
      if (typeof render === "function") {
        return render(element, state);
      }
      return h("input", element);
    },
  };
}

export {
  controlProps,
  defaultValueProps,
  elementProps,
  startingText,
  valueProps,
  type Native,
};
