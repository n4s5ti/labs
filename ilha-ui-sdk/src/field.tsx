// Field (port of `@ui-sdk/solid`'s `field`).
//
// `field-context.ts` already holds the context and the control join; this
// module holds the components. A part outside any Field renders a plain
// element with no field wiring, so a FieldLabel is a native <label> that
// labels the control it wraps.
import {
  fieldGroup as fieldGroupPrimitive,
  field as fieldPrimitive,
  fieldSet as fieldSetPrimitive,
  type FieldDescriptionState,
  type FieldErrorProps,
  type FieldErrorState,
  type FieldOptions,
  type FieldSetOptions,
  type FieldSetState,
  type FieldState,
} from "@ui-sdk/core/field";
import {
  checkFieldOutside,
  fieldOutsideAttrs,
  fieldOutsideErrorShown,
  fieldOutsideState,
  type FieldOutsideSlot,
} from "@ui-sdk/core/renderer";
import { atom, context, createContext } from "ilha";
import { FieldContext, type FieldContextValue } from "./field-context.ts";
import {
  childOf,
  renderStatic,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

type FieldHandle = PrimitiveHandle<typeof fieldPrimitive>;
type FieldSetHandle = PrimitiveHandle<typeof fieldSetPrimitive>;

const FieldSetContext = createContext<FieldSetHandle | null>(null);
// What a FieldDescription describes: the nearest Field, or a FieldSet when no
// Field is closer.
const DescribedContext = createContext<FieldHandle | FieldSetHandle | null>(
  null,
);

let nextFieldId = 0;

// A part outside a field: a plain element with no field wiring.
function outside(
  slot: FieldOutsideSlot,
  tag: string,
  props: Record<string, any>,
) {
  const checks: Partial<Record<FieldOutsideSlot, (el: Element) => void>> = {
    label: (el) => checkFieldOutside(el, "label"),
    control: (el) => checkFieldOutside(el, "control"),
  };
  const check = checks[slot];
  const userRef = props.ref;
  const ref = check
    ? (node: Element | null) => {
      if (node) {
        queueMicrotask(() => check(node));
      }
      if (typeof userRef === "function") {
        userRef(node);
      }
    }
    : userRef;
  const user = check ? { ...props, ref } : props;
  return renderStatic(
    tag,
    () => ({ attrs: fieldOutsideAttrs(slot), state: fieldOutsideState }),
    user,
  );
}

/**
 * Ties a form control to its label, description and error messages.
 * @stable
 */
function Field(props: FieldOptions & PartProps<"div", FieldState>) {
  const field = usePrimitive(fieldPrimitive, () => ({
    name: props.name,
    disabled: props.disabled,
    invalid: props.invalid,
    debug: props.debug,
  }));
  const { name, disabled, invalid, debug, ...rest } = props;
  void name;
  void disabled;
  void invalid;
  void debug;
  // The handle with the field's name and disabled state beside it. Its
  // prototype keeps the handle's `state` getter live.
  const fieldContext: FieldContextValue = Object.assign(Object.create(field), {
    name: () => props.name,
    disabled: () => props.disabled,
  });
  return (
    <FieldContext.Provider value={fieldContext}>
      <DescribedContext.Provider value={field}>
        {usePart(field, "root", undefined, rest, "div")}
      </DescribedContext.Provider>
    </FieldContext.Provider>
  );
}

/**
 * The field's label, which names its control. Outside a Field it's a plain
 * <label>, which labels the control inside it, like a card around a whole Field.
 * @stable
 */
function FieldLabel(props: PartProps<"label", FieldState>) {
  const field = context(FieldContext)();
  if (!field) {
    return outside("label", "label", props);
  }
  return usePart(
    field,
    "label",
    () => ({ id: props.id as string | undefined }),
    props,
    "label",
  );
}

/**
 * Describes its Field. Right inside a FieldSet, outside any Field, it describes
 * the group, so screen readers say it as focus enters the group.
 * @stable
 */
function FieldDescription(props: PartProps<"p", FieldDescriptionState>) {
  const described = context(DescribedContext)();
  if (!described) {
    return outside("description", "p", props);
  }
  // A field set's description slot takes the same props, and its state is the
  // `disabled` that FieldDescriptionState always has.
  const owner = described as FieldHandle;
  return usePart(
    owner,
    "description",
    () => ({ id: props.id as string | undefined }),
    props,
    "p",
  );
}

/**
 * Shows while the field shows as invalid. Without children, it shows the
 * browser's message for the current problem.
 * @stable
 */
function FieldError(
  props: PartProps<"div", FieldErrorState> & FieldErrorProps,
) {
  const field = context(FieldContext)();
  // Made once: only an error with `match` needs an id of its own.
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextFieldId += 1)}`, {
    snapshot: false,
  });
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return children ?? ((state: FieldErrorState) => state.message);
    },
  };
  if (props.match !== undefined) {
    delete (rest as Record<string, unknown>).match;
  }
  if (!field) {
    return fieldOutsideErrorShown({ match: props.match })
      ? outside("error", "div", rest)
      : null;
  }
  // Only an error with `match` needs an id of its own. One without takes the
  // field's, which the control points at before the field binds.
  const made = idBox();
  const error = () => ({
    id: (props.id as string | undefined) ??
      (props.match === undefined ? undefined : made),
    match: props.match,
  });
  return usePart(field, "error", error, rest, "div");
}

/**
 * A native control: an <input> by default, or anything through `render`.
 * @stable
 */
function FieldControl(props: PartProps<"input", FieldState>) {
  const field = context(FieldContext)();
  if (!field) {
    return outside("control", "input", props);
  }
  const { name, ...user } = props;
  void name;
  const control = () => ({
    id: props.id as string | undefined,
    describedBy: props["aria-describedby"] as string | undefined,
  });
  return usePart(
    field,
    "control",
    control,
    {
      ...user,
      name: props.name ?? field.name(),
    },
    "input",
  );
}

/**
 * A native <fieldset>, so `disabled` disables every control inside it.
 * @stable
 */
function FieldSet(
  props: FieldSetOptions &
    Omit<PartProps<"fieldset", FieldSetState>, "disabled">,
) {
  const set = usePrimitive(fieldSetPrimitive, () => ({
    disabled: props.disabled,
    debug: props.debug,
  }));
  const { disabled, debug, ...rest } = props;
  void disabled;
  void debug;
  return (
    <FieldSetContext.Provider value={set}>
      <DescribedContext.Provider value={set}>
        {usePart(set, "set", undefined, rest, "fieldset")}
      </DescribedContext.Provider>
    </FieldSetContext.Provider>
  );
}

/**
 * Names the field set. Keep it the set's first child, where a <legend> names it natively.
 * @stable
 */
function FieldLegend(props: PartProps<"legend", FieldSetState>) {
  const set = context(FieldSetContext)();
  if (!set) {
    throw new Error("FieldLegend must be used inside <FieldSet>.");
  }
  return usePart(
    set,
    "legend",
    () => ({ id: props.id as string | undefined }),
    props,
    "legend",
  );
}

/**
 * Lays fields out. It has no role: a FieldSet is what names and disables a group.
 * @stable
 */
function FieldGroup(props: PartProps<"div">) {
  return usePart(
    usePrimitive(fieldGroupPrimitive, () => ({})),
    "group",
    undefined,
    props,
    "div",
  );
}

export {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
};
export type {
  FieldApi,
  FieldDescriptionState,
  FieldErrorProps,
  FieldErrorState,
  FieldGroupPrimitive,
  FieldOptions,
  FieldPrimitive,
  FieldSetOptions,
  FieldSetPrimitive,
  FieldSetState,
  FieldState,
  ValidityKey,
} from "@ui-sdk/core/field";
