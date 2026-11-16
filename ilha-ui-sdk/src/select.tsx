// Select (port of `@ui-sdk/solid`'s `select`).
//
// The list renders inline, in place, while its slot is present: Ilha has no
// portal, so a second island (and its broken context/atoms) is out. The
// `container` option is accepted and ignored for the same reason, and the
// sheet-positioning viewport wrapper is skipped: the content positions
// itself. Ancestor overflow or stacking contexts clip it; that is the
// documented tradeoff.
import {
  select as selectPrimitive,
  type SelectContentProps,
  type SelectContentState,
  type SelectEmptyState,
  type SelectItemIconProps,
  type SelectItemIconState,
  type SelectItemProps,
  type SelectItemState,
  type SelectItemTextState,
  type SelectOptions,
  type SelectSelectAllState,
  type SelectTriggerProps,
  type SelectTriggerState,
  type SelectValueProps,
  type SelectValueState,
} from "@ui-sdk/core/select";
import {
  selectAllKey,
  selectItemIcons,
  selectSelectAll,
} from "@ui-sdk/core/renderer";
import { atom, context, createContext, untrack, watch } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { joinField, useFieldControl } from "./field-context.ts";
import { formInputs } from "./form-inputs.tsx";
import { ListItems } from "./list-text.tsx";
import { markSegments, textToMark } from "./list-text.tsx";
import { useControllerEntry, usePopupContainer, type PopupContainer } from "./popup.ts";
import { useControllerTarget } from "./controller-target.ts";
import {
  childOf,
  createParts,
  omit,
  providePrimitive,
  renderStatic,
  useAround,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

const parts = createParts(selectPrimitive, {
  label: "div",
  list: "div",
  input: "input",
  item: "div",
  "item-indicator": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
  empty: "div",
  status: "div",
  clear: "button",
  arrow: "div",
});

const SelectContext = createContext<PrimitiveHandle<
  typeof selectPrimitive
> | null>(null);
// Function values in contexts are invoked on read (an effect-atom rule), so
// every context value here is an object, like the menubar's: bare getters
// would run with effect internals and poison the flag.
const ContainerContext = createContext<{ container: () => unknown } | null>(null);
// Where a SelectContent among the select's children says it's there, so a
// data select renders its own list only when there's none.
const OwnContentContext = createContext<{
  register: (present: boolean) => void;
} | null>(null);

// The placeholder a value outside the select shows, like for a preview.
const placeholders = new WeakMap<object, () => string | undefined>();

function useSelect() {
  const select = context(SelectContext)();
  if (!select) {
    throw new Error("Select parts must be used inside <Select>.");
  }
  return select;
}

// Element props that mean something else on a select part.
type Clashing = "value" | "onChange" | "onSelect";

/**
 * The props of `Select`.
 * @stable
 */
type SelectProps<
  T = string,
  Multiple extends boolean | undefined = false,
> = SelectOptions<T, Multiple> & {
  children?: JSX.Element;
};

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
 * A value picked from a list. `T` is inferred from `value`, `defaultValue`,
 * `items` or `onValueChange`, and `multiple` makes the value a list.
 * @stable
 */
function Select<T = string, Multiple extends boolean | undefined = false>(
  props: SelectProps<T, Multiple>,
) {
  const field = useFieldControl();
  const options = omit(props, "children", "container");
  const select = usePrimitive(selectPrimitive, () => ({
    ...options,
    name: (props as SelectOptions<any, any>).name ?? field?.name(),
    disabled: (props as SelectOptions<any, any>).disabled || field?.disabled(),
  }));
  useControllerEntry(() => props.controller, select);
  placeholders.set(select, () => props.placeholder);
  // Without `itemToLabel`, the trigger shows labels only once the items are
  // prepared for selection: prepare them, if the selection needs it.
  watch.once(() => {
    if (!untrack(() => (props as SelectOptions<any, any>).itemToLabel)) {
      const { internal } = select.api;
      if (internal.selection.needsItems(internal.hasValueIcon())) {
        internal.prepare();
      }
    }
  });
  // Written by a SelectContent among the children, while the children render.
  const hasContent = atom(false, { snapshot: false });
  const setHasContent = (present: boolean) => {
    if (hasContent() !== present) {
      queueMicrotask(() => {
        try {
          hasContent.set(present);
        } catch {
          // The select unmounted before the tick ran: the atom is gone with it.
        }
      });
    }
  };
  const children = childOf(props);
  const items = () => (props as SelectOptions<any, any>).items;
  const multiple = () => (props as SelectOptions<any, any>).multiple;
  return (
    <SelectContext.Provider value={select}>
      <ContainerContext.Provider value={{ container: () => props.container }}>
        {providePrimitive(select, () => (
          <>
            <OwnContentContext.Provider value={{ register: setHasContent }}>
              {children as JSX.Element}
            </OwnContentContext.Provider>
            {items() && !hasContent() ? (
              <OwnContentContext.Provider value={null}>
                <SelectContent />
              </OwnContentContext.Provider>
            ) : null}
            {formInputs(select, multiple)}
          </>
        ))}
      </ContainerContext.Provider>
    </SelectContext.Provider>
  );
}

/**
 * A visible label for the select.
 * @stable
 */
const SelectLabel = parts.Label;

type TriggerPartProps = Omit<PartProps<"button", SelectTriggerState>, Clashing> &
  SelectTriggerProps;

/**
 * The button that opens the list, showing the value. A trigger outside the
 * select connects through `controller`.
 * @stable
 */
function SelectTrigger(props: TriggerPartProps) {
  const select = useControllerTarget(
    () => (props as { controller?: SelectOptions<any, any>["controller"] }).controller,
    context(SelectContext)(),
  );
  const rest = omit(props, "disabled", "controller");
  const field = useFieldControl(rest);
  const current = select();
  return !current ? (
    renderStatic(
      "button",
      () => ({
        attrs: { type: "button", disabled: props.disabled ? "" : undefined },
        state: {
          open: false,
          disabled: !!props.disabled,
          readOnly: false,
          required: false,
          placeholder: true,
        },
      }),
      joinField(field, rest, "button"),
    )
  ) : (
    <SelectContext.Provider value={current}>
      {usePart(
        current,
        "trigger",
        () => ({
          disabled: props.disabled,
          named: !!field || (rest as Record<string, any>)["aria-labelledby"] != null,
        }),
        joinField(field, withValue(rest), "button"),
        "button",
      )}
    </SelectContext.Provider>
  );
}

function withValue(rest: Record<string, any>) {
  const children = childOf(rest);
  return {
    ...rest,
    get children() {
      return children ?? <SelectValue />;
    },
  };
}

const unselected = {
  value: null,
  label: "",
  labels: [],
  placeholder: true,
};

/**
 * What the trigger shows: the value's label, or the placeholder.
 * @stable
 */
function SelectValue(
  props: Omit<PartProps<"span", SelectValueState>, Clashing> & SelectValueProps,
) {
  const select = context(SelectContext)();
  const rest = omit(props, "placeholder", "maxLabels", "getMoreLabel");
  if (!select) {
    return renderStatic("span", () => ({ attrs: {}, state: unselected }), {
      ...rest,
      get children() {
        return props.children ?? props.placeholder ?? null;
      },
    });
  }
  const current = select;
  const placeholder = () =>
    placeholders.get(current)?.() ?? current.state.placeholder;
  const part = () => ({
    placeholder: props.placeholder,
    maxLabels: props.maxLabels,
    getMoreLabel: props.getMoreLabel,
  });
  const children = childOf(props);
  const user = {
    ...rest,
    get children() {
      return (
        children ??
        ((state: SelectValueState) =>
          state.placeholder
            ? (props.placeholder ?? placeholder() ?? null)
            : state.label)
      );
    },
  };
  return usePart(current, "value", part, user, "span");
}

/**
 * The popup that holds the list, positioned against the trigger.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function SelectContent(
  props: PartProps<"div", SelectContentState> & SelectContentProps,
) {
  const select = useSelect();
  const fromRoot = context(ContainerContext)()?.container;
  const target = usePopupContainer(
    () => (props.container ?? fromRoot?.()) as PopupContainer,
  );
  void target;
  const register = context(OwnContentContext)()?.register;
  watch.once(() => {
    if (register) {
      queueMicrotask(() => register(true));
      return () => register(false);
    }
    return () => {};
  });
  const content = () => ({
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
    alignItemWithTrigger: props.alignItemWithTrigger,
    keepMounted: props.keepMounted,
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
    "alignItemWithTrigger",
    "keepMounted",
    "container",
  );
  const body = {
    ...rest,
    get children() {
      // From the part's state, so items that arrive after the select rendered
      // still render their rows.
      return (
        children ??
        ((state: SelectContentState) =>
          state.items ? <SelectItems items={state.items} /> : null)
      );
    },
  };
  const open = select.present("content", content);
  const element = usePart(select, "content", content, body, "div");
  return open ? element : null;
}

/**
 * The listbox. Without children, it renders the select's `items`, filtered.
 * @stable
 */
function SelectList(props: Record<string, any>) {
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return (
        children ??
        ((state: SelectContentState) =>
          state.items ? <SelectItems items={state.items} /> : null)
      );
    },
  };
  return <parts.List {...rest} />;
}

/**
 * The search field that filters the list.
 * @stable
 */
const SelectInput = parts.Input;

/**
 * What shows when no item matches the search. Hidden while something does.
 * @stable
 */
function SelectEmpty(props: PartProps<"div", SelectEmptyState>) {
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return typeof children === "function"
        ? children
        : (state: SelectEmptyState) => (state.empty ? children : null);
    },
  };
  return <parts.Empty {...rest} />;
}

/**
 * How many items match the search, for screen readers.
 * @stable
 */
const SelectStatus = parts.Status;

/**
 * An option. Pressing it chooses it, or toggles it with `multiple`.
 * @stable
 */
const SelectItem = parts.Item as <T = string>(
  props: Omit<PartProps<"div", SelectItemState>, Clashing> & SelectItemProps<T>,
) => JSX.Element;

/**
 * An item's text with the query's matches in `<mark>`.
 * @stable
 */
function SelectItemText(props: PartProps<"span", SelectItemTextState>) {
  const item = useAround(selectPrimitive, "item");
  if (!item) {
    throw new Error("<SelectItemText> must be used inside <SelectItem>.");
  }
  const key = () => (item() as { value: string }).value;
  const part = () => ({
    id: key(),
    text: textToMark(props.children, (item() as { label?: string }).label ?? key()),
  });
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return typeof children === "function"
        ? children
        : (state: { segments: { text: string; match: boolean }[] }) =>
            markSegments(state.segments);
    },
  };
  return usePart(useSelect(), "item-text", part, rest, "span");
}

/**
 * A checkbox that chooses every item. Sits in a group, choosing its items.
 * @stable
 */
function SelectSelectAll(props: PartProps<"div", SelectSelectAllState>) {
  const select = useSelect();
  usePlugin(select, selectSelectAll);
  const group = useAround(selectPrimitive, "group")?.().id as string | undefined;
  return usePart(
    select,
    "select-all",
    () => ({ id: selectAllKey(group) }),
    props,
    "div",
  );
}

/**
 * The check beside a chosen item.
 * @stable
 */
const SelectItemIndicator = parts.ItemIndicator;

/**
 * An item's icon, or the value's icon in the trigger. Needs the items.
 * @stable
 */
function SelectItemIcon(
  props: PartProps<"span", SelectItemIconState> & SelectItemIconProps,
) {
  const select = useSelect();
  usePlugin(select, selectItemIcons);
  const item = useAround(selectPrimitive, "item");
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextSelectId += 1)}`, {
    snapshot: false,
  });
  const part = () => ({
    id: idBox(),
    mirror: props.mirror,
    item: (item?.() as { value: string } | undefined)?.value,
  });
  return usePart(select, "item-icon", part, omit(props, "mirror"), "span");
}

/**
 * The chosen value's icon, shown in the trigger next to the value.
 * @stable
 */
function SelectValueIcon(props: Omit<PartProps<"span">, "children">) {
  const select = context(SelectContext)();
  if (!select) {
    return null;
  }
  usePlugin(select, selectItemIcons);
  return usePart(select, "value-icon", undefined, props, "span");
}

/**
 * Items under one heading.
 * @stable
 */
const SelectGroup = parts.Group;

/**
 * A group's heading.
 * @stable
 */
const SelectGroupLabel = parts.GroupLabel;

/**
 * A line between groups.
 * @stable
 */
const SelectSeparator = parts.Separator;

/**
 * A button that empties the value.
 * @stable
 */
const SelectClear = parts.Clear;

/**
 * An arrow on the list's edge that points at its trigger.
 * @stable
 */
const SelectArrow = parts.Arrow;

/**
 * The select's items rendered with its parts: an option per item, groups
 * with their labels, and separators.
 * @stable
 */
function SelectItems(props: { items: readonly unknown[] }) {
  return (
    <ListItems
      items={props.items as Parameters<typeof ListItems>[0]["items"]}
      parts={listParts}
    />
  );
}

const listParts = {
  Item: SelectItem,
  Group: SelectGroup,
  GroupLabel: SelectGroupLabel,
  Separator: SelectSeparator,
};

let nextSelectId = 0;

export { createSelectController } from "@ui-sdk/core/select";
export type {
  SelectApi,
  SelectArrowState,
  SelectChangeOptions,
  SelectClearProps,
  SelectClearState,
  SelectContentProps,
  SelectContentState,
  SelectController,
  SelectDismissReason,
  SelectEmptyState,
  SelectInputState,
  SelectItemIconProps,
  SelectItemIconState,
  SelectItemIndicatorProps,
  SelectItemIndicatorState,
  SelectItemProps,
  SelectItemState,
  SelectItemTextState,
  SelectOpenChangeReason,
  SelectOptions,
  SelectPrimitive,
  SelectQueryChangeReason,
  SelectSelectAllState,
  SelectStatusState,
  SelectTriggerProps,
  SelectTriggerState,
  SelectValue as SelectValueData,
  SelectValueChangeReason,
  SelectValueProps,
  SelectValueState,
} from "@ui-sdk/core/select";

export {
  Select,
  SelectArrow,
  SelectClear,
  SelectContent,
  SelectEmpty,
  SelectGroup,
  SelectGroupLabel,
  SelectInput,
  SelectItem,
  SelectItemIcon,
  SelectItemIndicator,
  SelectItems,
  SelectItemText,
  SelectLabel,
  SelectList,
  type SelectProps,
  SelectSelectAll,
  SelectSeparator,
  SelectStatus,
  SelectTrigger,
  SelectValue,
  SelectValueIcon,
};
