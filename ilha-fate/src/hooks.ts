// ilha hooks over Fate data views (`@nkzw/fate` core, no framework
// adapter): the request/view half of vue-fate's composables, rebuilt on
// ilha atoms.
//
// - `useFateRequest(request)` reads a request root from the normalized
//   cache and subscribes to result changes; the component re-renders
//   through an atom bump (vue's `useSyncExternalStore` shape).
// - `useFateView(view, ref)` reads selected fields for a ref and
//   subscribes to exactly those fields via `store.subscribe` (vue's
//   coverage tracking), so a component re-renders only when its own
//   fields change.
// - Mutations need no hook: call `client.mutations.*` from an event
//   handler after reading the client with `useFateClient`.
//
// Reads are synchronous: client-state roots are covered by their
// defaults, so `readView`/`getSnapshot` resolve without fetching. A
// snapshot that is still pending (persistence restore, network fetch)
// throws a descriptive error instead of suspending — ilha suspends
// through yielded effects, which generator components cannot combine
// with atom re-renders, so network suspense stays out of this
// experiment until ilha grows an external-store suspense primitive.
// Cleanup follows the house pattern: subscription callbacks no-op
// once their fiber is closed, and coverage/observer identity is
// reconciled on every run so changed selections drop stale
// subscriptions. Requests are not explicitly retained — client-state
// roots stay reachable through the schema, which is what keeps their
// records alive; revisit when server requests arrive.
import { atom, context } from "ilha";
import { getFiber } from "ilha/renderer";
import type { FiberLocal } from "ilha/renderer";
import type {
  Entity,
  FateClient,
  FateMutations,
  FateRoots,
  RegisteredClient,
  Request,
  Selection,
  View,
  ViewData,
  ViewRef,
} from "@nkzw/fate";

import { FateContext } from "./atoms.ts";

/**
 * Read the active Fate client (throws outside `<FateProvider>`). Typed
 * through the app's `ClientRegistration` like react-fate's hook, so
 * `client.mutations.*` stays type-safe without codegen.
 */
export const useFateClient = (): RegisteredClient<FateClient<FateRoots, FateMutations>> => {
  const client = context(FateContext)();
  if (client === null) {
    throw new Error("useFateClient must be used inside a <FateProvider>.");
  }
  return client as RegisteredClient<FateClient<FateRoots, FateMutations>>;
};

type EntityCoverage = ReadonlyArray<readonly [string, ReadonlySet<string>]>;

interface ViewSlot {
  subs: Map<string, { paths: Set<string>; unsub: () => void }>;
}

/** Reconcile store subscriptions to the latest coverage (vue parity). */
const syncCoverage = (
  client: FateClient<any, any>,
  slot: ViewSlot,
  coverage: EntityCoverage,
  onChange: () => void,
): void => {
  const seen = new Set<string>();
  for (const [id, paths] of coverage) {
    seen.add(id);
    const previous = slot.subs.get(id);
    const same =
      previous !== undefined &&
      previous.paths.size === paths.size &&
      [...paths].every((path) => previous.paths.has(path));
    if (!same) {
      previous?.unsub();
      slot.subs.set(id, {
        paths: new Set(paths),
        unsub: client.store.subscribe(id, paths, onChange),
      });
    }
  }
  for (const [id, entry] of [...slot.subs]) {
    if (!seen.has(id)) {
      entry.unsub();
      slot.subs.delete(id);
    }
  }
};

interface RequestSlot {
  current: {
    request: unknown;
    getSnapshot: () => unknown;
    unsub: () => void;
  } | null;
}

/**
 * Run a request root through the Fate client and return its current
 * result (refs for the selected roots). Result changes re-render the
 * component through an atom bump.
 */
export const useFateRequest = (request: Request): unknown => {
  const client = useFateClient();
  const fiber: FiberLocal = getFiber();
  const tick = atom(0);
  tick();
  const box = atom.lazy<RequestSlot>(() => ({ current: null }));
  const previous = box().current;
  if (previous === null || previous.request !== request) {
    previous?.unsub();
    const observer = client.observeRequestResult(request);
    const unsub = observer.subscribe(() => {
      if (!fiber.closed) {
        tick.set(tick() + 1);
      }
    });
    box().current = {
      getSnapshot: () => observer.getSnapshot(),
      request,
      unsub,
    };
  }
  return box().current?.getSnapshot();
};

/**
 * Read selected fields for a ref from the normalized cache and return
 * the masked view data (`null`/`undefined` refs pass through). Field
 * changes re-render through an atom bump, limited to the selected
 * fields. Throws when the snapshot is still pending.
 */
export const useFateView = <T extends Entity, S extends Selection<T>>(
  view: View<T, S>,
  ref: ViewRef<string> | null | undefined,
): unknown => {
  const client = useFateClient();
  const fiber: FiberLocal = getFiber();
  const tick = atom(0);
  const box = atom.lazy<ViewSlot>(() => ({ subs: new Map() }));
  const slot = box();
  tick();
  if (ref === null || ref === undefined) {
    return ref;
  }
  const snapshot = client.readView(view as never, ref as never) as unknown as {
    status?: unknown;
    value?: { data: unknown; coverage: EntityCoverage };
  };
  if (snapshot.status !== "fulfilled" || snapshot.value === undefined) {
    throw new Error(
      "[ilha-fate] useFateView() hit a pending snapshot (persistence restore or network fetch). " +
        "This experiment only covers synchronously cached client state — warm the cache first (e.g. preload the request at the root).",
    );
  }
  syncCoverage(client, slot, snapshot.value.coverage ?? [], () => {
    if (!fiber.closed) {
      tick.set(tick() + 1);
    }
  });
  return snapshot.value.data as ViewData<T, S>;
};
