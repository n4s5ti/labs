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
- **3D scenes** (`@pixi/3d`) — the catalogue also seeds every `@pixi/3d`
  export, so `<view3D>`, `<container3D>`, `<model3D>`, `<mesh3D>`,
  `<sprite3D>`, lights (`<directionalLight>`…), cameras and geometries
  work as JSX with the same reconciler: real scene nodes adopted in
  place, `args` reconstruction, `attach="geometry"` /
  `attach="material"`, ray-picked pointer events, and recursive destroy.
  - 3D children mount under the view's scene root (`view.root` — a
    `View3D` draws only its scene, so the bindings route them there
    for you). 2D content under a view is an error with a pointer to
    the fix: put 2D overlays as siblings *after* the view and they
    draw over the scene.
  - Positions take `z` (`position={[x, y, z]}`, `position-z`), `scale`
    takes a uniform scalar (`scale={2}` → xyz), and 3D `rotation`
    takes radians (`rotation={[x, y, z]}`).
  - `<model3D args={[{ source }]} />` loads glTF through `Assets`
    (suspense via `useLoader`, as usual); geometry and material come
    from `args`, props, or `attach`. A component directly under a
    view works too — its hole rides the scene inertly while its 3D
    children join `view.root`.
  - One collision: both barrels export `PlaneGeometry`; the 2D one
    keeps the tag (existing scenes keep working) and the 3D one is
    reachable through `extend({ Plane3D: PlaneGeometry3D })`.
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
- `example/` — interactive slots port proving the bindings, with a
  spinning-cube 3D backdrop behind the machine (`bun run example`
  serves it with rebuild-on-save)
