# Worker shims: why omp runs in an isolate

`@oh-my-pi/pi-agent-core`'s turn path (`agentLoop()` and everything it
imports) is almost fully portable — the sweep in `PROPOSAL.md` §Cloud port
found exactly three runtime couplings, all handled at bundle time by
`worker/build.ts` (`alias`), never by forking omp:

1. **`@oh-my-pi/pi-natives`** (N-API: tokenizers, shell, pty, desktop).
   Only `tokenizer.ts` touches it on the turn path, and only
   `Encoding` + `countTokens()`. `shims/pi-natives.ts` mirrors the string
   `Encoding` enum 1:1 and approximates `countTokens()` as
   `ceil(chars/4)`. Effect: token *budgets* become approximate on workers.
   Provider-side usage (the billed numbers) is unaffected — it comes back
   in the provider response.
2. **`@oh-my-pi/pi-utils`** (barrel drags `bun:ffi`, `bun`, `node:fs`,
   process management). `shims/pi-utils.ts` ports the pure subset the loop
   actually calls (`cloneJsonTree`, `sanitizeText`, `toError`, …) plus a
   console-backed `logger`. Anything process- or terminal-shaped
   (`prompt`, `ptree`, `procmgr`, …) is a throwing stub: bundling proves
   the names exist, and calling one fails loudly instead of silently.
3. **`@oh-my-pi/pi-agent-core`** (barrel drags the whole product).
   `shims/pi-agent-core.ts` re-exports only `agentLoop()`/`agentLoopContinue()`.
4. **`@oh-my-pi/pi-ai`** (barrel drags `node:fs` via `stream.ts`).
   `shims/pi-ai.ts` re-exports the portable deep modules verbatim and stubs
   only `streamSimple`/`completeSimple` (default transports — the worker
   always injects its own `streamFn`, so the stubs must never run).
5. **`Bun.*` globals** (`Bun.env.*`, `Bun.sha` in the loop path).
   `shims/bun-global.ts` is `inject`ed at the top of the bundle: an empty
   `Bun.env` (unset semantics) and a deterministic non-crypto `Bun.sha`
   (in-run digests only — see the file). `??=` keeps real Bun untouched.

Everything else (`omptype`, `pi-wire`, `snapcompact`, `pi-catalog` compat,
`node:path`, `node:async_hooks`, …) bundles unmodified under workerd's
`nodejs_compat`.

## Also bundle-time only

- `with { type: "text" }` import attributes (omp prompts) are stripped by
  `build.ts`, and `.md` files load as text modules — esbuild cannot parse
  the attribute. No upstream behavior changes.
- `pi-durable`'s empty `Models` (`worker/pi-models.ts`): the worker never
  runs pi generation, and importing the real `createModels()` would drag
  an auth chain with a dynamic `node:fs` import that workerd cannot link.
  Any code path that needs a provider fails fast with a clear error.

## Ground rule

A shim grows **only by bundler demand**: `worker/build.ts` fails on the
first missing export, you add exactly that export, rebuild. Never
pre-port the world.
