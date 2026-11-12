# ilha-tree

Three.js renderer bindings for [ilha](https://github.com/ilhajs/ilha):
react-three-fiber parity on top of ilha `PaintOps` + atoms instead of
zustand/scheduler.

- **Catalogue** — `extend()` registers constructors; every `THREE.*`
  export resolves as a lowercase JSX tag out of the box.
- **Reconciler** — real three instances are augmented in place (no
  wrappers), so `instanceof`, raycasting and refs keep working. `args`
  reconstructs, `attach` (string or function) includes `geometry` /
  `material` auto-attach, dash props (`position-x`) work, and removed
  subtrees auto-dispose (`dispose={null}` opts out).
- **`<Canvas>`** — owns the `WebGLRenderer`, scene, camera, frameloop,
  resize and pointer-event manager. `<primitive object={…} />` renders
  foreign objects; `onCreated`/`onPointerMissed` supported.
- **Hooks** — `useThree`, `useFrame(cb, priority)`, `useGraph`,
  `useInstanceHandle`, and `useLoader` (yield the effect from a generator
  component or await `cachedLoad` in an async one; `preload`/`clear`
  included).
- **Events** — `onClick`/`onPointerMove`/… props raycast against
  registered objects with `stopPropagation` and pointer-missed support.

```tsx
import { Canvas } from "ilha-tree";

const App = () => (
  <Canvas camera={{ position: [-5, 3, 10], lookAt: [0, 2, 0] }}>
    <mesh position={[0, 1, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="orange" />
    </mesh>
  </Canvas>
);
```

## Layout

- `src/` — `index`, `canvas`, `hooks`, `events`, `catalogue` entries
  (plus `reconciler-three`, `loop`, `loaders`, `atoms`, `dispose`,
  `three-types` internals).
- `example/` — port of three.js r187
  `webgl_animation_skinning_morph` built only on these bindings.
  `bun run example` regenerates the self-contained
  `example/index.html` (plus vendored `example/assets/*.glb`).

## Develop

```sh
bun install
bun run typecheck   # tsc --noEmit
bun test            # 28 tests: catalogue, loop, dispose, loaders, events, reconciler
bun run build       # tsdown → dist/
bun run example     # bundle the example page
```

## Notes

- Generator components (`function*`) are first-class: `yield` loader
  effects and keep yielding views; plain components use `useFrame` and
  refs, which are stable across re-renders.
- `attach` climbs through component/fragment hole hosts to the nearest
  real ancestor, so `<color attach="background">` works inside
  components.
- No `<line>` intrinsic: it collides with SVG's `<line>`. Use
  `<lineSegments>` / `<lineLoop>` or `extend()` a capital alias.
- Transforms on `<primitive>` apply to its holder group; the object
  itself is what refs and events receive.
