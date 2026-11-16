// Dialog (port of `@ui-sdk/solid`'s `dialog`: the shared parts factory over
// the dialog primitive).
//
// The `AlertDialog`-prefixed types already reach the barrel through
// `alert-dialog`, so this module re-exports only its `Dialog`-prefixed types.
import {
  dialog as dialogPrimitive,
  type DialogContentProps,
  type DialogContentState,
  type DialogOptions,
  type DialogShortcutProps,
  type DialogShortcutState,
  type DialogTriggerProps,
} from "@ui-sdk/core/dialog";
import type { JSX } from "ilha/jsx-runtime";
import { createDialogParts, type TriggerPartProps } from "./dialog-parts.tsx";
import type { PartProps } from "./primitive.ts";

const dialogParts = createDialogParts(dialogPrimitive, "Dialog");

/**
 * The props of `Dialog`.
 * @stable
 */
type DialogProps = DialogOptions & { children?: JSX.Element };

/**
 * A window over the page that asks for the user's attention. Put its trigger, backdrop and content inside.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function Dialog(props: DialogProps) {
  return <dialogParts.Root {...props} />;
}

/**
 * The button that opens the dialog. A trigger outside the dialog, like one per table row, connects through
 * `controller`.
 * @stable
 */
function DialogTrigger(
  props: TriggerPartProps & Pick<DialogTriggerProps, "controller">,
) {
  return <dialogParts.Trigger {...props} />;
}

/**
 * A dim behind the dialog. It's optional: without it, style the content's `::backdrop`.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
const DialogBackdrop = dialogParts.Backdrop;

/**
 * The dialog itself, named by its title and described by its description.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function DialogContent(
  props: PartProps<"div", DialogContentState> & DialogContentProps,
) {
  return dialogParts.Content(props);
}

/**
 * The dialog's title, which names it. A level 2 heading by default.
 * @stable
 */
const DialogTitle = dialogParts.Title;

/**
 * Describes the dialog while it's rendered. A paragraph by default.
 * @stable
 */
const DialogDescription = dialogParts.Description;

/**
 * A button that closes the dialog. An `action` runs first, and a Promise it returns keeps the dialog open
 * until it settles.
 * @stable
 */
const DialogClose = dialogParts.Close;

/**
 * Shows a trigger's shortcut, like `⌘K`, inside the trigger. Hidden from screen readers, which hear `aria-keyshortcuts`.
 * @stable
 */
function DialogShortcut(
  props: PartProps<"span", DialogShortcutState> & DialogShortcutProps,
) {
  return dialogParts.Shortcut(props);
}

export { createDialogController } from "@ui-sdk/core/dialog";
export type {
  DialogApi,
  DialogBackdropState,
  DialogCloseActionDetails,
  DialogCloseProps,
  DialogCloseState,
  DialogContentProps,
  DialogContentState,
  DialogController,
  DialogDismissAttemptDetails,
  DialogDismissReason,
  DialogFinalFocus,
  DialogInitialFocus,
  DialogOpenChangeDetails,
  DialogOpenChangeReason,
  DialogOptions,
  DialogPayloadChangeReason,
  DialogPrimitive,
  DialogSharedOptions,
  DialogShortcutProps,
  DialogShortcutState,
  DialogTriggerProps,
  DialogTriggerState,
} from "@ui-sdk/core/dialog";

export {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  type DialogProps,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
};
