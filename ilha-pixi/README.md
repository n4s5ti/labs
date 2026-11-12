# ilha-pixi

PixiJS renderer bindings for [ilha](https://github.com/ilhajs/ilha):
pixi-react parity on top of ilha `PaintOps` + atoms instead of
zustand/scheduler.

- **Catalogue** — `extend()` registers constructors; every `PIXI.*`
  export resolves as a JSX tag out of the box (`pixi`-prefixed names are
  stripped; use `<pixiText>` for text to avoid the SVG collision).
- **Reconciler** — real Pixi instances are augmented in place (no
  wrappers), so `instanceof`, hit testing and refs keep working. `args`
  reconstructs, `attach` (string or function) includes `filters`
  auto-attach, dash props (`position-x`) work, and removed subtrees are
  destroyed recursively (`markNoDispose` opts out).
- **`<Canvas>`** — owns the `Application`, stage, ticker, frameloop,
  resize and pointer-event manager. `<primitive object={…} />` renders
  foreign objects; `onCreated` supported.
- **Hooks** — `useApplication`, `useTick` (ticker add/remove),
  `useFrame` parity, `useInstanceHandle`, and `useLoader`
  (cached `Assets` loads with `preload`/`clear` included).
- **Events** — `onPointerDown`/`onClick`/… props dispatch through
  Pixi's `EventBoundary` with `eventMode` following the handler set
  unless set explicitly (`"none"` is never forced: it would prune
  handler-bearing descendants from hit testing).

```tsx
import { Canvas } from "ilha-pixi";

const App = () => (
  <Canvas background="#0e0e1a">
    <container x={100} y={100}>
      <sprite texture={texture} />
    </container>
  </Canvas>
);
```

## Layout

- `src/` — `index`, `canvas`, `hooks`, `events`, `catalogue` entries
  (plus `reconciler-pixi`, `loop`, `loaders`, `atoms`, `dispose`,
  `pixi-types`)
- `example/` — interactive slots port proving the bindings
  (`bun run example` serves it with rebuild-on-save)
