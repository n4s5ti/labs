// Trigger menu (port of `@ui-sdk/solid`'s `trigger-menu`).
//
// The list renders inline, in place, while its slot is present: Ilha has no
// portal, so a second island (and its broken context/atoms) is out. The
// `container` option is accepted and ignored for the same reason. Ancestor
// overflow or stacking contexts clip it; that is the documented tradeoff.
// The menu types in an editor: it takes its adapter as its `editor` option,
// or inherits one from `EditorContext`.
import {
  triggerMenu as triggerMenuPrimitive,
  type TextEditorAdapter,
  type TriggerMenuContentProps,
  type TriggerMenuContentState,
  type TriggerMenuEmptyState,
  type TriggerMenuHintState,
  type TriggerMenuItemProps,
  type TriggerMenuItemState,
  type TriggerMenuOptions,
  type TriggerMenuStatusState,
} from "@ui-sdk/core/trigger-menu";
import { atom, context, createContext, watch } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { EditorContext } from "./editor-context.ts";
import { ListItems } from "./list-text.tsx";
import { useControllerEntry, usePopupContainer, type PopupContainer } from "./popup.ts";
import {
  childOf,
  createParts,
  omit,
  providePrimitive,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

const parts = createParts(triggerMenuPrimitive, {
  input: "textarea",
  item: "div",
  "item-icon": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
});

const TriggerMenuContext = createContext<PrimitiveHandle<
  typeof triggerMenuPrimitive
> | null>(null);
// Function values in contexts are invoked on read (an effect-atom rule), so
// every context value here is an object, like the menubar's: bare getters
// would run with effect internals and poison the flag.
const ContainerContext = createContext<{ container: () => unknown } | null>(null);
// Where a TriggerMenuContent among the menu's children says it's there, so a
// data menu renders its own list only when there's none.
const OwnContentContext = createContext<{
  register: (present: boolean) => void;
} | null>(null);

function useTriggerMenu() {
  const menu = context(TriggerMenuContext)();
  if (!menu) {
    throw new Error("TriggerMenu parts must be used inside <TriggerMenu>.");
  }
  return menu;
}

// Element props that mean something else on a trigger menu part.
type Clashing = "value" | "defaultValue" | "onChange" | "onSelect";

/**
 * The props of `TriggerMenu`.
 * @stable
 */
type TriggerMenuProps<T = string> = TriggerMenuOptions<T> & {
  children?: JSX.Element;
};

/**
 * A menu that opens while typing a trigger, like `@` for mentions. Types in
 * the editor it wraps, or in its own input.
 * @stable
 */
function TriggerMenu<T = string>(props: TriggerMenuProps<T>) {
  // Reading a function-valued context calls it (Ilha invokes the value on
  // read), so this is already the inherited editor, not the getter.
  const inherited = context(EditorContext)() as unknown as
    | TextEditorAdapter
    | undefined;
  const options = omit(props, "children", "container", "editor");
  const menu = usePrimitive(triggerMenuPrimitive, () => ({
    ...(options as TriggerMenuOptions<T>),
    editor: (props as TriggerMenuOptions<T>).editor ?? inherited,
  }));
  useControllerEntry(() => props.controller, menu);
  // Written by a TriggerMenuContent among the children, while the children render.
  const hasContent = atom(false, { snapshot: false });
  const setHasContent = (present: boolean) => {
    if (hasContent() !== present) {
      queueMicrotask(() => {
        try {
          hasContent.set(present);
        } catch {
          // The menu unmounted before the tick ran: the atom is gone with it.
        }
      });
    }
  };
  const children = childOf(props);
  return (
    <TriggerMenuContext.Provider value={menu}>
      <ContainerContext.Provider value={{ container: () => props.container }}>
        {providePrimitive(menu, () => (
          <>
            <OwnContentContext.Provider value={{ register: setHasContent }}>
              {children as JSX.Element}
            </OwnContentContext.Provider>
            {!hasContent() ? (
              <OwnContentContext.Provider value={null}>
                <TriggerMenuContent />
              </OwnContentContext.Provider>
            ) : null}
          </>
        ))}
      </ContainerContext.Provider>
    </TriggerMenuContext.Provider>
  );
}

/**
 * The text the menu filters. The trigger menu types in the editor it wraps;
 * without one, this is its own field.
 * @stable
 */
const TriggerMenuInput = parts.Input;

/**
 * The popup that holds the list, positioned against the caret.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function TriggerMenuContent(
  props: PartProps<"div", TriggerMenuContentState> & TriggerMenuContentProps,
) {
  const menu = useTriggerMenu();
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
    "keepMounted",
    "container",
  );
  const withList = {
    ...rest,
    get children() {
      return children ?? <TriggerMenuList />;
    },
  };
  const open = menu.present("content", content);
  const element = usePart(menu, "content", content, withList, "div");
  return open ? element : null;
}

/**
 * The listbox. Without children, it renders the menu's `items`, filtered.
 * @stable
 */
function TriggerMenuList(props: PartProps<"div", TriggerMenuContentState>) {
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return (
        children ??
        ((state: TriggerMenuContentState) =>
          state.items ? <TriggerMenuItems items={state.items} /> : null)
      );
    },
  };
  return usePart(useTriggerMenu(), "list", undefined, rest, "div");
}

/**
 * An option. Pressing it replaces the query with it.
 * @stable
 */
const TriggerMenuItem = parts.Item as <T = string>(
  props: Omit<PartProps<"div", TriggerMenuItemState>, Clashing> &
    TriggerMenuItemProps<T>,
) => JSX.Element;

/**
 * An item's icon. Needs the items.
 * @stable
 */
const TriggerMenuItemIcon = parts.ItemIcon;

/**
 * Items under one heading.
 * @stable
 */
const TriggerMenuGroup = parts.Group;

/**
 * A group's heading.
 * @stable
 */
const TriggerMenuGroupLabel = parts.GroupLabel;

/**
 * A line between groups.
 * @stable
 */
const TriggerMenuSeparator = parts.Separator;

/**
 * What shows when no item matches the query. Hidden while something does.
 * @stable
 */
function TriggerMenuEmpty(props: PartProps<"div", TriggerMenuEmptyState>) {
  const menu = useTriggerMenu();
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return typeof children === "function"
        ? children
        : (state: TriggerMenuEmptyState) => (state.empty ? children : null);
    },
  };
  return usePart(menu, "empty", undefined, rest, "div");
}

/**
 * How many items match the query, for screen readers.
 * @stable
 */
function TriggerMenuStatus(props: PartProps<"div", TriggerMenuStatusState>) {
  const hasChildren = "children" in props;
  return usePart(
    useTriggerMenu(),
    "status",
    () => ({ text: !hasChildren }),
    props,
    "div",
  );
}

/**
 * A hint for the highlighted item's argument, like a parameter's docs.
 * @stable
 */
function TriggerMenuHint(props: PartProps<"span", TriggerMenuHintState>) {
  const hasChildren = "children" in props;
  return usePart(
    useTriggerMenu(),
    "hint",
    () => ({ text: !hasChildren }),
    props,
    "span",
  );
}

/**
 * The menu's items rendered with its parts: an option per item, groups with
 * their labels, and separators.
 * @stable
 */
function TriggerMenuItems(props: { items: readonly unknown[] }) {
  return (
    <ListItems
      items={props.items as Parameters<typeof ListItems>[0]["items"]}
      parts={listParts}
    />
  );
}

const listParts = {
  Item: TriggerMenuItem,
  Group: TriggerMenuGroup,
  GroupLabel: TriggerMenuGroupLabel,
  Separator: TriggerMenuSeparator,
};

export {
  createTriggerMenuController,
  textFieldAdapter,
} from "@ui-sdk/core/trigger-menu";
export type {
  EditorChange,
  EditorReplaceOptions,
  TextRect,
  TriggerAfter,
  TriggerArgument,
  TriggerBoundary,
  TriggerDefinition,
  TriggerItemsLoader,
  TriggerMatch,
  TriggerMenuApi,
  TriggerMenuChangeOptions,
  TriggerMenuContentProps,
  TriggerMenuContentState,
  TriggerMenuController,
  TriggerMenuData,
  TriggerMenuDataGroup,
  TriggerMenuDataItem,
  TriggerMenuDismissReason,
  TriggerMenuEmptyState,
  TriggerMenuHintState,
  TriggerMenuInputState,
  TriggerMenuItemIconProps,
  TriggerMenuItemIconState,
  TriggerMenuItemProps,
  TriggerMenuItemState,
  TriggerMenuOpenChangeReason,
  TriggerMenuOptions,
  TriggerMenuPrimitive,
  TriggerMenuQueryChangeReason,
  TriggerMenuSelectDetails,
  TriggerMenuStatusState,
  TriggerRule,
} from "@ui-sdk/core/trigger-menu";

export {
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuEmpty,
  TriggerMenuGroup,
  TriggerMenuGroupLabel,
  TriggerMenuHint,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuItemIcon,
  TriggerMenuItems,
  TriggerMenuList,
  type TriggerMenuProps,
  TriggerMenuSeparator,
  TriggerMenuStatus,
};
