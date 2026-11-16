// Sheet header helpers (port of `@ui-sdk/solid`'s `sheet-header`).
//
// A sheet positions its content against a header element the app places: the
// header renders inline, in place, while its slot is present, and
// `inSheetHeader` puts an element in it. Ilha has no portal, so the placed
// element renders where it sits instead of moving under the header's mount.
import type { Primitive } from "@ui-sdk/core";
import type { JSX } from "ilha/jsx-runtime";
import { createContext, watch } from "ilha";
import type { PrimitiveHandle } from "./primitive.ts";

const SheetHeaderContext = createContext<
  [() => Element | null, (element: Element | null) => void]
>([() => null, () => {}]);

// The header a sheet positions against, rendered inline while present. The
// ref reports its element, cleared when it unmounts.
function sheetHeader(
  popup: PrimitiveHandle<Primitive>,
  setHeader: (element: Element | null) => void,
) {
  const header = popup.slot("header", undefined, { ref: setHeader });
  watch.once(() => () => setHeader(null));
  const element = <div {...header} />;
  return popup.present("header") ? element : null;
}

// An element that belongs in the sheet header: with no portal it renders
// where it sits.
function inSheetHeader(
  element: () => JSX.Element,
  _header: () => Element | null,
) {
  return element();
}

export { inSheetHeader, sheetHeader, SheetHeaderContext };
