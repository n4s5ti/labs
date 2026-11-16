// Alert dialog (port of `@ui-sdk/solid`'s `alert-dialog`).
//
// Dialog parts render inline, in place, while their slot is present: Ilha
// has no portal, so a second island (and its broken context/atoms) is out.
// The backdrop dims in place, the content carries `role="alertdialog"`, and
// core's dialog behavior (Escape, outside-press refusal, initial and final
// focus, modal scroll lock) stays identical since the same core primitive
// drives it. Ancestor overflow or stacking contexts clip it; that is the
// documented tradeoff.
import {
  alertDialog as alertDialogPrimitive,
  dialog as dialogPrimitive,
  type AlertDialogBackdropState,
  type AlertDialogCloseActionDetails,
  type AlertDialogCloseProps,
  type AlertDialogCloseState,
  type AlertDialogContentProps,
  type AlertDialogContentState,
  type AlertDialogController,
  type AlertDialogOptions,
  type AlertDialogShortcutProps,
  type AlertDialogShortcutState,
  type AlertDialogTriggerProps,
  type AlertDialogTriggerState,
  type DialogTriggerProps,
} from "@ui-sdk/core/dialog";
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

// The alert dialog's slots and state are the dialog's. Only its options are narrower.
const dialogCasts = alertDialogPrimitive as unknown as typeof dialogPrimitive;

const parts = createParts(dialogCasts, {
  close: "button",
  description: "p",
  title: "h2",
});

// The alert dialog, for the parts that may find it through a controller.
const AlertDialogContext = createContext<PrimitiveHandle<
  typeof dialogPrimitive
> | null>(null);

// The trigger a Shortcut part sits in: its shortcut, and the dialog it opens.
const TriggerContext = createContext<{
  shortcut: () => string | undefined;
  dialog: () => PrimitiveHandle<typeof dialogPrimitive> | undefined;
} | null>(null);

type TriggerPartProps = Omit<
  PartProps<"button", AlertDialogTriggerState>,
  "value" | "onChange"
> &
  Omit<DialogTriggerProps, "controller">;

function useAlertDialog() {
  const dialog = context(AlertDialogContext)();
  if (!dialog) {
    throw new Error("AlertDialog parts must be used inside <AlertDialog>.");
  }
  return dialog;
}

let nextAlertDialogId = 0;

/**
 * The props of `AlertDialog`.
 * @stable
 */
type AlertDialogProps = AlertDialogOptions & { children?: JSX.Element };

/**
 * A modal dialog that interrupts the user with something important and waits for an answer, like "Delete this
 * file?".
 * @stable
 */
function AlertDialog(props: AlertDialogProps) {
  const options = omit(props, "children", "container");
  const dialog = usePrimitive(dialogCasts, () => ({ ...options }));
  useControllerEntry(() => props.controller, dialog);
  return providePrimitive(dialog, () => (
    <AlertDialogContext.Provider value={dialog}>
      {props.children as JSX.Element}
    </AlertDialogContext.Provider>
  ));
}

/**
 * The button that opens the alert dialog. A trigger outside the alert dialog connects through `controller`.
 * @stable
 */
function AlertDialogTrigger(
  props: TriggerPartProps & Pick<AlertDialogTriggerProps, "controller">,
) {
  const dialog = useControllerTarget(
    () => (props as { controller?: AlertDialogController<any, any> }).controller,
    context(AlertDialogContext)(),
  );
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
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextAlertDialogId += 1)}`, {
    snapshot: false,
  });
  const shortcut = () => props.shortcut;
  const current = dialog();
  return (
    <TriggerContext.Provider
      value={{ dialog, shortcut }}
    >
      {!current
        // Until the dialog it names mounts, a trigger outside the dialog is a plain button.
        ? renderStatic(
          "button",
          () => ({
            attrs: {},
            state: { disabled: !!props.disabled, open: false },
          }),
          {
            ...rest,
            "aria-disabled": (props.disabled && props.focusableWhenDisabled) ||
              undefined,
            disabled: props.disabled && !props.focusableWhenDisabled,
            type: "button",
          },
        )
        : (() => {
          const id = idBox();
          const trigger = () => ({
            disabled: props.disabled,
            focusableWhenDisabled: props.focusableWhenDisabled,
            id,
            payload: props.payload,
            shortcut: props.shortcut,
          });
          return usePart(current, "trigger", trigger, rest, "button");
        })()}
    </TriggerContext.Provider>
  );
}

/**
 * A dim behind the alert dialog. Pressing it does nothing.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function AlertDialogBackdrop(props: PartProps<"div", AlertDialogBackdropState>) {
  const dialog = useAlertDialog();
  const part = () => ({});
  const open = dialog.present("backdrop", part);
  const element = usePart(dialog, "backdrop", part, props, "div");
  return open ? element : null;
}

/**
 * The alert dialog itself, with the `alertdialog` role, named by its title. Put the title, the description
 * and the buttons that answer it inside.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function AlertDialogContent(
  props: PartProps<"div", AlertDialogContentState> & AlertDialogContentProps,
) {
  const dialog = useAlertDialog();
  const content = () => ({
    finalFocus: props.finalFocus,
    initialFocus: props.initialFocus,
    keepMounted: props.keepMounted,
  });
  const rest = omit(props, "initialFocus", "finalFocus", "keepMounted", "container");
  const open = dialog.present("content", content);
  const element = usePart(dialog, "content", content, rest, "div");
  return open ? element : null;
}

/**
 * The alert dialog's title, which names it. A level 2 heading by default.
 * @stable
 */
const AlertDialogTitle = parts.Title;

/**
 * Describes the alert dialog while it's rendered. A paragraph by default.
 * @stable
 */
const AlertDialogDescription = parts.Description;

/**
 * A button that closes the alert dialog, like Cancel or Delete. An `action` runs first, and a Promise it
 * returns keeps the alert dialog open until it settles.
 * @stable
 */
const AlertDialogClose = parts.Close as (
  props: Omit<PartProps<"button", AlertDialogCloseState>, "value" | "onChange"> &
    AlertDialogCloseProps & {
      action?: (
        event: Event,
        details: AlertDialogCloseActionDetails,
      ) => unknown;
    },
) => JSX.Element;

/**
 * Shows a trigger's shortcut inside the trigger.
 * @stable
 */
function AlertDialogShortcut(props: PartProps<"span", AlertDialogShortcutState> & AlertDialogShortcutProps) {
  const trigger = context(TriggerContext)();
  const dialogCtx = context(AlertDialogContext)();
  if (!dialogCtx && !trigger) {
    throw new Error(
      "AlertDialogShortcut must be used inside <AlertDialog>.",
    );
  }
  // A trigger outside the dialog finds it through its controller only once
  // mounted, so inside one whose dialog hasn't mounted yet, there's no
  // shortcut to show, as on the server.
  const dialog = dialogCtx ?? trigger?.dialog();
  if (!dialog) {
    return null;
  }
  const shortcut = () => ({ shortcut: props.shortcut ?? trigger?.shortcut() });
  const children = childOf(props);
  const rest = {
    ...omit(props, "shortcut"),
    get children() {
      return children ?? ((state: AlertDialogShortcutState) => state.text);
    },
  };
  return usePart(dialog, "shortcut", shortcut, rest, "span");
}

export {
  confirm,
  createAlertDialogController,
  createConfirm,
} from "@ui-sdk/core/alert-dialog";
export type {
  AlertDialogBackdropState,
  AlertDialogCloseActionDetails,
  AlertDialogCloseProps,
  AlertDialogCloseState,
  AlertDialogContentProps,
  AlertDialogContentState,
  AlertDialogController,
  AlertDialogOpenChangeReason,
  AlertDialogOptions,
  AlertDialogPayloadChangeReason,
  AlertDialogPrimitive,
  AlertDialogShortcutProps,
  AlertDialogShortcutState,
  AlertDialogTriggerProps,
  AlertDialogTriggerState,
  ConfirmEntry,
  ConfirmOptions,
} from "@ui-sdk/core/alert-dialog";

export {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  type AlertDialogProps,
  AlertDialogShortcut,
  AlertDialogTitle,
  AlertDialogTrigger,
};
