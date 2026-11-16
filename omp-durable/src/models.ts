/**
 * omp model-role routing over pi-ai.
 *
 * omp resolves a *role* per subtask — `default`, `smol`, `slow`, `plan`,
 * `commit`, `vision`, `task`, `advisor`, `tiny` (`packages/coding-agent`,
 * model routing) — through its `ModelRegistry` with per-role fallback chains.
 * pi-durable instead takes one `Models` catalog plus a per-conversation
 * `Agent.model` override (`AgentChange.model`).
 *
 * This module is the bridge, not a reimplementation of the registry:
 * - `OMP_ROLES` names the roles parity covers.
 * - `RoleModelMap` binds roles to `ModelRef`s (`{ provider, modelId }`).
 * - `roleAgentChange()` applies a role to a conversation via `configure()`.
 * - `withRoleFallback()` wraps a pi-ai `Models` with omp-style ordered
 *   fallback: it returns the first ref whose provider the catalog knows.
 *
 * Provider credentials and request transport stay in the host's `Models`
 * (`HarnessOptions.models`), exactly where pi-durable expects them — this
 * file only picks *which* catalog entry a turn uses.
 */

import type { ModelRef } from "@earendil-works/pi-durable";

/** Subtask roles omp routes independently. */
export const OMP_ROLES = [
  "default",
  "smol",
  "slow",
  "plan",
  "commit",
  "vision",
  "task",
  "advisor",
  "tiny",
] as const;

export type OmpRole = (typeof OMP_ROLES)[number];

/** Role → model binding. Unset roles inherit `default`, then the catalog. */
export type RoleModelMap = Partial<Record<OmpRole, ModelRef>>;

export function isOmpRole(value: string): value is OmpRole {
  return (OMP_ROLES as readonly string[]).includes(value);
}

/**
 * `AgentChange` applying `role` to a conversation: the bound `ModelRef`, or
 * the `default` binding, or `{}` (leave the catalog to decide) when neither
 * is set. Pass the result to `Conversation.configure()`.
 */
export function roleAgentChange(map: RoleModelMap, role: OmpRole): { readonly model?: ModelRef } {
  const ref = map[role] ?? map.default;
  return ref === undefined ? {} : { model: { provider: ref.provider, modelId: ref.modelId } };
}

/**
 * Pick the first ref in `chain` whose provider exists in `knownProviders`
 * (the provider names of the host's `Models` catalog). omp fallback chains
 * resolve the same way: first available wins, and an empty chain means the
 * caller keeps its current model.
 */
export function withRoleFallback(
  chain: readonly ModelRef[],
  knownProviders: ReadonlySet<string>,
): ModelRef | undefined {
  return chain.find((ref) => knownProviders.has(ref.provider));
}
