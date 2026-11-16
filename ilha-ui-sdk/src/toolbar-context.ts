// Toolbar scope for toggles (port of `@ui-sdk/solid`'s `toolbar-context`).
import type { toolbar } from "@ui-sdk/core/toolbar";
import { atom, createContext, context } from "ilha";
import type { PrimitiveHandle } from "./primitive.ts";

// The toolbar's context, apart from the toolbar, so a toggle or a toggle group
// can join one without bundling it.
const ToolbarContext = createContext<PrimitiveHandle<typeof toolbar> | null>(null);

// Whether the toolbar group an item, toggle or toggle group sits in is disabled.
const ToolbarGroupContext = createContext<() => boolean>(() => false);

// The arrow keys and tab stop of the toolbar a toggle or a toggle group sits
// in, if any. A getter of a getter of the scope: it's a new function when
// the group around it is disabled or enabled, so options that read it change
// and the toggle syncs. The inner function is stable while `disabled` is,
// so the options sync in `usePrimitive` sees equal values across renders.
function useToolbarScope() {
  const toolbar = context(ToolbarContext)();
  // Reading a function-valued context calls it (Ilha invokes the value on
  // read), so this is already the group's `disabled`, not the getter.
  const groupDisabled = context(ToolbarGroupContext)() as
    | boolean
    | (() => boolean);
  // Plain mutable holder (ilha-fate shape): identity work without atom writes.
  const box = atom.lazy<{ current: { disabled: boolean; scope: () => unknown } | null }>(
    () => ({ current: null }),
    { snapshot: false },
  );
  if (!toolbar) {
    return undefined;
  }
  const disabled =
    typeof groupDisabled === "function" ? groupDisabled() : !!groupDisabled;
  const previous = box().current;
  if (previous !== null && previous.disabled === disabled) {
    return () => previous.scope as never;
  }
  const scope = () => toolbar.api.internal.scopeIn(disabled);
  box().current = { disabled, scope };
  return () => scope as never;
}

export { ToolbarContext, ToolbarGroupContext, useToolbarScope };
