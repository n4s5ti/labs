/**
 * Compaction parity.
 *
 * omp compacts past a threshold (`compaction-methods.ts`, `compact-modes.ts`:
 * threshold, background, and manual modes with title-fork/autolearn
 * follow-ups). pi-durable owns the mechanism (`CompactionTask`, per
 * conversation `compaction` settings, `Conversation.compact()`); this module
 * is the policy layer with omp's shape:
 *
 * - `CompactionPolicy`: threshold in transcript entries + optional
 *   instructions, mirroring omp's threshold/background split.
 * - `maybeCompact()`: check the live transcript length and trigger a manual
 *   compaction when over threshold. Call it after turns (or on `turn_end`).
 * - `compactNow()`: unconditional manual compaction.
 *
 * Model selection for the summary stays in pi-durable settings (`compaction`
 * overrides); role routing (`roleMap`, e.g. the `smol` role for summaries)
 * applies through `configure()` beforehand when the host wants it.
 */

import type { OmpSession } from "./session.ts";

export type CompactionPolicy = {
  /** Compact when the transcript exceeds this many entries. */
  readonly maxEntries: number;
  /** Instructions passed to the summarizer, if any. */
  readonly instructions?: string;
};

export const DEFAULT_COMPACTION_POLICY: CompactionPolicy = { maxEntries: 200 };

/** Entry count of the live transcript (oldest-first fetch, bounded). */
export async function transcriptLength(session: OmpSession): Promise<number> {
  return (await session.rawEntries()).length;
}

/**
 * Trigger `compact()` when the transcript exceeds `policy.maxEntries`.
 * Returns the compaction task id, or `undefined` when under threshold.
 */
export async function maybeCompact(session: OmpSession, policy: CompactionPolicy = DEFAULT_COMPACTION_POLICY): Promise<unknown> {
  if ((await transcriptLength(session)) <= policy.maxEntries) return undefined;
  return session.compact(policy.instructions);
}

/** Unconditional manual compaction. */
export async function compactNow(session: OmpSession, instructions?: string): Promise<unknown> {
  return session.compact(instructions);
}
