/**
 * Worker entry for the `@oh-my-pi/pi-ai` barrel.
 *
 * The barrel drags `node:fs` (via `stream.ts`) into every bundle, which
 * workerd cannot instantiate. This module re-exports the portable deep
 * modules verbatim and stubs only what the worker never calls:
 * - `streamSimple`: the default model transport. The worker always injects
 *   its own `streamFn` (scripted in tests, fetch-based in production), so
 *   the stub must never run — calling it throws loudly.
 *
 * Grows strictly by bundler demand (see `shims/README.md`).
 */

export { EventStream } from "@oh-my-pi/pi-ai/utils/event-stream";
export { isApiKeyResolver, resolveApiKeyOnce, seedApiKeyResolver } from "@oh-my-pi/pi-ai/auth-retry";
export { stripSchemaDescriptions, toolWireSchema } from "@oh-my-pi/pi-ai/utils/schema/wire";
export { validateToolArguments } from "@oh-my-pi/pi-ai/utils/validation";
export { retryTransientCompletion } from "@oh-my-pi/pi-ai/oneshot-retry";
export { shouldSendServiceTier } from "@oh-my-pi/pi-ai/types";

export function streamSimple(): never {
  throw new Error(
    "streamSimple (default model transport) is unavailable in the worker runtime: pass an explicit streamFn",
  );
}

export function completeSimple(): never {
  throw new Error(
    "completeSimple (one-shot completion) is unavailable in the worker runtime: use streamSimple's replacement streamFn",
  );
}
