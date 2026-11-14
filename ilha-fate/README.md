# ilha-fate

ilha bindings for Fate data views: the request/view half of
`vue-fate`'s composables, rebuilt on ilha atoms + suspense over the
framework-free `@nkzw/fate` core.

- **`FateProvider`** — provides the client to the tree (ilha context,
  like `RootContext`).
- **`useFateRequest(request)`** — reads a request root's current
  result synchronously, subscribes to result changes, and re-renders
  through an atom bump.
- **`useFateView(view, ref)`** — reads selected fields for a ref from
  the normalized cache and subscribes to exactly those fields via
  `store.subscribe` (vue's coverage tracking), so a component
  re-renders only when its own fields change. `null`/`undefined` refs
  pass through.
- **Mutations** need no hook: call `client.mutations.*` from an event
  handler after reading the client with `useFateClient()`.

```tsx
const CounterView = view<Counter>()({ value: true });

function CounterPanel(): View {
  const fate = useFateClient();
  const result = useFateRequest({ counter: { view: CounterView } }) as {
    counter: ViewRef<"Counter">;
  };
  const data = useFateView(CounterView, result.counter) as { value: number };
  return (
    <button onclick={() => void fate.mutations.counter.increment()}>
      Count: {data.value}
    </button>
  );
}
```

Client state (`dataView` + `clientSchema` + `registerClientSchema`)
needs no transport, no Vite plugin and no codegen — the whole store
runs in the browser, which is what this experiment covers. Views,
requests, caching and mutations behave the same as in React and Vue;
what differs is the renderer binding: ilha atoms drive re-renders and
ilha's test harness mounts components headlessly.

Reads are synchronous: client-state roots are covered by their
defaults, so `readView`/`getSnapshot` resolve without fetching. A
snapshot that is still pending (persistence restore, network fetch)
throws a descriptive error instead of suspending — ilha suspends
through yielded effects, which generator components cannot combine
with atom re-renders, so network suspense stays out of this
experiment until ilha grows an external-store suspense primitive.

## Layout

- `src/` — `index`, `hooks` (`useFateClient`, `useFateRequest`,
  `useFateView`), `atoms` (`FateContext`, `FateProvider` lives in
  `index`)
- `example/` — task board + shared counter over client state
  (`bun run example` serves it with rebuild-on-save)

## Limits (experiment scope)

- No server transports yet (`createHTTPTransport` /
  `createTRPCTransport` untested here); no `retain`/`dispose`
  lifecycle — client-state roots stay reachable through the schema.
- No persistence layer wired up (see fate's persistence guide).
- Lists use plain id arrays on a board root, not fate list views.
