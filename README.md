# labs

Monorepo for side quests: small experimental packages, each with its own
tests and a runnable example.

## Catalogue

| Experiment | What it is | Run it |
|---|---|---|
| [ilha-three](./ilha-three) (`ilha-tree`) | Three.js renderer bindings for [ilha](https://github.com/ilhajs/ilha) with react-three-fiber parity | `cd ilha-three && bun install && bun run example` → `http://localhost:8137/` |
| [ilha-pixi](./ilha-pixi) (`ilha-pixi`) | PixiJS renderer bindings for ilha with pixi-react parity | `cd ilha-pixi && bun install && bun run example` → `http://localhost:8138/` |
| [ilha-mygo](./ilha-mygo) (`ilha-mygo`) | Go retained-host bindings for ilha (`bun:ffi` primary, child-process IPC fallback) | `cd ilha-mygo && bun install && bun run example` → `http://localhost:8139/` |

Each package also documents its own API in its README.

## Working in a package

Every experiment follows the same commands (run inside its folder):

- `bun install` — install dependencies
- `bun run example` — build and serve the demo with rebuild-on-save
- `bun run example:build` — one-shot demo bundle
- `bun run typecheck` — `tsc --noEmit`
- `bun test` — unit tests
- `bun run build` — library build (`dist/`, via tsdown)

Generated output (`node_modules/`, `dist/`, the bundled `example/index.html`)
is git-ignored; the preview server rebuilds the bundle on start.
