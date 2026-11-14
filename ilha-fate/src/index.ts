// ilha-fate: ilha bindings for Fate data views.
//
// The request/view half of vue-fate's composables, rebuilt on ilha
// atoms + suspense over the framework-free `@nkzw/fate` core: declare
// data needs with Fate views, read them with `useFateRequest` /
// `useFateView`, mutate with `client.mutations`. Components re-render
// only when their selected fields change.
import { h } from "ilha";
import type { View } from "ilha";

import { FateContext } from "./atoms.ts";
import type { FateClientLike } from "./atoms.ts";

/** Props for `<FateProvider>`: the client plus the tree that reads it. */
export interface FateProviderProps {
  client: FateClientLike;
  children?: View;
}

/**
 * Provide a Fate client to the tree below. Reads through
 * `useFateClient` (or the request/view hooks, which read it
 * implicitly).
 */
export const FateProvider = (props: FateProviderProps): View =>
  h(FateContext.Provider as never, { value: props.client }, props.children);

export { useFateClient, useFateRequest, useFateView } from "./hooks.ts";
export { FateContext } from "./atoms.ts";
export type { FateClientLike } from "./atoms.ts";
