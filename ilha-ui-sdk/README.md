# ilha-ui-sdk

Ilha bindings for [vercel-labs/ui](https://github.com/vercel-labs/ui) headless behaviors:
the `@ui-sdk/solid` package (v0.1.0-beta.3) ported to Ilha atoms over the
framework-free `@ui-sdk/core` (v0.1.0-beta.3).

- **Headless and unstyled** — zero CSS shipped, no tailwind/cva/clsx. State
  drives `class` / `style` / `children` functions; `data-*` / `aria-*` come
  from `@ui-sdk/core`, so a11y and keyboard behavior are identical to the
  Solid package.
- **Same public shape** — `usePrimitive`, `usePart`, `createParts`,
  `PartProps`, `PrimitiveHandle`, per-component controllers and `*Options` /
  `*State` / `*Api` types are all re-exported from `@ui-sdk/core`, exactly
  like the Solid package's barrel.
- **Ilha reactivity** — one `tick` atom per component instead of Solid
  signals: core store changes bump it on a microtask and the body re-runs
  and morphs. See `src/primitive.ts` for the deliberate divergences (no
  per-part delivery tracking, eager class/style resolution, lowercase
  `onclick` handlers).

## Tranche 1 (this experiment)

`primitive` (adapter), `field-context`, `toolbar-context`, plus `button`,
`checkbox` (+ group), `switch`, `toggle` (+ group), `tabs`, `label`,
`separator`, `meter`, `progress` — each with the Solid package's controllers
and types re-exported. Run `bun run example` for a live demo of all of them.

Groups A–D port every remaining Solid module (dialog, popover, menu,
select, combobox, calendar, rating, slider, toast, tree, waterfall, …):
popups render inline, in place, while their slot is present — Ilha has no
portal, so the `container` option is accepted and ignored, and the sheet
viewport wrapper is skipped. Token custom rendering mounts one island per
host instead of a portal. Every file below is verified by `bun test` +
`typecheck` + `build`.

## Layout

- `src/` — `primitive` (adapter), `field-context`, `toolbar-context`,
  one module per component, `index` barrel, `components.test.tsx`
- `example/` — demo page over all tranche-1 components
  (`bun run example` serves it with rebuild-on-save)

## Working in this package

Every experiment follows the same commands (run inside its folder):

- `bun install` — install dependencies
- `bun run example` — build and serve the demo with rebuild-on-save
- `bun run example:build` — one-shot demo bundle
- `bun run typecheck` — `tsc --noEmit`
- `bun test` — unit tests
- `bun run build` — library build (`dist/`, via tsdown)

## Port notes (Solid → Ilha)

| Solid | Ilha |
|---|---|
| `createSignal` / `createMemo` | `atom` (body read subscribes whole component; `{handle}` in markup for fine-grained nodes) |
| `createEffect` / `onMount` | `watch` / `watch.once` (cleanup return) |
| `Show` / `For` | ternaries / `items().map` with `key` |
| `onClick` props, `className` | lowercase `onclick`, `class` |
| `Portal` | inline in place while the slot is present (`container` accepted and ignored); token `renderToken` mounts one island per host |
| `createUniqueId` | per-fiber `ilha-ui-sdk-N` ids via `atom.lazy` |
| `solid-js` `omit` / `merge` | local `omit`; eager object spread |

Component bodies are thin wrappers over `@ui-sdk/core` primitives in both
packages; only `src/primitive.ts` (1316 lines in Solid) is a real rewrite,
and it is intentionally coarser: whole-component re-render per change
instead of per-key memo updates.
