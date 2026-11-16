/**
 * `globalThis.Bun` polyfill, injected at the top of the worker bundle.
 *
 * Two `Bun.*` references survive in the bundled turn path:
 * - `Bun.env.*` (agent-loop intent/dialect flags, harmony debug): an empty
 *   env object reproduces "unset" semantics exactly — `!== "1"` stays true,
 *   `||` fallbacks apply. Workers read config from the `env` binding, not
 *   `process.env`, so there is nothing to forward.
 * - `Bun.sha(text, "hex")` (harmony-leak content digests): replaced with a
 *   deterministic 8-hex-char FNV-style hash. These digests are compared
 *   within a run only (dedup/preview keys), never persisted across
 *   versions, so a non-crypto hash is behavior-preserving here.
 *
 * `??=` keeps the real Bun runtime untouched.
 */

function fnv8Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

declare global {
  // eslint-disable-next-line no-var
  var Bun: { env: Record<string, string | undefined>; sha: (input: string | Uint8Array, encoding?: string) => string } | undefined;
}

globalThis.Bun ??= {
  env: {},
  sha: (input: string | Uint8Array): string => {
    const text = typeof input === "string" ? input : new TextDecoder().decode(input);
    return fnv8Hex(text).slice(0, 8);
  },
};

export {};
