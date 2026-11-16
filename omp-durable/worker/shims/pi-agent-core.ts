/**
 * Worker entry for the `@oh-my-pi/pi-agent-core` barrel.
 *
 * The barrel re-exports everything (`Agent`, `compaction/*`, `proxy`,
 * …), which drags provider OAuth registries, `bun:sqlite` session stores,
 * and other local-only modules into the bundle. The worker turn path needs
 * exactly one runtime export — `agentLoop()` (plus `agentLoopContinue()`
 * for retries) — so this module re-exports the deep implementation
 * directly. Everything `agent-loop.ts` itself imports stays real (see
 * `shims/README.md`).
 */

export { agentLoop, agentLoopContinue } from "@oh-my-pi/pi-agent-core/agent-loop";
