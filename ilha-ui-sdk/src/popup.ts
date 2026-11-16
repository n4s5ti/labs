// Popup helpers (port of `@ui-sdk/solid`'s `popup`).
//
// Ilha has no portal, so popups render inline, in place, while their slot is
// present: a second island (and its broken context/atoms) is out. Ancestor
// overflow or stacking contexts clip them; that is the documented tradeoff.
// The `container` option is accepted and ignored everywhere for the same
// reason, and the sheet-positioning viewport wrapper is skipped: the content
// positions itself.
import type { Primitive, PropsOf, SlotName } from "@ui-sdk/core";
import type { JSX } from "ilha/jsx-runtime";
import { usePart, type PrimitiveHandle } from "./primitive.ts";

// Where a popup renders: an element or fragment, or nothing to render in place.
type PopupContainer = Element | DocumentFragment | null | undefined;

// The popup's container: with no portals every popup renders in place, so
// this is only the caller's own, for API parity with the Solid adapter.
function usePopupContainer(own: () => PopupContainer) {
  return own;
}

// Renders a popup in place, ignoring its container (no portal).
function renderPopup(
  element: () => JSX.Element,
  _container: () => PopupContainer,
) {
  return element();
}

/**
 * A popup's part, like its content or backdrop, rendered in place while its
 * slot is present. Presence is checked before the popup renders, so a closed
 * popup mounts nothing. The sheet `viewport` wrapper is skipped (see the
 * module header).
 */
function popupPart<P extends Primitive, S extends SlotName<P>>(
  popup: PrimitiveHandle<P>,
  slot: S,
  part: () => PropsOf<P, S>,
  props: Record<string, any>,
  _container?: () => PopupContainer,
  _viewport?: (popup: PrimitiveHandle<P>, element: () => JSX.Element) => JSX.Element,
) {
  const open = popup.present(slot, part);
  const element = usePart(popup, slot, part, props, "div");
  return open ? element : null;
}

/**
 * Wraps a popup's content in the full-screen viewport a sheet sits in. With
 * no portals the content positions itself, so this is the element unchanged.
 */
function sheetViewport<P extends Primitive>(
  _popup: PrimitiveHandle<P>,
  element: () => JSX.Element,
) {
  return element();
}

export { useControllerEntry, useControllerTarget } from "./controller-target.ts";

export {
  type PopupContainer,
  popupPart,
  renderPopup,
  sheetViewport,
  usePopupContainer,
};
