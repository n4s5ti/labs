// Drawer (port of `@ui-sdk/solid`'s `drawer`).
//
// The backdrop and content render inline, in place, while their slot is
// present: Ilha has no portal, so a second island (and its broken
// context/atoms) is out. The `container` option is accepted and ignored for
// the same reason; the sheet-positioning viewport wrapper is skipped, and the
// content positions itself. Ancestor overflow or stacking contexts clip it;
// that is the documented tradeoff.
import type {
  DialogShortcutProps,
  DialogShortcutState,
  DialogTriggerState,
} from "@ui-sdk/core/dialog";
import {
  drawer as drawerPrimitive,
  type DrawerBackdropState,
  type DrawerContentProps,
  type DrawerContentState,
  type DrawerController,
  type DrawerOptions,
  type DrawerOutletProps,
  type DrawerTriggerProps,
  type DrawerOutletState,
} from "@ui-sdk/core/drawer";
import { atom, context, createContext } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
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

type DrawerContextValue = PrimitiveHandle<typeof drawerPrimitive>;

type TriggerPartProps = Omit<
  PartProps<"button", DialogTriggerState>,
  "value" | "onChange"
> &
  DrawerTriggerProps;
type OutletPartProps = PartProps<"div", DrawerOutletState> & DrawerOutletProps;

const parts = createParts(drawerPrimitive, {
  handle: "button",
  title: "h2",
  description: "p",
  close: "button",
});

// The drawer, for the parts that may find it through a controller.
const Context = createContext<DrawerContextValue | null>(null);
// The trigger a Shortcut part sits in: its shortcut, and the drawer it opens.
// A trigger connected through a controller sits outside the drawer, so its
// drawer comes from here.
const TriggerContext = createContext<{
  shortcut: () => string | undefined;
  drawer: () => DrawerContextValue | undefined;
} | null>(null);

let nextDrawerId = 0;

function useDrawer() {
  const drawer = context(Context)();
  if (!drawer) {
    throw new Error("Drawer parts must be used inside <Drawer>.");
  }
  return drawer;
}

// The drawer a part belongs to: the one its controller names, else the one around it.
function useDrawerOrRemote(
  controller: () => DrawerController<any, any> | undefined,
) {
  return useControllerTarget(controller, context(Context)());
}

/**
 * The props of `Drawer`.
 * @stable
 */
type DrawerProps = DrawerOptions & { children?: JSX.Element };

/**
 * A dialog presented as a sheet that slides in from an edge. Put its trigger, backdrop and content inside.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function Drawer(props: DrawerProps) {
  const options = omit(props, "children", "container");
  const drawer = usePrimitive(drawerPrimitive, () => ({ ...options }));
  useControllerEntry(() => props.controller, drawer);
  return providePrimitive(drawer, () => (
    <Context.Provider value={drawer}>
      {childOf(props) as JSX.Element}
    </Context.Provider>
  ));
}

/**
 * The button that opens the drawer. A trigger outside the drawer, like one per table row, connects through
 * `controller`.
 * @stable
 */
function DrawerTrigger(props: TriggerPartProps) {
  const drawer = useDrawerOrRemote(() => props.controller);
  const rest = omit(
    props,
    "disabled",
    "focusableWhenDisabled",
    "payload",
    "shortcut",
    "controller",
  );
  // Made once: a new id each render would make a new trigger part each render
  // (core keys parts by id), resubscribing forever.
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextDrawerId += 1)}`, {
    snapshot: false,
  });
  const shortcut = () => props.shortcut;
  const current = drawer();
  return (
    <TriggerContext.Provider value={{ shortcut, drawer }}>
      {!current
        // Until the drawer it names mounts, a trigger outside the drawer is a plain button.
        ? renderStatic(
          "button",
          () => ({
            attrs: {},
            state: { open: false, disabled: !!props.disabled },
          }),
          {
            ...rest,
            type: "button",
            disabled: props.disabled && !props.focusableWhenDisabled,
            "aria-disabled":
              (props.disabled && props.focusableWhenDisabled) || undefined,
          },
        )
        : (() => {
          const id = idBox();
          const trigger = () => ({
            id,
            disabled: props.disabled,
            focusableWhenDisabled: props.focusableWhenDisabled,
            payload: props.payload,
            shortcut: props.shortcut,
          });
          return usePart(current, "trigger", trigger, rest, "button");
        })()}
    </TriggerContext.Provider>
  );
}

/**
 * A dim behind the drawer. Its opacity follows the drawer, so give it a color like `bg-black/20`.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function DrawerBackdrop(props: PartProps<"div", DrawerBackdropState>) {
  const drawer = useDrawer();
  const part = () => ({});
  const open = drawer.present("backdrop", part);
  const element = usePart(drawer, "backdrop", part, props, "div");
  return open ? element : null;
}

/**
 * The sheet itself, a dialog.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function DrawerContent<Payload = unknown>(
  props: PartProps<"div", DrawerContentState<Payload>> & DrawerContentProps,
) {
  const drawer = useDrawer();
  const content = () => ({
    initialFocus: props.initialFocus,
    finalFocus: props.finalFocus,
    keepMounted: props.keepMounted,
  });
  const rest = omit(
    props,
    "initialFocus",
    "finalFocus",
    "keepMounted",
    "container",
  );
  const open = drawer.present("content", content);
  const element = usePart(drawer, "content", content, rest, "div");
  return open ? element : null;
}

/**
 * The grabber. Press it to move to the next snap point; arrow keys, Home and End step. Name it, like `aria-label="Resize"`.
 * @stable
 */
const DrawerHandle = parts.Handle;

/**
 * The drawer's title, which names it. A level 2 heading by default.
 * @stable
 */
const DrawerTitle = parts.Title;

/**
 * Describes the drawer while it's rendered. A paragraph by default.
 * @stable
 */
const DrawerDescription = parts.Description;

/**
 * A button that closes the drawer. An `action` runs first, and a Promise it returns keeps the drawer open
 * until it settles.
 * @stable
 */
const DrawerClose = parts.Close;

/**
 * Shows a trigger's shortcut, like `⌘K`, inside the trigger. Hidden from screen readers, which hear `aria-keyshortcuts`.
 * @stable
 */
function DrawerShortcut(
  props: PartProps<"span", DialogShortcutState> & DialogShortcutProps,
) {
  const trigger = context(TriggerContext)();
  const drawerCtx = context(Context)();
  if (!drawerCtx && !trigger) {
    throw new Error("Drawer parts must be used inside <Drawer>.");
  }
  // A trigger outside the drawer finds it through its controller only once
  // mounted, so inside one whose drawer hasn't mounted yet, there's no
  // shortcut to show, as on the server.
  const drawer = drawerCtx ?? trigger?.drawer();
  if (!drawer) {
    return null;
  }
  const shortcut = () => ({ shortcut: props.shortcut ?? trigger?.shortcut() });
  const children = childOf(props);
  const rest = {
    ...omit(props, "shortcut"),
    get children() {
      return children ?? ((state: DialogShortcutState) => state.text);
    },
  };
  return usePart(drawer, "shortcut", shortcut, rest, "span");
}

/**
 * An element that follows the drawer, like the page behind it: it plays its
 * `keyframes` as the drawer expands and gets the `--drawer-*` variables.
 * Outside the drawer, pass the drawer's `controller`.
 * @stable
 */
function DrawerOutlet(props: OutletPartProps) {
  const drawer = useDrawerOrRemote(() => props.controller);
  // Made once: a new id each render would make a new outlet part each render
  // (core keys parts by id), resubscribing forever.
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextDrawerId += 1)}`, {
    snapshot: false,
  });
  const outlet = () => ({ id: idBox(), keyframes: props.keyframes });
  const rest = omit(props, "keyframes", "controller");
  const current = drawer();
  return !current
    ? renderStatic("div", () => ({ attrs: {}, state: { open: false } }), rest)
    : usePart(current, "outlet", outlet, rest, "div");
}

export { createDrawerController, sheetPhysics } from "@ui-sdk/core/drawer";
export type {
  DrawerApi,
  DrawerBackdropState,
  DrawerContentProps,
  DrawerContentState,
  DrawerController,
  DrawerDismissAttemptDetails,
  DrawerDismissReason,
  DrawerDriver,
  DrawerHandleState,
  DrawerKeyframes,
  DrawerOpenChangeReason,
  DrawerOptions,
  DrawerOutletProps,
  DrawerOutletState,
  DrawerPayloadChangeReason,
  DrawerPrimitive,
  DrawerSide,
  DrawerSnapPointChangeReason,
  DrawerTriggerProps,
  SheetPhysics,
  SnapPoint,
} from "@ui-sdk/core/drawer";

export {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerOutlet,
  type DrawerProps,
  DrawerShortcut,
  DrawerTitle,
  DrawerTrigger,
};
