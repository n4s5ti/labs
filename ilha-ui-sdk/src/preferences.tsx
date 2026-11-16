// Preferences (port of `@ui-sdk/solid`'s `preferences`).
//
// Shows preferences on `data-*` attributes, so CSS styles by them from the
// first paint: global ones on `<html>`, the rest on its own element, which
// has `display: contents`. On the server it renders one inline script as its
// first child, which puts every saved value on its attribute as the page
// loads, before hydration. Content that reads a preference, through
// `usePreference`, catches up after hydration.
//
// The script renders through `unsafe` (core built it, so it is trusted): the
// painter sets no `innerHTML` prop, and a script inserted on the client never
// runs anyway — a client-only render drops it right away.
//
// Unlike the Solid adapter, whose effect writes the element's attributes, the
// values render declaratively: Ilha's morph removes attributes the vnode does
// not declare, so an imperative write would not survive the next render. A
// version atom re-renders the element when any preference changes.
import { preferencesScript, type PreferenceLike } from "@ui-sdk/core";
import { atom, unsafe, watch } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { childOf, omit } from "./primitive.ts";

/**
 * Props of `Preferences`.
 * @experimental
 */
type PreferencesProps = Omit<JSX.IntrinsicElements["div"], "children"> & {
  /** The preferences to show, from `createPreference` or `createColorScheme`. */
  preferences: readonly PreferenceLike[];
  /** The nonce your Content Security Policy gives inline scripts. */
  nonce?: string;
  children?: JSX.Element;
};

/**
 * Shows preferences on `data-*` attributes, so CSS styles by them from the
 * first paint: global ones on `<html>`, the rest on its own element, which
 * has `display: contents`. On the server it renders one inline script as its
 * first child, which puts every saved value on its attribute as the page
 * loads, before hydration. Content that reads a preference, through
 * `usePreference`, catches up after hydration.
 * @experimental
 */
function Preferences(props: PreferencesProps) {
  const rest = omit(props, "preferences", "nonce", "children");
  // The script is in the server's HTML until mounted. A client-only render
  // drops it right away, and the browser never runs a script inserted after load.
  const mounted = atom(false, { snapshot: false });
  // Bumped when any preference changes, so the element's attributes below
  // render again. `get()` itself is not reactive.
  const version = atom(0, { snapshot: false });
  // The server renders the defaults. In the browser the saved values render
  // below from the first paint (the script already put them on the page
  // before hydration), and the subscription keeps globals and re-renders.
  const server =
    typeof document === "undefined"
      ? (() => {
        const shown: Record<string, string> = {};
        for (const preference of props.preferences) {
          if (!preference.global) {
            shown[preference.attribute] = preference.initialState.value;
          }
        }
        return shown;
      })()
      : {};
  watch.once(() => {
    const writeGlobals = () => {
      for (const preference of props.preferences) {
        if (preference.global) {
          document.documentElement.setAttribute(
            preference.attribute,
            preference.get().value,
          );
        }
      }
    };
    // Subscribing first reads back what was saved.
    const stops = props.preferences.map((preference) =>
      preference.subscribe(() => {
        writeGlobals();
        version.set(version() + 1);
      })
    );
    writeGlobals();
    mounted.set(true);
    return () => stops.forEach((stop) => stop());
  });
  version();
  const live: Record<string, string> = {};
  if (typeof document !== "undefined") {
    for (const preference of props.preferences) {
      if (!preference.global) {
        live[preference.attribute] = preference.get().value;
      }
    }
  }
  const children = childOf(props);
  return (
    <div
      {...rest}
      {...server}
      {...live}
      data-slot="preferences"
      style={{ display: "contents" }}
    >
      {mounted() ? null : (
        // `nonce` is a global attribute the JSX types don't name.
        <script {...{ nonce: props.nonce } as unknown as JSX.IntrinsicElements["script"]}>
          {unsafe(preferencesScript(props.preferences))}
        </script>
      )}
      {children as JSX.Element}
    </div>
  );
}

/**
 * A preference's state, like `{ value: "dark" }`, or a color scheme's, as an
 * accessor. It's the server's until mounted, so the page hydrates without a
 * mismatch, and the saved value right after.
 * @experimental
 */
function usePreference<State extends object>(preference: {
  get: () => State;
  initialState: State;
  subscribe: (listener: () => void) => () => void;
}) {
  // A state is an object, never a function, which a signal would take for a way to compute it.
  const state = atom(preference.initialState as Exclude<State, Function>, {
    snapshot: false,
  });
  watch.once(() => {
    // Subscribing first reads back what was saved.
    const stop = preference.subscribe(() =>
      state.set(preference.get() as Exclude<State, Function>)
    );
    state.set(preference.get() as Exclude<State, Function>);
    return stop;
  });
  return state;
}

export { Preferences, type PreferencesProps, usePreference };
