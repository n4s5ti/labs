// Combobox (port of `@ui-sdk/solid`'s `combobox`).
//
// The popup renders inline, in place, while its slot is present: Ilha has no
// portal, so a second island (and its broken context/atoms) is out. Ancestor
// overflow or stacking contexts clip it; that is the documented tradeoff.
import {
  combobox as comboboxPrimitive,
  type ComboboxChipProps,
  type ComboboxChipState,
  type ComboboxChipsOverflowState,
  type ComboboxClearState,
  type ComboboxContentProps,
  type ComboboxContentState,
  type ComboboxCreateProps,
  type ComboboxCreateState,
  type ComboboxEmptyState,
  type ComboboxInputState,
  type ComboboxItemIconProps,
  type ComboboxItemIconState,
  type ComboboxItemProps,
  type ComboboxItemState,
  type ComboboxItemTextState,
  type ComboboxOptions,
  type ComboboxSelectAllState,
  type ComboboxValueProps,
  type ComboboxValueState,
  type ListData,
} from "@ui-sdk/core/combobox";
import {
  comboboxChips,
  comboboxCreate,
  comboboxItemIcons,
  comboboxSelectAll,
  selectAllKey,
} from "@ui-sdk/core/renderer";
import { atom, context, createContext, watch } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { joinField, useFieldControl } from "./field-context.ts";
import { ListItems, markSegments, textToMark, type ListParts } from "./list-text.tsx";
import { useControllerEntry } from "./controller-target.ts";
import {
  childOf,
  createParts,
  omit,
  providePrimitive,
  useAround,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

const parts = createParts(comboboxPrimitive, {
  arrow: "div",
  clear: "button",
  empty: "div",
  group: "div",
  "group-label": "div",
  "item-indicator": "span",
  item: "div",
  label: "label",
  list: "div",
  separator: "div",
  status: "div",
  trigger: "button",
});

const ComboboxContext = createContext<PrimitiveHandle<
  typeof comboboxPrimitive
> | null>(null);
const ChipContext = createContext<(() => unknown) | null>(null);
// Where a ComboboxContent among the combobox's children says it's there, so a
// data combobox renders its own list only when there's none.
const OwnContentContext = createContext<((present: boolean) => void) | null>(
  null,
);

function useCombobox() {
  const combobox = context(ComboboxContext)();
  if (!combobox) {
    throw new Error("Combobox parts must be used inside <Combobox>.");
  }
  return combobox;
}

// Element props that mean something else on a combobox part.
type Clashing = "value" | "defaultValue" | "onChange" | "onSelect";

/**
 * The props of `Combobox`.
 * @stable
 */
type ComboboxProps<
  T = string,
  Multiple extends boolean | undefined = false,
> = ComboboxOptions<T, Multiple> & {
  children?: JSX.Element;
};

let nextComboboxId = 0;

// One-shot renderer plugin install: `instance.use` adds behavior once, but a
// component body re-runs on every tick, so guard it per handle.
function usePlugin(handle: { instance: { use: (plugin: any) => void } }, plugin: any) {
  const installed = atom.lazy(() => ({ value: false }), { snapshot: false });
  if (!installed().value) {
    installed().value = true;
    handle.instance.use(plugin);
  }
}

/**
 * A text input that filters a list as you type.
 * `T` is inferred from `value`, `defaultValue`, `items` or `onValueChange`, and
 * `multiple` makes the value a list.
 * @stable
 */
function Combobox<T = string, Multiple extends boolean | undefined = false>(
  props: ComboboxProps<T, Multiple>,
) {
  const field = useFieldControl();
  const combobox = usePrimitive(comboboxPrimitive, () => ({
    ...((omit(props, "children", "container") as unknown) as ComboboxOptions<any, any>),
    disabled: props.disabled || field?.disabled(),
    name: props.name ?? field?.name(),
  }));
  useControllerEntry(() => props.controller, combobox);
  // Written by a ComboboxContent among the children, while the children render.
  const hasContent = atom(false, { snapshot: false });
  const setHasContent = (present: boolean) => {
    if (hasContent() !== present) {
      queueMicrotask(() => {
        hasContent.set(present);
      });
    }
  };
  const children = childOf(props);
  const items = props.items;
  const multiple = () => props.multiple;
  return (
    <ComboboxContext.Provider value={combobox}>
      {providePrimitive(combobox, () => (
        <>
          <OwnContentContext.Provider value={setHasContent}>
            {children as JSX.Element}
          </OwnContentContext.Provider>
          {items && !hasContent() ? (
            <OwnContentContext.Provider value={null}>
              <ComboboxContent />
            </OwnContentContext.Provider>
          ) : null}
          {formInputs(combobox, multiple)}
        </>
      ))}
    </ComboboxContext.Provider>
  );
}

// The hidden inputs that take part in a form for the combobox: one for the
// value, or one more per value with `multiple`.
function formInputs(
  handle: PrimitiveHandle<typeof comboboxPrimitive>,
  multiple: () => boolean | undefined,
) {
  const input = handle.slot("form-input");
  const keys = multiple()
    ? ((handle.api.internal.serialized() as string[]) ?? [])
    : [];
  return (
    <>
      <input {...input} />
      {multiple()
        ? keys.map((key) => {
          const hidden = handle.slot("value-input", () => ({
            id: key,
            value: key,
          }));
          return <input key={key} {...hidden} />;
        })
        : null}
    </>
  );
}

/**
 * A visible label for the input.
 * @stable
 */
const ComboboxLabel = parts.Label;

/**
 * The text input that filters the list and holds the chosen item's label.
 * @stable
 */
function ComboboxInput(
  props: Omit<
    PartProps<"input", ComboboxInputState>,
    "value" | "defaultValue" | "children" | "readonly"
  >,
) {
  const combobox = useCombobox();
  const input = joinField(useFieldControl(props), props, "input");
  return usePart(combobox, "input", undefined, input, "input");
}

/**
 * A button that opens and closes the list, out of the tab order.
 * @stable
 */
const ComboboxTrigger = parts.Trigger;

/**
 * The popup that holds the list, positioned against the input.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function ComboboxContent(
  props: PartProps<"div", ComboboxContentState> & ComboboxContentProps,
) {
  const combobox = useCombobox();
  const register = context(OwnContentContext)();
  watch.once(() => {
    if (register) {
      queueMicrotask(() => register(true));
      return () => register(false);
    }
    return () => {};
  });
  const content = () => ({
    align: props.align,
    alignOffset: props.alignOffset,
    anchor: props.anchor,
    arrowPadding: props.arrowPadding,
    collisionPadding: props.collisionPadding,
    keepMounted: props.keepMounted,
    side: props.side,
    sideOffset: props.sideOffset,
  });
  const children = childOf(props);
  const rest = omit(
    props,
    "side",
    "align",
    "sideOffset",
    "alignOffset",
    "collisionPadding",
    "arrowPadding",
    "anchor",
    "keepMounted",
    "container",
  );
  const body = {
    ...rest,
    get children() {
      return (state: ComboboxContentState) => (
        <>
          {combobox.present("header")
            ? <div {...combobox.slot("header")} />
            : null}
          {typeof children === "function" && children.length > 0
            ? (children as (state: ComboboxContentState) => JSX.Element)(state)
            : (children ?? (state.items ? <ComboboxList /> : null))}
        </>
      );
    },
  };
  const open = combobox.present("content", content);
  const element = usePart(combobox, "content", content, body, "div");
  return open ? element : null;
}

/**
 * The listbox. Without children, it renders the combobox's `items`, filtered.
 * @stable
 */
function ComboboxList(props: Record<string, any>) {
  // From the part's state, so new items render the list again. Without items it's empty.
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return (
        children ??
        ((state: ComboboxContentState) =>
          state.items ? <ComboboxItems items={state.items} /> : null)
      );
    },
  };
  return <parts.List {...rest} />;
}

/**
 * An option. Pressing it selects it, or toggles it with `multiple`.
 * @stable
 */
const ComboboxItem = parts.Item as <T = string>(
  props: Omit<PartProps<"div", ComboboxItemState>, Clashing> &
    ComboboxItemProps<T>,
) => JSX.Element;

/**
 * The item's text, with the part the input's text matched in `<mark>`. Without string content, it shows the item's label.
 * @stable
 */
function ComboboxItemText(props: PartProps<"span", ComboboxItemTextState>) {
  const item = useAround(comboboxPrimitive, "item");
  if (!item) {
    throw new Error("<ComboboxItemText> must be used inside <ComboboxItem>.");
  }
  const key = () => item().value as string;
  const part = () => ({
    id: key(),
    text: textToMark(childOf(props), (item().label as string) ?? key()),
  });
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return typeof children === "function"
        ? children
        : (state: ComboboxItemTextState) => markSegments(state.segments);
    },
  };
  return usePart(useCombobox(), "item-text", part, rest, "span");
}

/**
 * An option that selects every item that matches, with `multiple`: in its group inside a `ComboboxGroup`, or in the whole list.
 * @stable
 */
function ComboboxSelectAll(props: PartProps<"div", ComboboxSelectAllState>) {
  const combobox = useCombobox();
  usePlugin(combobox, comboboxSelectAll);
  // Read once, here: the group around it.
  const group = useAround(comboboxPrimitive, "group")?.().id as
    | string
    | undefined;
  return usePart(
    combobox,
    "select-all",
    () => ({ id: selectAllKey(group) }),
    props,
    "div",
  );
}

/**
 * The check inside a selected item. Rendered while it's selected, or always with `keepMounted`.
 * @stable
 */
const ComboboxItemIndicator = parts.ItemIndicator;

/**
 * An icon inside an item. `ComboboxValueIcon` shows the selected item's next to the input. Screen
 * readers, typeahead and filtering skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
function ComboboxItemIcon(
  props: PartProps<"span", ComboboxItemIconState> & ComboboxItemIconProps,
) {
  const combobox = useCombobox();
  usePlugin(combobox, comboboxItemIcons);
  const item = useAround(comboboxPrimitive, "item");
  // Made once: a new id each render would make a new item-icon part each
  // render (core keys parts by id), resubscribing forever.
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextComboboxId += 1)}`, {
    snapshot: false,
  });
  const id = idBox();
  const part = () => ({
    id,
    item: item?.().value as string | undefined,
    mirror: props.mirror,
  });
  return usePart(combobox, "item-icon", part, omit(props, "mirror"), "span");
}

/**
 * The selected item's icon, copied from its `ComboboxItemIcon`, like next to the input. Rendered
 * while one item is selected and it has an icon.
 * @stable
 */
function ComboboxValueIcon(props: Omit<PartProps<"span">, "children">) {
  const combobox = context(ComboboxContext)();
  if (!combobox) {
    return null;
  }
  usePlugin(combobox, comboboxItemIcons);
  // Its content is a copy of the selected item's icon, which the core writes.
  return usePart(combobox, "value-icon", undefined, props, "span");
}

/**
 * A group of items, named by its `ComboboxGroupLabel`, and hidden while none of its items shows.
 * @stable
 */
const ComboboxGroup = parts.Group;

/**
 * The group's heading, which names the group.
 * @stable
 */
const ComboboxGroupLabel = parts.GroupLabel;

/**
 * A line between items or groups, hidden from screen readers.
 * @stable
 */
const ComboboxSeparator = parts.Separator;

/**
 * An option that creates an item from the input's text. Shown while the text matches no item's label exactly.
 * @stable
 */
function ComboboxCreate(
  props: Omit<PartProps<"div", ComboboxCreateState>, Clashing> &
    ComboboxCreateProps,
) {
  const combobox = useCombobox();
  usePlugin(combobox, comboboxCreate);
  const part = () => ({ minLength: props.minLength, onCreate: props.onCreate });
  const children = childOf(props);
  const rest = {
    ...omit(props, "onCreate", "minLength"),
    get children() {
      return (
        children ??
        ((state: ComboboxCreateState) => `Create “${state.query}”`)
      );
    },
  };
  return usePart(combobox, "create", part, rest, "div");
}

/**
 * Shown while no item matches. Its message is announced when it appears.
 * @stable
 */
function ComboboxEmpty(props: Record<string, any>) {
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return typeof children === "function"
        ? children
        : (state: ComboboxEmptyState) => (state.empty ? children : null);
    },
  };
  return <parts.Empty {...rest} />;
}

/**
 * A polite live region for loading and result counts. Its content is yours, usually a function of its state.
 * @stable
 */
const ComboboxStatus = parts.Status;

/**
 * A button that empties the input and selects nothing. Shown while there's something to clear.
 * @stable
 */
const ComboboxClear = parts.Clear;

/**
 * The selected value, as a function of its state, like one chip per value. Without children, the labels joined with commas, or "France, Chile and 2 more" with `maxLabels`. Renders no element of its own.
 * @stable
 */
function ComboboxValue(
  props: ComboboxValueProps & {
    children?: JSX.Element | ((state: ComboboxValueState) => JSX.Element);
  },
) {
  const combobox = useCombobox();
  const part = () => ({
    getMoreLabel: props.getMoreLabel,
    maxLabels: props.maxLabels,
  });
  const children = childOf(props);
  // Its `render` leaves the props it's handed out, so it renders only its content.
  const render = (_: unknown, state: ComboboxValueState) => {
    return typeof children === "function"
      ? (children as (state: ComboboxValueState) => JSX.Element)(state)
      : (children ?? state.label);
  };
  return usePart(combobox, "value", part, { render }, "span");
}

/**
 * How many chips don't fit on the chips' line, once some collapse. Rendering it inside `ComboboxChips` turns collapsing on. Without children, "+2 more".
 * @stable
 */
function ComboboxChipsOverflow(
  props: PartProps<"span", ComboboxChipsOverflowState>,
) {
  const combobox = useCombobox();
  usePlugin(combobox, comboboxChips);
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return (
        children ??
        ((state: ComboboxChipsOverflowState) => `+${state.count} more`)
      );
    },
  };
  return usePart(combobox, "chips-overflow", undefined, rest, "span");
}

/**
 * The selected values as chips, around the input.
 * @stable
 */
function ComboboxChips(props: PartProps<"div">) {
  const combobox = useCombobox();
  usePlugin(combobox, comboboxChips);
  return usePart(combobox, "chips", undefined, props, "div");
}

/**
 * One selected value. Without children, it shows the value's label.
 * @stable
 */
function ComboboxChip<T = string>(
  props: Omit<PartProps<"div", ComboboxChipState>, Clashing> &
    ComboboxChipProps<T>,
) {
  const combobox = useCombobox();
  usePlugin(combobox, comboboxChips);
  // Keyed by the value's key, since a value may be an object.
  const part = () => ({
    id: combobox.api.internal.keyOf(props.value),
    value: props.value,
  });
  const children = childOf(props);
  const rest = {
    ...omit(props, "value"),
    get children() {
      return children ?? ((state: ComboboxChipState) => state.label);
    },
  };
  return (
    <ChipContext.Provider value={() => props.value}>
      {usePart(combobox, "chip", part, rest, "div")}
    </ChipContext.Provider>
  );
}

/**
 * A button inside a chip that removes its value. Name it with `aria-label`.
 * @stable
 */
function ComboboxChipRemove(props: PartProps<"button", ComboboxClearState>) {
  const combobox = useCombobox();
  usePlugin(combobox, comboboxChips);
  const chip = context(ChipContext)();
  if (!chip) {
    throw new Error("<ComboboxChipRemove> must be used inside <ComboboxChip>.");
  }
  // Keyed by its chip's value, like the chip.
  const part = () => ({
    id: combobox.api.internal.keyOf(chip()),
    value: chip(),
  });
  return usePart(combobox, "chip-remove", part, props, "button");
}

/**
 * An arrow on the popup's edge that points at the input.
 * @stable
 */
const ComboboxArrow = parts.Arrow;

/**
 * Renders data items. Used by data comboboxes, and available for custom layouts.
 * @stable
 */
function ComboboxItems(props: { items: ListData<unknown> }) {
  return (
    <ListItems
      items={props.items as unknown as { type?: string }[]}
      parts={listParts}
    />
  );
}

const listParts: ListParts = {
  Group: ComboboxGroup,
  GroupLabel: ComboboxGroupLabel,
  Item: ComboboxItem,
  Separator: ComboboxSeparator,
};

export { createComboboxController } from "@ui-sdk/core/combobox";
// Core's `ComboboxValue` type ends in `Data` here, since the component has its name.
export type {
  ComboboxApi,
  ComboboxArrowState,
  ComboboxChangeOptions,
  ComboboxChipProps,
  ComboboxChipState,
  ComboboxChipsOverflowState,
  ComboboxClearProps,
  ComboboxClearState,
  ComboboxContentProps,
  ComboboxContentState,
  ComboboxController,
  ComboboxCreateProps,
  ComboboxCreateState,
  ComboboxDismissReason,
  ComboboxEmptyState,
  ComboboxInputState,
  ComboboxItemIconProps,
  ComboboxItemIconState,
  ComboboxItemIndicatorProps,
  ComboboxItemIndicatorState,
  ComboboxItemProps,
  ComboboxItemState,
  ComboboxItemTextState,
  ComboboxOpenChangeReason,
  ComboboxOptions,
  ComboboxPrimitive,
  ComboboxQueryChangeReason,
  ComboboxSelectAllState,
  ComboboxStatusState,
  ComboboxTriggerState,
  ComboboxValue as ComboboxValueData,
  ComboboxValueChangeReason,
  ComboboxValueProps,
  ComboboxValueState,
  ListAnnouncement,
  ListData,
  ListFilter,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
  MatchSegment,
} from "@ui-sdk/core/combobox";

export {
  Combobox,
  ComboboxArrow,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxChipsOverflow,
  ComboboxClear,
  ComboboxContent,
  ComboboxCreate,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIcon,
  ComboboxItemIndicator,
  ComboboxItems,
  ComboboxItemText,
  ComboboxLabel,
  ComboboxList,
  type ComboboxProps,
  ComboboxSelectAll,
  ComboboxSeparator,
  ComboboxStatus,
  ComboboxTrigger,
  ComboboxValue,
  ComboboxValueIcon,
};
