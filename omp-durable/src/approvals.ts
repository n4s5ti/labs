/**
 * Human-in-the-loop approvals on the published pi-durable API.
 *
 * omp gates side effects behind approval checks (`tools/approval*`, ACP
 * permission gate, `beforeToolCall`). A cloud run cannot block on a local
 * keypress — and must not lose the pending decision on restart. The mapping:
 *
 * - `approvalGuard(tool)` wraps a tool: its first run commits a `pending`
 *   request to the session `ApprovalDoc` family, then waits (bounded,
 *   in-process polling) for a decision.
 * - `approve()` / `deny()` commit the decision to the same doc address via
 *   any `OmpSession` on the same storage — a UI, a webhook, or a second
 *   process. The waiting call wakes on its next poll and proceeds or
 *   returns `isError`.
 * - A crash loses nothing committed: the request and any decision survive
 *   in storage. A crash *before* the decision re-issues the request on
 *   recovery (safe direction); a decision that landed but was never read
 *   re-asks conservatively, keyed by call — never silently approved.
 *
 * Upgrade path: when pi-durable releases the suspendable task/signal API
 * (repo main: `ToolPark`, `defineSignal`, `Harness.signal`), this becomes a
 * true park — the doc addresses stay the same, so pending requests migrate.
 */

import type { Context } from "@earendil-works/chord/context";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { JsonValue } from "@earendil-works/chord/json";
import {
  defineDocFamily,
  wrapTool,
  type Harness,
  type ToolExecutionApi,
  type ToolRegistration,
  type Wrap,
} from "@earendil-works/pi-durable";

export type ApprovalStatus = "pending" | "approved" | "denied";

/** Durable approval record, one per guarded call. */
export type ApprovalRecord = {
  readonly tool: string;
  readonly args: JsonValue;
  readonly status: ApprovalStatus;
  readonly requestedAt: number;
  readonly decidedAt?: number;
  readonly note?: string;
};

type ApprovalSeed = { readonly tool: string; readonly args: JsonValue; readonly requestedAt: number };

export const ApprovalDoc = defineDocFamily<ApprovalRecord, ApprovalSeed>({
  kind: "omp/approval",
  version: 1,
  scope: "session",
  family: true,
  initial: (seed) => ({ tool: seed.tool, args: seed.args, status: "pending", requestedAt: seed.requestedAt }),
  checkpointWhen: () => true,
});

/** Doc key for one guarded call. */
export function approvalKey(callId: string): string {
  return `approval:${callId}`;
}

export type ApprovalGuardOptions = {
  /** Poll interval while waiting for a decision. Default 500ms. */
  readonly pollIntervalMs?: number;
  /** Give up waiting after this long and return a pending notice. Default 10min. */
  readonly timeoutMs?: number;
};

const DEFAULT_POLL_MS = 500;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted === true) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Wrap the named tool so every call commits an approval request and waits
 * for `approve()`/`deny()`. The wrapper never invents a decision: timeout
 * returns a model-visible "still pending" notice, and the model re-invokes.
 */
export function approvalGuard<Tool extends ToolRegistration>(
  tool: Tool,
  options: ApprovalGuardOptions = {},
): Wrap<Tool> {
  const pollMs = options.pollIntervalMs ?? DEFAULT_POLL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return wrapTool(tool, (base) => ({
    ...base,
    execute: async (args: never, api: ToolExecutionApi, context: Context) => {
      const key = approvalKey(api.callId);
      const seed: ApprovalSeed = { tool: base.name, args: args as unknown as JsonValue, requestedAt: api.now() };
      await api.commit(async (tx) => {
        const draft = await tx.doc(ApprovalDoc, key, seed);
        if (draft.status !== "pending") return;
        draft.tool = base.name;
      }, context);
      const deadline = api.now() + timeoutMs;
      const abort = context.abortSignal;
      for (;;) {
        const record = await api.snapshot(ApprovalDoc, key, context);
        if (record?.status === "approved") return base.execute(args, api, context);
        if (record?.status === "denied") {
          return {
            isError: true,
            output: [
              {
                type: "text",
                text: `denied by approver${record.note === undefined ? "" : `: ${record.note}`} (approval ${key})`,
              },
            ],
          };
        }
        if (api.now() >= deadline || abort?.aborted === true) {
          return {
            output: [
              {
                type: "text",
                text: `approval ${key} for ${base.name} is still pending. Re-invoke this tool to check again; do not repeat the side effect meanwhile.`,
              },
            ],
          };
        }
        await sleep(pollMs, abort);
      }
    },
  }));
}

/** Commit a decision for a pending approval. Creates nothing when absent. */
export async function decideApproval(
  harness: Harness,
  key: string,
  status: Exclude<ApprovalStatus, "pending">,
  note?: string,
  context: Context = BACKGROUND_CONTEXT,
): Promise<boolean> {
  return harness.commit(async (tx) => {
    const existing = await tx.doc(ApprovalDoc, key, { tool: "", args: null, requestedAt: 0 });
    if (existing.status !== "pending") return false;
    existing.status = status;
    existing.decidedAt = Date.now();
    if (note !== undefined) existing.note = note;
    return true;
  }, context);
}

export async function approve(harness: Harness, key: string, note?: string, context?: Context): Promise<boolean> {
  return decideApproval(harness, key, "approved", note, context);
}

export async function deny(harness: Harness, key: string, note?: string, context?: Context): Promise<boolean> {
  return decideApproval(harness, key, "denied", note, context);
}
