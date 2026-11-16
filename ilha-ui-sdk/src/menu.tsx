// Menu (port of `@ui-sdk/solid`'s `menu`).
//
// The content renders inline, in place, while its slot is present: Ilha has
// no portal, so a second island (and its broken context/atoms) is out. The
// `container` option is accepted and ignored for the same reason; submenus
// render inside their parent's content rather than in its popup. Ancestor
// overflow or stacking contexts clip the content; that is the documented
// tradeoff.
import { formatShortcut } from "@ui-sdk/core";
import {
  menu as menuPrimitive,
  type MenuCheckboxItemProps,
  type MenuCheckboxItemState,
  type MenuContentProps,
  type MenuContentState,
  type MenuContextTriggerProps,
  type MenuContextTriggerState,
  type MenuData,
  type MenuDataItem,
  type MenuItemIconProps,
  type MenuItemIconState,
  type MenuItemIndicatorProps,
  type MenuItemIndicatorState,
  type MenuItemProps,
  type MenuItemState,
  type MenuOptions,
  type MenuRadioGroupProps,
  type MenuRadioGroupState,
  type MenuRadioItemProps,
  type MenuRadioItemState,
  type MenuSubTriggerProps,
  type MenuTriggerProps,
  type MenuTriggerState,
} from "@ui-sdk/core/menu";
import {
  menuCheckable,
  menuContextTrigger,
  menuItemIcons,
} from "@ui-sdk/core/renderer";
import { atom, context, createContext, watch } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { MenubarContext } from "./menubar-context.ts";
import {
  useControllerEntry,
  useControllerTarget,
} from "./controller-target.ts";
import {
  childOf,
  createParts,
  omit,
  providePrimitive,
  renderStatic,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

const parts = createParts(menuPrimitive, { separator: "div", shortcut: "span" });

type MenuContextValue = PrimitiveHandle<typeof menuPrimitive>;

const MenuContext = createContext<MenuContextValue | null>(null);
// Whether shortcuts show Apple's glyphs, from the root menu. Wrapped in an
// object: Ilha atoms treat a provided function as an updater, so a bare
// getter would be called on provide.
const AppleContext = createContext<{ apple: () => boolean }>({
  apple: () => false,
});
// Where a MenuContent among the menu's children says it's there, so a data
// menu renders its own content only when there's none. Wrapped in an object
// for the same reason as `AppleContext`.
const OwnContentContext = createContext<{
  register: (present: boolean) => void;
} | null>(null);
const GroupContext = createContext<string | null>(null);
// A radio group's name, and its value for the items that key on it.
const RadioGroupContext = createContext<{
  name: () => string;
  value: () => MenuRadioGroupState["value"];
} | null>(null);
// The checkbox or radio item an indicator belongs to.
const ItemContext = createContext<{
  item: "checkbox-item" | "radio-item";
  itemKey: () => string;
  group?: () => string;
} | null>(null);

function useMenu() {
  const menu = context(MenuContext)();
  if (!menu) {
    throw new Error("Menu parts must be used inside <Menu>.");
  }
  return menu;
}

// Element props that mean something else on a menu part.
type Clashing =
  "value" | "defaultValue" | "onChange" | "onSelect" | "defaultChecked";

/**
 * The props of `Menu`.
 * @stable
 */
type MenuProps = MenuOptions & {
  children?: JSX.Element;
};

// One-shot renderer plugin install: `instance.use` adds behavior once, but a
// component body re-runs on every tick, so guard it per handle.
function usePlugin(
  handle: { instance: { use: (plugin: any) => void } },
  plugin: any,
) {
  const installed = atom.lazy(() => ({ value: false }), { snapshot: false });
  if (!installed().value) {
    installed().value = true;
    handle.instance.use(plugin);
  }
}

let nextMenuId = 0;

// Made once per component: a new id each render would make a new part each
// render (core keys parts by id), resubscribing forever.
function useMenuId() {
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextMenuId += 1)}`, {
    snapshot: false,
  });
  return idBox();
}

/**
 * A list of actions and options, opened from a button or a right-click. Put its trigger and content inside.
 * @stable
 */
function Menu(props: MenuProps) {
  const menubar = context(MenubarContext)();
  const options = omit(props, "children", "container");
  const menu = usePrimitive(menuPrimitive, () => ({
    ...options,
    menubar: menubar ? () => menubar.api : undefined,
  }));
  useControllerEntry(() => props.controller, menu);
  const apple = appleSignal(menu);
  // Written by a MenuContent among the children, while the children render.
  const hasContent = atom(false, { snapshot: false });
  const setHasContent = (present: boolean) => {
    if (hasContent() !== present) {
      queueMicrotask(() => {
        hasContent.set(present);
      });
    }
  };
  // `props.children` is read once: every read of a JSX children getter makes
  // the parts again.
  const children = childOf(props);
  const items = props.items;
  return (
    <MenuContext.Provider value={menu}>
      <AppleContext.Provider value={{ apple: () => apple() }}>
        {providePrimitive(menu, () => (
          <>
            {/* A menu inside this one's content is no item of the menubar. */}
            <MenubarContext.Provider value={null}>
              <OwnContentContext.Provider value={{ register: setHasContent }}>
                {children as JSX.Element}
              </OwnContentContext.Provider>
            </MenubarContext.Provider>
            <OwnContentContext.Provider value={null}>
              {items && !hasContent() ? (
                <MenuContent>
                  <MenuItems items={items} />
                </MenuContent>
              ) : null}
            </OwnContentContext.Provider>
          </>
        ))}
      </AppleContext.Provider>
    </MenuContext.Provider>
  );
}

// Children, called with the part's state when they're a function of it. A
// function that takes nothing is a child component's accessor, which renders
// as it is.
function withState(children: unknown, state: unknown) {
  return typeof children === "function" && children.length > 0
    ? (children as (state: unknown) => JSX.Element)(state)
    : (children as JSX.Element);
}

// Shortcut text is neutral until the client binds, so the server and the
// first client render agree, and the platform's glyphs follow a moment later.
// Item state doesn't carry it, so the root menu listens once for every item.
function appleSignal(menu: MenuContextValue) {
  const apple = atom(menu.state.apple, { snapshot: false });
  // Written from core's listeners, which can fire inside a disposal, like a
  // list removing a row whose trigger names this menu's controller.
  watch.once(() => {
    const sync = () => {
      apple.set(menu.state.apple);
    };
    sync();
    const unsubscribe = menu.instance.subscribe(sync);
    return unsubscribe;
  });
  return apple;
}

type TriggerProps = MenuTriggerProps;

/**
 * The button that opens the menu. A trigger outside the menu connects through `controller`.
 * @stable
 */
function MenuTrigger(
  props: Omit<PartProps<"button", MenuTriggerState>, Clashing> & TriggerProps,
) {
  const menu = useControllerTarget(
    () => (props as { controller?: MenuOptions["controller"] }).controller,
    context(MenuContext)(),
  );
  const rest = omit(
    props,
    "disabled",
    "focusableWhenDisabled",
    "payload",
    "shortcut",
    "controller",
  );
  const id = useMenuId();
  const current = menu();
  return !current
    // Until the menu it names mounts, a trigger outside the menu is a plain button.
    ? renderStatic(
      "button",
      () => ({
        attrs: {},
        state: { open: false, disabled: !!props.disabled },
      }),
      {
        ...rest,
        type: "button",
        get disabled() {
          return props.disabled && !props.focusableWhenDisabled;
        },
        get "aria-disabled"() {
          return (props.disabled && props.focusableWhenDisabled) || undefined;
        },
      },
    )
    : triggerPart(current, "trigger", "button", () => ({
      id,
      disabled: props.disabled,
      focusableWhenDisabled: props.focusableWhenDisabled,
      payload: props.payload,
      shortcut: props.shortcut,
    }), rest);
}

/**
 * An area that opens the menu at the pointer on a right-click or a long press, and on Shift+F10.
 * @stable
 */
function MenuContextTrigger(
  props: PartProps<"div", MenuContextTriggerState> & MenuContextTriggerProps,
) {
  const menu = useControllerTarget(
    () => (props as { controller?: MenuOptions["controller"] }).controller,
    context(MenuContext)(),
  );
  const rest = omit(props, "disabled", "payload", "controller");
  const id = useMenuId();
  const current = menu();
  if (!current) {
    // Until the menu it names mounts, a context trigger outside the menu is a plain div.
    return renderStatic(
      "div",
      () => ({
        attrs: {},
        state: { open: false, disabled: !!props.disabled },
      }),
      rest,
    );
  }
  usePlugin(current, menuContextTrigger);
  return triggerPart(current, "context-trigger", "div", () => ({
    id,
    disabled: props.disabled,
    payload: props.payload,
  }), rest);
}

// The bound part of a trigger or context area, once its menu is known.
function triggerPart(
  menu: MenuContextValue,
  slot: "trigger" | "context-trigger",
  tag: "button" | "div",
  trigger: () => MenuTriggerProps | MenuContextTriggerProps,
  props: Record<string, any>,
) {
  return usePart(menu, slot, trigger, props, tag);
}

/**
 * The popup that holds the items, positioned against the trigger that opened it.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function MenuContent<Payload = unknown>(
  props: PartProps<"div", MenuContentState<Payload>> & MenuContentProps,
) {
  const menu = useMenu();
  const content = () => ({
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
    finalFocus: props.finalFocus,
    keepMounted: props.keepMounted,
  });
  const rest = omit(
    props,
    "side",
    "align",
    "sideOffset",
    "alignOffset",
    "collisionPadding",
    "arrowPadding",
    "anchor",
    "finalFocus",
    "keepMounted",
    "container",
  );
  // Submenus render inside their parent's content.
  const nested = menu.api.parentMenu() !== undefined;
  // A root content tells its menu it's there. A submenu's content is no menu's own content.
  const register = nested ? null : context(OwnContentContext)()?.register;
  watch.once(() => {
    if (register) {
      queueMicrotask(() => register(true));
      return () => register(false);
    }
    return () => {};
  });
  const open = menu.present("content", content);
  const element = usePart(menu, "content", content, rest, "div");
  return open ? element : null;
}

/**
 * An action. Pressing it runs its `onSelect` and closes the menu, unless `closeOnSelect` is false.
 * @stable
 */
function MenuItem(
  props: Omit<PartProps<"div", MenuItemState>, Clashing> & MenuItemProps,
) {
  const menu = useMenu();
  const apple = context(AppleContext)().apple;
  const id = useMenuId();
  const item = () => ({
    id,
    value: props.value,
    label: props.label,
    disabled: props.disabled,
    shortcut: props.shortcut,
    closeOnSelect: props.closeOnSelect,
    destructive: props.destructive,
    onSelect: props.onSelect,
  });
  const rest = omit(
    props,
    "value",
    "label",
    "disabled",
    "shortcut",
    "closeOnSelect",
    "destructive",
    "onSelect",
  );
  const kids = childOf(rest);
  const withShortcut = {
    ...rest,
    get children() {
      return (state: MenuItemState) => (
        <>
          {withState(kids, state)}
          {props.shortcut ? (
            <MenuShortcut>
              {formatShortcut(props.shortcut, apple())}
            </MenuShortcut>
          ) : null}
        </>
      );
    },
  };
  return usePart(menu, "item", item, withShortcut, "div");
}

/**
 * Shows the keys of an item's shortcut, like `⌘S`, inside the item. Hidden from screen readers.
 * @stable
 */
const MenuShortcut = parts.Shortcut;

/**
 * An item that checks and unchecks an option.
 * @stable
 */
function MenuCheckboxItem(
  props: Omit<PartProps<"div", MenuCheckboxItemState>, Clashing> &
    MenuCheckboxItemProps,
) {
  const menu = useMenu();
  usePlugin(menu, menuCheckable);
  const item = () => ({
    value: props.value,
    label: props.label,
    disabled: props.disabled,
    checked: props.checked,
    defaultChecked: props.defaultChecked,
    onCheckedChange: props.onCheckedChange,
    closeOnSelect: props.closeOnSelect,
  });
  const rest = omit(
    props,
    "value",
    "label",
    "disabled",
    "checked",
    "defaultChecked",
    "onCheckedChange",
    "closeOnSelect",
  );
  const indicator = {
    item: "checkbox-item" as const,
    itemKey: () => props.value,
  };
  return (
    <ItemContext.Provider value={indicator}>
      {usePart(menu, "checkbox-item", item, rest, "div")}
    </ItemContext.Provider>
  );
}

/**
 * Radio items that share one value. `T` is inferred from `value`, `defaultValue` or `onValueChange`.
 * @stable
 */
function MenuRadioGroup<T extends string = string>(
  props: Omit<PartProps<"div", MenuRadioGroupState>, Clashing> &
    MenuRadioGroupProps<T>,
) {
  const menu = useMenu();
  usePlugin(menu, menuCheckable);
  const generated = useMenuId();
  const group = () => props.name ?? generated;
  const part = () => ({
    id: group(),
    name: group(),
    value: props.value as MenuRadioGroupProps["value"],
    defaultValue: props.defaultValue as MenuRadioGroupProps["defaultValue"],
    onValueChange: props
      .onValueChange as MenuRadioGroupProps["onValueChange"],
  });
  const rest = omit(props, "name", "value", "defaultValue", "onValueChange");
  // Core answers the items' checked state from the props the group last
  // recorded. The group's part is refreshed above before the items render
  // (Ilha paints children after their parent's body runs), so the record is
  // fresh without the Solid adapter's memo.
  const kids = childOf(rest);
  const withContext = {
    ...rest,
    get children() {
      return (state: MenuRadioGroupState) => (
        <RadioGroupContext.Provider
          value={{ name: group, value: () => state.value }}
        >
          {withState(kids, state)}
        </RadioGroupContext.Provider>
      );
    },
  };
  return usePart(menu, "radio-group", part, withContext, "div");
}

/**
 * An item in a `MenuRadioGroup`. Pressing it checks its value.
 * @stable
 */
function MenuRadioItem(
  props: Omit<PartProps<"div", MenuRadioItemState>, Clashing> &
    MenuRadioItemProps,
) {
  const menu = useMenu();
  usePlugin(menu, menuCheckable);
  const radioGroup = context(RadioGroupContext)();
  if (!radioGroup) {
    throw new Error("<MenuRadioItem> must be used inside <MenuRadioGroup>.");
  }
  // The group's value decides whether the item is checked, and a controlled
  // group changes it without touching the item, so the item follows it here.
  const group = () => (radioGroup.value(), radioGroup.name());
  const item = () => ({
    group: group(),
    value: props.value,
    label: props.label,
    disabled: props.disabled,
    closeOnSelect: props.closeOnSelect,
  });
  const rest = omit(props, "value", "label", "disabled", "closeOnSelect");
  const indicator = {
    item: "radio-item" as const,
    itemKey: () => props.value,
    group,
  };
  return (
    <ItemContext.Provider value={indicator}>
      {usePart(menu, "radio-item", item, rest, "div")}
    </ItemContext.Provider>
  );
}

/**
 * The check or dot inside a checkbox or radio item. Rendered while the item is checked, or always with `keepMounted`.
 * @stable
 */
function MenuItemIndicator(
  props: PartProps<"span", MenuItemIndicatorState> & MenuItemIndicatorProps,
) {
  const menu = useMenu();
  usePlugin(menu, menuCheckable);
  const id = useMenuId();
  const item = context(ItemContext)();
  if (!item) {
    throw new Error(
      "<MenuItemIndicator> must be used inside a checkbox or radio item.",
    );
  }
  const indicator = () => ({
    id,
    item: item.item,
    itemKey: item.itemKey(),
    group: item.group?.(),
    keepMounted: props.keepMounted,
  });
  return usePart(
    menu,
    "item-indicator",
    indicator,
    omit(props, "keepMounted"),
    "span",
  );
}

/**
 * An icon inside an item or a submenu trigger. Screen readers and typeahead skip it, and `mirror`
 * flips it in right-to-left text.
 * @stable
 */
function MenuItemIcon(
  props: PartProps<"span", MenuItemIconState> & MenuItemIconProps,
) {
  const menu = useMenu();
  usePlugin(menu, menuItemIcons);
  const id = useMenuId();
  return usePart(
    menu,
    "item-icon",
    () => ({ id, mirror: props.mirror }),
    omit(props, "mirror"),
    "span",
  );
}

/**
 * A group of items, named by its `MenuGroupLabel`.
 * @stable
 */
function MenuGroup(props: PartProps<"div">) {
  const menu = useMenu();
  const id = useMenuId();
  // It's named by its label once the label is in the page.
  return (
    <GroupContext.Provider value={id}>
      {usePart(menu, "group", () => ({ id }), props, "div")}
    </GroupContext.Provider>
  );
}

/**
 * The group's heading, which names the group.
 * @stable
 */
function MenuGroupLabel(props: PartProps<"div">) {
  const menu = useMenu();
  const radioGroup = context(RadioGroupContext)();
  const plainGroup = context(GroupContext)();
  if (!radioGroup && !plainGroup) {
    throw new Error(
      "<MenuGroupLabel> must be used inside <MenuGroup> or <MenuRadioGroup>.",
    );
  }
  const group = () => radioGroup?.name() ?? plainGroup ?? "";
  return usePart(
    menu,
    "group-label",
    () => ({ id: group(), group: group() }),
    props,
    "div",
  );
}

/**
 * A line between items or groups.
 * @stable
 */
const MenuSeparator = parts.Separator;

/**
 * The props of `MenuSub`.
 * @stable
 */
type MenuSubProps = Pick<
  MenuOptions,
  | "open"
  | "defaultOpen"
  | "onOpenChange"
  | "onOpenChangeComplete"
  | "loop"
  | "delay"
  | "controller"
  | "debug"
> & { children?: JSX.Element };

/**
 * A submenu. Put its `MenuSubTrigger` and `MenuSubContent` inside, in a menu's content.
 * @stable
 */
function MenuSub(props: MenuSubProps) {
  const parent = useMenu();
  const options = omit(props, "children");
  const menu = usePrimitive(menuPrimitive, () => ({
    ...options,
    parent: parent.api,
  }));
  return (
    <MenuContext.Provider value={menu}>
      {providePrimitive(menu, () => childOf(props) as JSX.Element)}
    </MenuContext.Provider>
  );
}

/**
 * The item that opens its submenu.
 * @stable
 */
function MenuSubTrigger(
  props: Omit<PartProps<"div", MenuTriggerState>, Clashing> &
    MenuSubTriggerProps,
) {
  const menu = useMenu();
  return usePart(
    menu,
    "trigger",
    () => ({ disabled: props.disabled }),
    omit(props, "disabled"),
    "div",
  );
}

/**
 * The submenu's popup, positioned beside its trigger.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
const MenuSubContent = MenuContent;

/**
 * Renders a data menu's items as bare parts. Used by `<Menu items>` when you place no `MenuContent`
 * of your own, and available for custom layouts.
 * @stable
 */
function MenuItems(props: { items: MenuData }) {
  // Keyed as React keys them: items and checkboxes by value, radio groups by
  // name, the rest by position, so a rebuilt list keeps its rows.
  return (
    <>
      {props.items.map((entry, index) => {
        const item: MenuDataItem =
          typeof entry === "string" ? { value: entry, label: entry } : entry;
        return <MenuEntry key={entryKey(item, index)} item={item} />;
      })}
    </>
  );
}

function entryKey(item: MenuDataItem, index: number) {
  switch (item.type) {
    case undefined:
    case "item":
    case "checkbox":
      return `${item.type ?? "item"}:${item.value}`;
    case "radio-group":
      return `radio-group:${item.name}`;
    default:
      return `${item.type}:${index}`;
  }
}

type Entry<Type extends MenuDataItem["type"]> = Extract<
  MenuDataItem,
  { type?: Type }
>;

// One row of a data menu. Its key fixes its type, so the type is read once
// and the fields follow the entry as it changes.
function MenuEntry(props: { item: MenuDataItem }) {
  // Narrowed by the key, which `entryKey` builds from the type.
  const entry = <Type extends MenuDataItem["type"]>() =>
    props.item as Entry<Type>;
  switch (props.item.type) {
    case undefined:
    case "item": {
      const item = entry<"item">();
      return (
        <MenuItem
          value={item.value}
          disabled={item.disabled}
          shortcut={item.shortcut}
          closeOnSelect={item.closeOnSelect}
          destructive={item.destructive}
        >
          {item.label}
        </MenuItem>
      );
    }
    case "separator":
      return <MenuSeparator />;
    case "group": {
      const group = entry<"group">();
      return (
        <MenuGroup>
          {group.label ? (
            <MenuGroupLabel>{group.label}</MenuGroupLabel>
          ) : null}
          <MenuItems items={group.items} />
        </MenuGroup>
      );
    }
    case "checkbox": {
      const item = entry<"checkbox">();
      return (
        <MenuCheckboxItem
          value={item.value}
          disabled={item.disabled}
          checked={item.checked}
          defaultChecked={item.defaultChecked}
          closeOnSelect={item.closeOnSelect}
        >
          {item.label}
        </MenuCheckboxItem>
      );
    }
    case "radio-group": {
      const group = entry<"radio-group">();
      return (
        <MenuRadioGroup
          name={group.name}
          value={group.value}
          defaultValue={group.defaultValue}
        >
          {group.label ? (
            <MenuGroupLabel>{group.label}</MenuGroupLabel>
          ) : null}
          {group.items.map((radio) => (
            <MenuRadioItem
              key={radio.value}
              value={radio.value}
              disabled={radio.disabled}
            >
              {radio.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      );
    }
    case "submenu": {
      const submenu = entry<"submenu">();
      return (
        <MenuSub>
          <MenuSubTrigger disabled={submenu.disabled}>
            {submenu.label}
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuItems items={submenu.items} />
          </MenuSubContent>
        </MenuSub>
      );
    }
  }
}

export { createMenuController } from "@ui-sdk/core/menu";
export type {
  MenuApi,
  MenuCheckboxItemProps,
  MenuCheckboxItemState,
  MenuActionDetails,
  MenuCheckedChangeDetails,
  MenuCheckedChangeReason,
  MenuContentProps,
  MenuContentState,
  MenuContextTriggerProps,
  MenuContextTriggerState,
  MenuController,
  MenuData,
  MenuDataItem,
  MenuDismissReason,
  MenuFinalFocus,
  MenuItemIconProps,
  MenuItemIconState,
  MenuItemIndicatorProps,
  MenuItemIndicatorState,
  MenuItemProps,
  MenuItemState,
  MenuOpenChangeReason,
  MenuOpenOptions,
  MenuOptions,
  MenuPayloadChangeReason,
  MenuPrimitive,
  MenuRadioGroupProps,
  MenuRadioGroupState,
  MenuRadioItemProps,
  MenuRadioItemState,
  MenuSubTriggerProps,
  MenuTriggerProps,
  MenuTriggerState,
  MenuValueChangeDetails,
  MenuValueChangeReason,
} from "@ui-sdk/core/menu";

export {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuContextTrigger,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemIcon,
  MenuItemIndicator,
  MenuItems,
  type MenuProps,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubContent,
  type MenuSubProps,
  MenuSubTrigger,
  MenuTrigger,
};
