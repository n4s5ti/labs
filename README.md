# labs

Monorepo for side quests: small experimental packages, each with its own
tests and a runnable example.

## Catalogue

| Experiment | What it is | Run it |
|---|---|---|
| [ilha-fate](./ilha-fate) (`ilha-fate`) | ilha bindings for Fate data views (client-state over `@nkzw/fate`, suspense + atom updates) | `cd ilha-fate && bun install && bun run example` → `http://localhost:8140/` |
| [ilha-pixi](./ilha-pixi) (`ilha-pixi`) | PixiJS renderer bindings for ilha with pixi-react parity (2D + `@pixi/3d` scenes) | `cd ilha-pixi && bun install && bun run example` → `http://localhost:8138/` |
| [ilha-asuka](./ilha-asuka) (`ilha-asuka`) | ilha renderer over Asuka's native-host protocol (`ops` batches + layout in Go, `bun:ffi` primary, child-process IPC fallback) | `cd ilha-asuka && bun install && bun run example` → `http://localhost:8139/` |
| [omp-durable](./omp-durable) (`omp-durable`) | oh-my-pi harness features on pi-durable: full session parity, durable execution, Cloudflare DO ready | `cd omp-durable && bun install && bun run example` → `http://localhost:8150/` |

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
