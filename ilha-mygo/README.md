# ilha-mygo

Go retained-host bindings for [ilha](https://github.com/ilhajs/ilha):
a minimal scene-graph host in Go, driven from Bun over two transports.

- **Primary — `bun:ffi`** (`FfiHost`): synchronous `dlopen` calls into
  `go/libmygo.so` (built with `go build -buildmode=c-shared`). Synchronous
  matters: ilha `PaintOps` is fully sync, so the FFI host plugs straight
  into `createMygoRenderer` with no bridging.
- **Fallback — child-process JSON IPC** (`IpcHost`): the `mygo-ipc`
  binary speaks one-JSON-per-line over stdio (`create`, `setProp`,
  `delProp`, `attach`, `detach`, `remove`, `count`, `describe`, `reset`,
  `version`). Use it where the shared library cannot load.
- Both transports share the same Go `Store`, so a tree built over one
  reads back identically over the other. `MemoryHost` mirrors the store
  semantics in pure TypeScript for tests.
- **`paint.ts`** adapts a synchronous host to ilha `PaintOps` +
  `createRenderer`: `createElement`/`createText` allocate Go handles
  (tags resolve through the catalogue, so `div` → `Box`), props live in
  the store, `placeChildren` detaches the current children and attaches
  the next list in order, `createRaw` returns no nodes (a retained scene
  graph has no HTML parser — same precedent as the pixi host), and event
  props are collected on the element. ilha mounts component holes in
  `display:contents` spans, which stay transparent `Span` groups (pixi
  `Container`-fallback precedent) — never text.
- **Bindings** (pixi parity where it fits): `catalogue.ts` (JSX tag →
  kind, `extend`), `canvas.tsx` (`MygoRoot` + `bootRoot` + `createRoot`),
  `hooks.ts` (`useMygo`/`useHost`/`useFrame`/`useTick`), `events.ts`
  (`onX` map, lowercase warning, `dispatchMygoEvent` with versioned
  payloads), `loop.ts` (demand-by-default `createLoop`), `loaders.ts`
  (suspense cache), `text.ts` (`#text` nodes + `estimateTextSize`
  stand-in), `atoms.ts` (`RootState` in context), `dispose.ts`
  (subtree release with `dispose={null}` opt-out).

```ts
import { FfiHost, bootRoot } from "ilha-mygo";

const host = FfiHost.open("go/libmygo.so");
const state = bootRoot(
  host,
  <column direction="column" gap="8">
    <mygoText value="hello">hello</mygoText>
  </column>,
);
await state.ready;
console.log(host.describe(state.root.nodeId));
state.dispose();
host.close();
```

## Demo

`bun run example` → `http://localhost:8139/`: paints a Column/Row
layout with text, a cached image and a button into the FFI host, drives
five demand-mode loop frames, dispatches a click, and serves the retained
tree (`/api/tree`) plus observable proof (`/api/proof`):

```json
{"backend":"ffi","clickTarget":11,"clicks":1,"frames":6,"image":"bytes:logo.png","layout":{"direction":"column","gap":"8","padding":"16"},"subscriberCalls":5,"title":"ilha-mygo dashboard"}
```

## Layout

- `go/store.go` — the shared retained store (both transports)
- `go/lib/lib.go` — c-shared FFI exports (`Mygo*`)
- `go/cmd/mygo-ipc/main.go` — stdio JSON line server
- `src/host.ts` — `FfiHost`, `IpcHost`, `MemoryHost`
- `src/paint.ts` — `PaintOps` adapter + `createMygoRenderer` + `elementFor`
- `src/catalogue.ts`, `src/mygo-types.ts` — JSX tag → kind + intrinsics
- `src/canvas.tsx` — `MygoRoot`, `bootRoot`, `createRoot`
- `src/hooks.ts`, `src/events.ts`, `src/loop.ts`, `src/loaders.ts`
- `src/text.ts`, `src/atoms.ts`, `src/dispose.ts`
- `example/` — `demo.tsx` (shared demo), `serve.ts` (demo on
  `http://localhost:8139/`) and `build.ts` (one-shot `example/index.html`
  snapshot)
