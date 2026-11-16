// Async options (port of `@ui-sdk/solid`'s `async-options`).
//
// Options loaded for what the user types, latest first. Pass `items`,
// `status` and `setQuery` (as `onQueryChange`) to a combobox with
// `filter={false}`.
import {
  createAsyncOptions,
  type AsyncOptionsContext,
  type AsyncOptionsOptions,
  type AsyncOptionsState,
} from "@ui-sdk/core/async-options";
import { atom, untrack, watch } from "ilha";
import { getFiber } from "ilha/renderer";
import type { FiberLocal } from "ilha/renderer";

/**
 * Options loaded for what the user types, latest first. Pass `items`, `status`
 * and `setQuery` (as `onQueryChange`) to a combobox with `filter={false}`.
 * The state is reactive: the component's tick re-renders when a load lands.
 * @stable
 */
function useAsyncOptions<Item>(
  load: (
    query: string,
    context: AsyncOptionsContext,
  ) => Promise<Item[] | { items: Item[]; hasMore?: boolean }>,
  options?: AsyncOptionsOptions,
) {
  // One tick per hook instance: helper listeners bump it on a microtask, so
  // the component body re-runs (the documented Ilha equivalent of a signal).
  const tick = atom(0, { snapshot: false });
  tick();
  const fiber: FiberLocal = getFiber();
  // Made once: recreating the helper per render would resubscribe and reload.
  const box = atom.lazy(
    () => {
      // An `immediate` load starts at once in the browser. Ilha has no
      // hydration-settled hook, so it starts whenever the component renders
      // on the client; on the server it never starts.
      const immediate =
        !!options?.immediate && typeof document !== "undefined";
      const helper = createAsyncOptions<Item>(load, {
        ...options,
        immediate,
      });
      return { helper, initial: helper.getState() };
    },
    { snapshot: false },
  );
  const entry = box();
  watch.once(() => {
    const unsub = entry.helper.subscribe(() => {
      queueMicrotask(() => {
        if (!fiber.closed) {
          untrack(() => {
            tick.set(tick() + 1);
          });
        }
      });
    });
    // Cancels on unmount, so a load that lands later changes nothing.
    return () => {
      unsub();
      entry.helper.cancel();
    };
  });
  const state: AsyncOptionsState<Item> = entry.helper.getState();
  return {
    /** Whether a load is running, failed, or neither. */
    get error() {
      return state.error;
    },
    /** Whether `loadMore()` has another page to load. */
    get hasMore() {
      return state.hasMore;
    },
    /** The items loaded for the text. */
    get items() {
      return state.items;
    },
    loadMore: entry.helper.loadMore,
    /** The text the items were loaded for. */
    get query() {
      return state.query;
    },
    reload: entry.helper.reload,
    setQuery: entry.helper.setQuery,
    /** Whether a load is running, failed, or neither. */
    get status() {
      return state.status;
    },
  };
}

export { createAsyncOptions } from "@ui-sdk/core/async-options";
export type {
  AsyncOptions,
  AsyncOptionsContext,
  AsyncOptionsOptions,
  AsyncOptionsState,
  AsyncOptionsStatus,
} from "@ui-sdk/core/async-options";

export { useAsyncOptions };
