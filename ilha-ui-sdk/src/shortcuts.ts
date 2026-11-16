// Keyboard shortcuts (port of `@ui-sdk/solid`'s `shortcuts`).
//
// `useShortcut` registers keys while mounted; `useShortcutHint` reads the
// platform's names for them, following an Apple platform change.
import { initialApple, isApple } from "@ui-sdk/core/renderer";
import {
  ariaKeyshortcuts,
  formatShortcut,
  registerShortcut,
  shortcuts,
  type ShortcutHandler,
  type ShortcutOptions,
} from "@ui-sdk/core/shortcuts";
import { atom, watch } from "ilha";

type MaybeAccessor<T> = T | (() => T);

type UseShortcutOptions = ShortcutOptions;

function read<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

/**
 * Runs `handler` while `keys` are pressed, until it unmounts. `keys` and
 * `options` may be getters, re-registered when they change.
 * @stable
 */
function useShortcut(
  keys: MaybeAccessor<string | null | undefined>,
  handler: ShortcutHandler,
  options: MaybeAccessor<UseShortcutOptions> = {},
) {
  // The last registration, re-registered after render when the keys or
  // options change (Ilha has no Solid-style effect with dependencies, so a
  // microtask applies it, like the combobox's content flag).
  const box = atom.lazy(() => ({
    keys: undefined as string | null | undefined,
    options: undefined as UseShortcutOptions | undefined,
    release: undefined as (() => void) | undefined,
  }), { snapshot: false });
  const state = box();
  const nextKeys = read(keys);
  const nextOptions = read(options);
  if (state.keys !== nextKeys || state.options !== nextOptions) {
    state.keys = nextKeys;
    state.options = nextOptions;
    queueMicrotask(() => {
      state.release?.();
      state.release = state.keys
        ? shortcuts.register(state.keys, handler, state.options)
        : undefined;
    });
  }
  watch.once(() => () => {
    state.release?.();
    state.release = undefined;
  });
}

/**
 * The shortcut's text and `aria-keyshortcuts`, in the platform's names.
 * @stable
 */
function useShortcutHint(keys: MaybeAccessor<string>) {
  const apple = atom(initialApple(), { snapshot: false });
  watch.once(() => {
    apple.set(isApple());
  });
  return {
    text: () => formatShortcut(read(keys), apple()),
    ariaKeyshortcuts: () => ariaKeyshortcuts(read(keys), apple()),
  };
}

export {
  ariaKeyshortcuts,
  formatShortcut,
  registerShortcut,
  shortcuts,
  useShortcut,
  useShortcutHint,
  type MaybeAccessor,
  type ShortcutHandler,
  type ShortcutOptions,
  type UseShortcutOptions,
};
export type {
  ShortcutInfo,
  ShortcutKeys,
  Shortcuts,
} from "@ui-sdk/core/shortcuts";
