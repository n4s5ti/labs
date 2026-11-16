// Listbox (port of `@ui-sdk/solid`'s `listbox`).
//
// The shared `ListData`/`ListGroup`/`ListItem`/`ListSeparator` types already
// reach the barrel through `autocomplete` and `combobox`, so this module
// re-exports only its `Listbox`-prefixed types.
import {
  listbox as listboxPrimitive,
  type ListboxItemProps,
  type ListboxItemState,
  type ListboxOptions,
  type ListboxState,
} from "@ui-sdk/core/listbox";
import type { JSX } from "ilha/jsx-runtime";
import { joinField, useFieldControl } from "./field-context.ts";
import { formInputs } from "./form-inputs.tsx";
import { ListItems, type ListEntry, type ListParts } from "./list-text.tsx";
import {
  childOf,
  createParts,
  omit,
  usePart,
  usePrimitive,
  type PartProps,
} from "./primitive.ts";

const parts = createParts(listboxPrimitive, {
  item: "div",
  "item-indicator": "span",
  "item-icon": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
});

// Element props that mean something else on a listbox part.
type Clashing = "value" | "onChange" | "onSelect";

/**
 * The props of `Listbox`.
 * @stable
 */
type ListboxProps<
  T = string,
  Multiple extends boolean | undefined = false,
> = Omit<PartProps<"div", ListboxState>, Clashing | keyof ListboxOptions> &
  ListboxOptions<T, Multiple> & {};

const optionKeys = [
  "value",
  "defaultValue",
  "onValueChange",
  "multiple",
  "activation",
  "deselectable",
  "orientation",
  "loop",
  "keepInView",
  "items",
  "itemToValue",
  "isItemEqualToValue",
  "onHighlight",
  "disabled",
  "readOnly",
  "required",
  "name",
  "form",
  "controller",
  "debug",
] as const;

/**
 * An always-visible list to choose one option from, or several.
 * `T` is inferred from `value`, `defaultValue`, `items` or `onValueChange`, and
 * `multiple` makes the value a list.
 * @stable
 */
function Listbox<T = string, Multiple extends boolean | undefined = false>(
  props: ListboxProps<T, Multiple>,
) {
  const field = useFieldControl();
  // Typed loosely: the union `Multiple` picks is too large for `omit`.
  const loose = props as ListboxProps<any, boolean>;
  const options = omit(loose, "render", "class", "style", "children");
  const listbox = usePrimitive(listboxPrimitive, () => ({
    ...options,
    name: props.name ?? field?.name(),
    disabled: props.disabled || field?.disabled(),
  }));
  const children = childOf(loose);
  const rest = {
    ...omit(loose, ...optionKeys),
    get children() {
      return (
        children ??
        ((state: ListboxState) =>
          props.items ? <ListboxItems items={state.items} /> : null)
      );
    },
  };
  return (
    <>
      {usePart(
        listbox,
        "root",
        undefined,
        joinField(field, rest, "div"),
        "div",
      )}
      {formInputs(listbox, () => props.multiple)}
    </>
  );
}

/**
 * An option. Pressing it selects it, or toggles it with `multiple`.
 * @stable
 */
const ListboxItem = parts.Item as <T = string>(
  props: Omit<PartProps<"div", ListboxItemState>, Clashing> &
    ListboxItemProps<T>,
) => JSX.Element;

/**
 * The check inside a selected item. Rendered while it's selected, or always with `keepMounted`.
 * @stable
 */
const ListboxItemIndicator = parts.ItemIndicator;

/**
 * An icon inside an item. Screen readers and typeahead skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const ListboxItemIcon = parts.ItemIcon;

/**
 * A group of items, named by its `ListboxGroupLabel`.
 * @stable
 */
const ListboxGroup = parts.Group;

/**
 * The group's heading, which names the group.
 * @stable
 */
const ListboxGroupLabel = parts.GroupLabel;

/**
 * A line between items or groups, hidden from screen readers.
 * @stable
 */
const ListboxSeparator = parts.Separator;

/**
 * Renders data items. Used by data listboxes, and available for custom layouts.
 * @stable
 */
function ListboxItems(props: { items: readonly ListEntry[] }) {
  return <ListItems items={props.items} parts={listParts} />;
}

const listParts: ListParts = {
  Item: ListboxItem,
  Group: ListboxGroup,
  GroupLabel: ListboxGroupLabel,
  Separator: ListboxSeparator,
};

export { createListboxController } from "@ui-sdk/core/listbox";
export type {
  ListboxApi,
  ListboxChangeOptions,
  ListboxController,
  ListboxItemIconProps,
  ListboxItemIconState,
  ListboxItemIndicatorProps,
  ListboxItemIndicatorState,
  ListboxItemProps,
  ListboxItemState,
  ListboxOptions,
  ListboxPrimitive,
  ListboxState,
  ListboxValue,
  ListboxValueChangeReason,
} from "@ui-sdk/core/listbox";

export {
  Listbox,
  ListboxGroup,
  ListboxGroupLabel,
  ListboxItem,
  ListboxItemIcon,
  ListboxItemIndicator,
  ListboxItems,
  type ListboxProps,
  ListboxSeparator,
};
