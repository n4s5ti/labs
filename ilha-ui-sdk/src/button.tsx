// Button (port of `@ui-sdk/solid`'s `button`).
import {
  button as buttonPrimitive,
  type ButtonActionDetails,
  type ButtonOptions,
  type ButtonState,
} from "@ui-sdk/core/button";
import type { JSX } from "ilha/jsx-runtime";
import {
  callHandler,
  omit,
  usePart,
  usePrimitive,
  type PartProps,
} from "./primitive.ts";

// The click event, as Ilha types it for a handler on the element `render` renders.
type ButtonClickEvent = Parameters<
  NonNullable<JSX.IntrinsicElements["button"]["onclick"]>
>[0];

// Declared as methods, whose parameters TypeScript checks both ways, so a
// handler typed for a <button>'s narrower event fits, as it does on a <button>.
type ButtonClickHandlers = {
  handler(event: ButtonClickEvent, details: ButtonActionDetails): unknown;
  // Its data is `any`, so a handler for any data fits.
  bound(data: any, event: ButtonClickEvent, details: ButtonActionDetails): unknown;
};

type ButtonProps = Omit<PartProps<"button", ButtonState>, "type" | "onClick"> &
  ButtonOptions & {
    /**
     * Runs when the button is pressed. Return a Promise to make the button
     * pending until it settles: it gets `aria-busy`, `aria-disabled` and
     * `data-pending`, keeps focus, ignores presses meanwhile, so a form can't
     * submit twice, and says `pendingAnnouncement` after a second.
     * The event's element is whatever `render` renders, like a link.
     * `details.source` says how it was pressed, for changes made after an `await`.
     * The bound form, `[handler, data]`, calls `handler(data, event, details)`.
     */
    onClick?:
      | ButtonClickHandlers["handler"]
      | { 0: ButtonClickHandlers["bound"]; 1: any };
  };

/**
 * A button, or a link or any element that acts as one through `render`.
 * @stable
 */
function Button(props: ButtonProps) {
  const button = usePrimitive(buttonPrimitive, () => ({
    action: (event, details) => callHandler(props.onClick, event as MouseEvent, details),
    debug: props.debug,
    disabled: props.disabled,
    focusableWhenDisabled: props.focusableWhenDisabled,
    pendingAnnouncement: props.pendingAnnouncement,
    type: props.type,
  }));
  const rest = omit(
    props,
    "disabled",
    "focusableWhenDisabled",
    "type",
    "pendingAnnouncement",
    "debug",
    "onClick",
  );
  return usePart(button, "root", undefined, rest, "button");
}

export { Button };
export type {
  ButtonActionDetails,
  ButtonApi,
  ButtonOptions,
  ButtonPrimitive,
  ButtonState,
} from "@ui-sdk/core/button";
