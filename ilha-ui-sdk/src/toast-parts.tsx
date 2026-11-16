// Toast region and toasts (port of `@ui-sdk/solid`'s `toast-parts`).
//
// The region renders inline, in place: Ilha has no portal, so a second
// island (and its broken context/atoms) is out. The `container` option is
// accepted and ignored for the same reason.
import {
  toastRegion as toastRegionPrimitive,
  type Toast as CoreToast,
  type ToastActionProps,
  type ToastButtonState,
  type ToastCloseProps,
  type ToastItem,
  type ToastRegionOptions,
  type ToastRegionState,
  type ToastState,
} from "@ui-sdk/core/toast";
import { context, createContext, untrack } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import {
  childOf,
  omit,
  renderAs,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

type ToastRegionProps = Omit<PartProps<"section", ToastRegionState>, "children"> &
  ToastRegionOptions & {
    /**
     * Renders each toast, usually with `Toast` and its parts. Without it,
     * each toast renders its title, description, action and cancel button.
     */
    children?: (toast: unknown, item: ToastItem) => JSX.Element;
    /** Where the region renders. Accepted and ignored: regions render in place (no portal). */
    container?: unknown;
  };

// The region and the toast a part renders, both live: reading a key in JSX
// follows the toast's updates.
const ToastContext = createContext<{
  region: PrimitiveHandle<typeof toastRegionPrimitive>;
  toast: unknown;
} | null>(null);

function useToast(part: string) {
  const current = context(ToastContext)();
  if (!current) {
    throw new Error(`${part} must be used inside <Toast>, in a <ToastRegion>.`);
  }
  return current;
}

/**
 * The stack of toasts, with one live region for all of them. Put it where
 * the toasts show, or let the overlay host render one.
 * @stable
 */
function ToastRegion(props: ToastRegionProps) {
  return <Region {...props} placed />;
}

/**
 * A toast region that renders in place. `placed` says whether the app placed
 * it: the overlay host skips its own region while one is placed.
 * @stable
 */
function Region(props: ToastRegionProps & { placed?: boolean }) {
  const region = usePrimitive(toastRegionPrimitive, () => ({
    toaster: props.toaster,
    side: props.side,
    align: props.align,
    maxVisible: props.maxVisible,
    expanded: props.expanded,
    shortcut: props.shortcut,
    pendingAnnouncement: props.pendingAnnouncement,
    placed: props.placed,
    // Solid lets `false` remove an attribute, which is no name.
    label: (props as Record<string, any>)["aria-label"] || undefined,
  }));
  const rest = omit(
    props,
    "toaster",
    "side",
    "align",
    "maxVisible",
    "expanded",
    "shortcut",
    "pendingAnnouncement",
    "placed",
    "container",
    "children",
    "aria-label",
  );
  const list = region.slot("list");
  const children = childOf(props);
  const user = {
    ...rest,
    get children() {
      return (state: ToastRegionState) => (
        <ol {...list}>
          {state.toasts.map((item) => (
            <ToastContext.Provider
              key={item.toast.id}
              value={{ region, toast: item.toast }}
            >
              {typeof children === "function"
                ? (children as (toast: unknown, item: ToastItem) => JSX.Element)(
                  item.toast,
                  item,
                )
                : (<DataToast toast={item.toast} />)}
            </ToastContext.Provider>
          ))}
        </ol>
      );
    },
  };
  return usePart(region, "region", undefined, user, "section");
}

function DataToast(props: { toast: CoreToast }) {
  const toast = props.toast;
  return (
    <Toast>
      <div>
        {toast.title != null ? <ToastTitle /> : null}
        {toast.description != null ? <ToastDescription /> : null}
      </div>
      {toast.action ? <ToastAction /> : null}
      {toast.cancel ? (
        <ToastClose action={toast.cancel?.onCancel}>
          {toast.cancel?.label as JSX.Element}
        </ToastClose>
      ) : null}
    </Toast>
  );
}

/**
 * One toast. Sits in the region's list; render it from the region's
 * children, which get each live toast.
 * @stable
 */
function Toast(props: PartProps<"li", ToastState>) {
  const { region, toast } = useToast("Toast");
  const id = untrack(() => (toast as { id: string }).id);
  return usePart(region, "root", () => ({ id }), props, "li");
}

/**
 * What the toast is about. Without children it shows the toast's title.
 * @stable
 */
function ToastTitle(props: PartProps<"div">) {
  const { region, toast } = useToast("ToastTitle");
  const current = toast as { id: string; title?: unknown };
  const id = untrack(() => current.id);
  const children = childOf(props);
  const rest = {
    ...omit(props, "children"),
    get children() {
      return (children ?? current.title) as JSX.Element;
    },
  };
  return "children" in props || current.title != null
    ? usePart(region, "title", () => ({ id }), rest, "div")
    : null;
}

/**
 * More about the toast. Without children it shows the toast's description.
 * @stable
 */
function ToastDescription(props: PartProps<"div">) {
  const { region, toast } = useToast("ToastDescription");
  const current = toast as { id: string; description?: unknown };
  const id = untrack(() => current.id);
  const children = childOf(props);
  const rest = {
    ...omit(props, "children"),
    get children() {
      return (children ?? current.description) as JSX.Element;
    },
  };
  return "children" in props || current.description != null
    ? usePart(region, "description", () => ({ id }), rest, "div")
    : null;
}

/**
 * Runs the toast's action. A link when the action has an `href`, else a
 * button. Without children it shows the action's label.
 * @stable
 */
function ToastAction(
  props: Omit<PartProps<"button", ToastButtonState>, "onAction"> &
    ToastActionProps,
) {
  const { region, toast } = useToast("ToastAction");
  const current = toast as { id: string; action?: { href?: string; label?: unknown } };
  const id = untrack(() => `ilha-ui-sdk-${(nextToastButtonId += 1)}`);
  const toastId = untrack(() => current.id);
  const part = () => ({
    id,
    toast: toastId,
    onAction: props.onAction,
    dismiss: props.dismiss,
  });
  const rest = omit(props, "onAction", "dismiss", "children");
  const children = childOf(props);
  const href = () => current.action?.href;
  const element = {
    render: renderAs(() => (href() ? "a" : "button")),
    get href() {
      return href();
    },
    get type() {
      return href() ? undefined : "button";
    },
  };
  return current.action || props.onAction
    ? usePart(
      region,
      "action",
      part,
      {
        ...element,
        ...rest,
        get children() {
          return (children ?? current.action?.label) as JSX.Element;
        },
      },
      "button",
    )
    : null;
}

/**
 * Dismisses the toast. Without children it shows a cross.
 * @stable
 */
function ToastClose(
  props: Omit<PartProps<"button", ToastButtonState>, "action"> &
    ToastCloseProps,
) {
  const { region, toast } = useToast("ToastClose");
  const id = untrack(() => `ilha-ui-sdk-${(nextToastButtonId += 1)}`);
  const toastId = untrack(() => (toast as { id: string }).id);
  const part = () => ({ id, toast: toastId, action: props.action });
  const rest = omit(props, "action");
  return usePart(region, "close", part, { type: "button", ...rest }, "button");
}

let nextToastButtonId = 0;

export { createToaster, toast } from "@ui-sdk/core/toast";
export type {
  Toast as ToastData,
  ToastAction as ToastActionData,
  ToastActionDetails,
  ToastActionProps,
  ToastButtonState,
  ToastCancel,
  ToastCloseProps,
  ToastDismissDetails,
  ToastDismissReason,
  ToastItem,
  ToastOptions,
  ToastPauseReason,
  ToastRegionOptions,
  ToastRegionPrimitive,
  ToastRegionState,
  ToastState,
  Toaster,
  ToastType,
} from "@ui-sdk/core/toast";

export {
  Region,
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastRegion,
  type ToastRegionProps,
  ToastTitle,
};
