/**
 * Worker port of the `@oh-my-pi/pi-natives` surface the agent loop touches.
 *
 * Real module: N-API bindings (tokenizers, shell, pty, desktop…). The turn
 * path uses exactly two of them (`tokenizer.ts`):
 * - `Encoding`: a string enum — mirrored 1:1, so encoded values keep their
 *   meaning wherever they cross the shim boundary.
 * - `countTokens()`: approximated as `ceil(chars / 4)`. This feeds token
 *   *budgets* (context pruning, output limits) only; billed usage always
 *   comes from the provider response.
 */

export enum Encoding {
  O200kBase = "O200kBase",
  Cl100kBase = "Cl100kBase",
  ClaudeV3 = "ClaudeV3",
  ClaudeV47 = "ClaudeV47",
  ClaudeV5 = "ClaudeV5",
  ClaudeV5Sonnet = "ClaudeV5Sonnet",
  Qwen3 = "Qwen3",
  DeepSeekV3 = "DeepSeekV3",
  KimiK2 = "KimiK2",
  Glm5 = "Glm5",
  Jev = "Jev",
}

export function countTokens(input: string | readonly string[], _encoding?: Encoding | undefined | null): number {
  const text = typeof input === "string" ? input : input.join("");
  return Math.max(1, Math.ceil(text.length / 4));
}
