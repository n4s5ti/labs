// Field context for controls (port of `@ui-sdk/solid`'s `field-context`).
//
// Controls inside a field take its name and disabled state, and its ids and
// validity through the field's control slot. The Solid version threads
// getters through `merge` proxies so the join stays reactive; the Ilha
// version resolves the same join eagerly per render (the component's tick
// re-renders when the field changes).
import type { field } from "@ui-sdk/core/field";
import { fieldControlId, madeLabel } from "@ui-sdk/core/renderer";
import { createContext, context, h, untrack } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import type { PartProps, PrimitiveHandle } from "./primitive.ts";
import { omit } from "./primitive.ts";

// The field's context, apart from its parts, so a control can join a field
// without bundling the field.
type FieldContextValue = PrimitiveHandle<typeof field> & {
  name: () => string | undefined;
  disabled: () => boolean | undefined;
};

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Controls inside a field take its name and disabled state, and its ids and
 * validity through the field's control slot. Null outside a field. The
 * control takes the field's id, so the label points at it from the server's
 * HTML on, unless its own props give one. A control whose component makes the
 * id it renders, like a select's trigger, passes those props as `own`.
 * @stable
 */
function useFieldControl(own?: { id?: unknown }) {
  const field = context(FieldContext)();
  if (!field) {
    return null;
  }
  return {
    disabled: field.disabled,
    name: field.name,
    // Merges the field's attributes for its control into the control's props,
    // keeping the control's own description ahead of the field's. The field
    // decides the id.
    props: (props: Record<string, any>) => {
      const merged = field.slot(
        "control",
        () => ({
          describedBy: props["aria-describedby"],
          id: untrack(() => (own ?? props).id) as string | undefined,
        }),
        {
          ...omit(props, "id", "aria-labelledby"),
          "aria-labelledby": madeLabel(props["aria-labelledby"])
            ? undefined
            : props["aria-labelledby"],
        },
      );
      // The field's label names the control over the control's own, like a
      // ComboboxLabel's, but not over the author's. The control stays its own
      // part for styling.
      return {
        ...merged,
        "aria-labelledby": merged["aria-labelledby"] ?? props["aria-labelledby"],
        "data-slot": props["data-slot"],
      };
    },
  };
}

/**
 * A control's props for `usePart`, joining the field it's in, if any: the
 * field's attributes for its control go over the control's own, merged ones,
 * so they render through `render`, which then renders the user's `render`
 * or `tag`.
 */
function joinField(
  field: ReturnType<typeof useFieldControl>,
  props: Record<string, any>,
  tag: keyof JSX.IntrinsicElements,
) {
  if (!field) {
    return props;
  }
  const render = untrack(() => props.render);
  return {
    ...props,
    render: (merged: Record<string, any>, state: unknown) => {
      const joined = field.props(merged);
      if (typeof render === "function") {
        return render(joined, state);
      }
      return h(tag, joined);
    },
  };
}

// Props a button takes that mean something else on a checkbox or a switch.
type ButtonControlProps<State> = Omit<
  PartProps<"button", State>,
  "value" | "name" | "form" | "onChange" | "onSelect"
>;

function useFieldControlId() {
  const field = context(FieldContext)();
  return field ? fieldControlId(field.api.id) : undefined;
}

export {
  type ButtonControlProps,
  FieldContext,
  type FieldContextValue,
  joinField,
  useFieldControl,
  useFieldControlId,
};
