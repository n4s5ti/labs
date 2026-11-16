// Navigation menu (port of `@ui-sdk/solid`'s `navigation-menu`).
//
// Content and the viewport render inline, in place, while their slot is
// present: Ilha has no portal, so a second island (and its broken
// context/atoms) is out. The `container` option is accepted and ignored for
// the same reason. Ancestor overflow or stacking contexts clip the content;
// that is the documented tradeoff.
import {
  navigationMenu as navigationMenuPrimitive,
  type NavigationMenuContentProps,
  type NavigationMenuContentState,
  type NavigationMenuItemProps,
  type NavigationMenuItemState,
  type NavigationMenuLinkIconProps,
  type NavigationMenuLinkIconState,
  type NavigationMenuOptions,
  type NavigationMenuState,
  type NavigationMenuViewportProps,
  type NavigationMenuViewportState,
} from "@ui-sdk/core/navigation-menu";
import { atom, context, createContext } from "ilha";
import type { PopupContainer } from "./popup.ts";
import {
  createParts,
  omit,
  renderAs,
  useHandle,
  useNearest,
  usePart,
  type PartProps,
} from "./primitive.ts";

const parts = createParts(navigationMenuPrimitive, {
  root: "nav",
  list: "ul",
  trigger: "button",
  link: "a",
  indicator: "div",
});

// The item a part is in, by value. Wrapped in an object: Ilha atoms treat a
// provided function as an updater, so a bare getter would be called on
// provide.
const ItemContext = createContext<{ value: () => string } | null>(null);

function useItem(part: string) {
  const item = context(ItemContext)();
  if (item === null) {
    throw new Error(
      `<NavigationMenu${part}> must be used inside <NavigationMenuItem>.`,
    );
  }
  return item.value;
}

// Element props that mean something else on a navigation menu.
type Clashing = "value" | "defaultValue" | "onChange" | "onSelect";

/**
 * The props of `NavigationMenu`.
 * @stable
 */
type NavigationMenuProps<T extends string = string> =
  NavigationMenuOptions<T> & Omit<PartProps<"nav", NavigationMenuState<T>>, Clashing>;

let nextNavigationMenuId = 0;

/**
 * A <nav> landmark. Inside another menu's content it's a nested menu, which
 * renders a <div> and closes with its parent.
 * @stable
 */
function NavigationMenu<T extends string = string>(
  props: NavigationMenuProps<T>,
) {
  const parentMenu = useNearest(navigationMenuPrimitive);
  const parentItem = context(ItemContext)();
  const nested = !!parentMenu && parentItem !== null;
  // Accepted and ignored: with no portal every content renders in place.
  const rest = omit(props, "container");
  return (
    <ItemContext.Provider value={null}>
      <parts.Root<T>
        {...(rest as NavigationMenuProps<T>)}
        render={props.render ?? renderAs(() => (nested ? "div" : "nav"))}
        parent={nested
          ? { api: parentMenu!.api, item: parentItem!.value() }
          : undefined}
      />
    </ItemContext.Provider>
  );
}

/**
 * The list of top-level items.
 * @stable
 */
const NavigationMenuList = parts.List;

/**
 * One item: a link, or a trigger and the content it opens.
 * @stable
 */
function NavigationMenuItem(
  props: Omit<PartProps<"li", NavigationMenuItemState>, Clashing> &
    NavigationMenuItemProps,
) {
  const menu = useHandle(navigationMenuPrimitive);
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextNavigationMenuId += 1)}`, {
    snapshot: false,
  });
  const generated = idBox();
  const value = () => props.value ?? generated;
  return (
    <ItemContext.Provider value={{ value }}>
      {usePart(
        menu,
        "item",
        () => ({ value: value() }),
        omit(props, "value"),
        "li",
      )}
    </ItemContext.Provider>
  );
}

/**
 * The button that opens its item's content. Resting the pointer on it opens the content too.
 * @stable
 */
const NavigationMenuTrigger = parts.Trigger;

/**
 * Renders in place while its item is open, and in place while closed and kept.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function NavigationMenuContent(
  props: Omit<PartProps<"div", NavigationMenuContentState>, Clashing> &
    NavigationMenuContentProps & { container?: PopupContainer },
) {
  const menu = useHandle(navigationMenuPrimitive);
  const value = useItem("Content");
  const content = () => ({
    value: value(),
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
    keepMounted: props.keepMounted,
    hiddenUntilFound: props.hiddenUntilFound,
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
    "keepMounted",
    "hiddenUntilFound",
    "container",
  );
  const open = menu.present("content", content);
  const element = usePart(menu, "content", content, rest, "div");
  return open ? element : null;
}

/**
 * A link. Pressing it closes the menu, and `current` marks the current page with `aria-current="page"`.
 * @stable
 */
const NavigationMenuLink = parts.Link;

/**
 * An icon inside a link. Screen readers skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
function NavigationMenuLinkIcon(
  props: PartProps<"span", NavigationMenuLinkIconState> &
    NavigationMenuLinkIconProps,
) {
  const menu = useHandle(navigationMenuPrimitive);
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextNavigationMenuId += 1)}`, {
    snapshot: false,
  });
  const id = idBox();
  // Keyed by its own id, so several icons stay apart.
  return usePart(
    menu,
    "link-icon",
    () => ({ id, mirror: props.mirror }),
    omit(props, "mirror"),
    "span",
  );
}

/**
 * The one panel every content renders into. It takes the open content's size
 * as --viewport-width and --viewport-height, and moves to the open trigger.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function NavigationMenuViewport(
  props: PartProps<"div", NavigationMenuViewportState> &
    NavigationMenuViewportProps & { container?: PopupContainer },
) {
  const menu = useHandle(navigationMenuPrimitive);
  const viewport = () => ({
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
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
    "container",
  );
  const open = menu.present("viewport", viewport);
  const element = usePart(menu, "viewport", viewport, rest, "div");
  return open ? element : null;
}

/**
 * Sits under the open trigger, or under the link with `current` while every panel is closed. Screen readers
 * skip it.
 * @stable
 */
const NavigationMenuIndicator = parts.Indicator;

export { createNavigationMenuController } from "@ui-sdk/core/navigation-menu";
export type {
  NavigationMenuApi,
  NavigationMenuChangeOptions,
  NavigationMenuContentProps,
  NavigationMenuContentState,
  NavigationMenuController,
  NavigationMenuIndicatorState,
  NavigationMenuItemProps,
  NavigationMenuItemState,
  NavigationMenuLinkIconProps,
  NavigationMenuLinkIconState,
  NavigationMenuLinkProps,
  NavigationMenuLinkState,
  NavigationMenuListState,
  NavigationMenuMotion,
  NavigationMenuOptions,
  NavigationMenuOrientation,
  NavigationMenuPrimitive,
  NavigationMenuState,
  NavigationMenuTriggerProps,
  NavigationMenuTriggerState,
  NavigationMenuValueChangeReason,
  NavigationMenuViewportProps,
  NavigationMenuViewportState,
} from "@ui-sdk/core/navigation-menu";

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuLinkIcon,
  NavigationMenuList,
  type NavigationMenuProps,
  NavigationMenuTrigger,
  NavigationMenuViewport,
};
