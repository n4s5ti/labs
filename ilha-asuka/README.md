# ilha-asuka

ilha renderer over [Asuka](https://asuka.egoist.dev)'s native-host
protocol: a scene-graph store in Go, driven from Bun over two
transports, recording every mutation as an Asuka op.

- **Core** — `go/store.go` on `github.com/egoist/asuka` (`ops` +
  `layout`): nodes carry Asuka schema kinds, typed props validated by
  `ops.PropType`, host event subscriptions and layout frames. Every
  mutation appends to an `ops.Batch` (`Create`, `SetProp`, `Insert @i`,
  `Remove`, `Destroy`, `Listen`, `SetRoot`, `SetFrame`), so the log
  replays onto any real Asuka host. Layout runs Asuka's own flexbox/grid
  engine over the style strings ilha sends.
- **Primary transport — `bun:ffi`** (`FfiHost`): synchronous `dlopen`
  calls into `go/libasuka.so`. Synchronous matters: ilha `PaintOps` is
  fully sync, so the FFI host plugs straight into
  `createAsukaRenderer` with no bridging.
- **Fallback — child-process JSON IPC** (`IpcHost`): the `asuka-ipc`
  binary speaks one-JSON-per-line over stdio (`create`, `setString`,
  `insert`, `listen`, `layout`, `describe`, …). Use it where the shared
  library cannot load.
- **Host compatibility proof** — `go/store_test.go` replays the recorded
  batch into Asuka's own `host/fake` (`Apply` panics on any op a real
  host could not apply) and compares trees, props, frames and listens;
  the binary encoding round-trips too (the form mobile hosts read).
- **`MemoryHost`** mirrors the store semantics in pure TypeScript for
  tests. Its layout pass is a structural approximation (row/column
  stacking with stretch); the Go engine is the source of truth.
- **`paint.ts`** adapts a synchronous host to ilha `PaintOps` +
  `createRenderer`: `createElement`/`createText` allocate Asuka nodes
  (tags resolve through the catalogue, so `div` → View), `placeChildren`
  reconciles with Remove + indexed Insert, and event props subscribe
  host-side via `listen`. ilha mounts component holes in transparent
  `View` groups — the pixi `Container`-fallback precedent.
- **Bindings** (pixi parity where it fits): `catalogue.ts` (JSX tag →
  kind ID, `extend`), `canvas.tsx` (`AsukaRoot` + `bootRoot` +
  `createRoot`), `hooks.ts` (`useAsuka`/`useHost`/`useFrame`/`useTick`),
  `events.ts` (`onX` → Asuka event, `dispatchAsukaEvent` with versioned
  payloads), `loop.ts` (demand-by-default `createLoop`), `loaders.ts`
  (suspense cache), `text.ts` (`Text` nodes + `estimateTextSize`, the
  same rule the Go measure uses), `atoms.ts` (`RootState` in context),
  `dispose.ts` (subtree destroy with `dispose={null}` opt-out).

```ts
import { FfiHost, bootRoot } from "ilha-asuka";

const host = FfiHost.open("go/libasuka.so");
host.setRoot(host.create(1)); // View root (done by bootRoot)
const state = bootRoot(
  host,
  <column direction="column" gap="8">
    <asukaText value="hello">hello</asukaText>
  </column>,
);
host.layout(state.root.nodeId, 390, 844);
console.log(host.describe(state.root.nodeId));
state.dispose();
host.close();
```

## Demo

`bun run example` → `http://localhost:8139/`: paints a Column/Row
layout with text, a cached image and a button into the FFI host, runs
the Asuka layout engine, drives five demand-mode loop frames, dispatches
a Press, and serves the retained tree (`/api/tree`), the op log a real
host would apply (`/api/ops`) and observable proof (`/api/proof`):

```json
{"backend":"ffi","clickTarget":11,"clicks":1,"frames":6,"image":"bytes:logo.png","ops":60,"subscriberCalls":5,"title":"ilha-asuka dashboard"}
```

## Layout

- `go/store.go` — the Asuka-protocol store (both transports)
- `go/store_test.go` — unit + `host/fake` conformance tests
- `go/lib/lib.go` — c-shared FFI exports (`Asuka*`)
- `go/cmd/asuka-ipc/main.go` — stdio JSON line server
- `src/host.ts` — `FfiHost`, `IpcHost`, `MemoryHost`
- `src/paint.ts` — `PaintOps` adapter + `createAsukaRenderer` + `elementFor`
- `src/catalogue.ts`, `src/asuka-types.ts` — JSX tag → kind ID + intrinsics
- `src/canvas.tsx` — `AsukaRoot`, `bootRoot`, `createRoot`
- `src/hooks.ts`, `src/events.ts`, `src/loop.ts`, `src/loaders.ts`
- `src/text.ts`, `src/atoms.ts`, `src/dispose.ts`
- `example/` — `demo.tsx` (shared demo), `serve.ts` (demo on
  `http://localhost:8139/`) and `build.ts` (one-shot `example/index.html`
  snapshot)

Style props (`direction`, `gap`, `padding`, `width`, `height`, `align`,
`justify`, `grow`, `shrink`, `wrap`) stay core-side like Asuka's
`ui.Style` and never enter the batch. `data-*`/`xmlns`/test ids ride
the lab-only `Attrs` escape hatch: described, never batched.
