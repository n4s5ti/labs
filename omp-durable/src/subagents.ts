/**
 * Durable subagents: omp `task`-tool parity.
 *
 * omp fans work out through its `task` tool: parallel/sequential fan-out,
 * worktree isolation, persisted revive, Agent Hub steering. Here a subagent
 * is a **child conversation** of the parent session:
 *
 * - durable by construction (prompts, tool calls, and answers commit to the
 *   same `Storage`; a crash mid-subagent resumes from the last commit),
 * - isolated by `cwd` scoping (`agent.cwd` per child, mirroring worktree
 *   isolation roots at the `ExecutionEnv` level),
 * - observable: the parent reads the child's projected transcript, and the
 *   child's conversation id attributes every entry (`byTaskId`-style
 *   attribution falls out of the conversation record).
 *
 * The parent drives the child inline (prompt → `waitForTurn`) for the
 * sequential case, or holds the `Submission` for parallel fan-out and awaits
 * them together — no nested-call key bookkeeping required.
 */

import type { Context } from "@earendil-works/chord/context";
import type {
  AgentChange,
  ConversationId,
  SettledSubmissionRecord,
  UsageState,
} from "@earendil-works/pi-durable";
import { projectTranscript, type OmpTranscriptEntry } from "./entries.ts";
import type { OmpSession } from "./session.ts";

export type SubagentOptions = {
  /** Isolation root for the child (mirrors omp worktree isolation). */
  readonly cwd?: string;
  /** Model override for the child run. */
  readonly agent?: AgentChange;
  /** Deduplicates retried spawns of the same intent. */
  readonly requestId?: string;
};

export type SubagentResult = {
  readonly conversationId: ConversationId;
  readonly transcript: OmpTranscriptEntry[];
  readonly settled: SettledSubmissionRecord;
  readonly usage: UsageState;
};

/**
 * Spawn one subagent: fork a child conversation, prompt it, wait for its
 * answer, and return the projected transcript plus settlement. The child
 * conversation persists in storage — re-inspectable long after the parent
 * run ends (omp's persisted-revive equivalent).
 */
export async function spawnSubagent(
  parent: OmpSession,
  input: string,
  options: SubagentOptions = {},
  context?: Context,
): Promise<SubagentResult> {
  const child = await spawnDetached(parent, options);
  const settled = await child.session.ask(input, options.requestId === undefined ? {} : { requestId: options.requestId });
  void context;
  return collectResult(child.session, settled);
}

/**
 * Start a subagent conversation without prompting yet: returns the child
 * session for steering (`prompt`/`steer`/`abort`) across multiple turns,
 * e.g. Agent Hub-style supervision. The parent handle is untouched.
 */
export async function spawnDetached(
  parent: OmpSession,
  options: SubagentOptions = {},
): Promise<{ readonly session: OmpSession; readonly conversationId: ConversationId }> {
  // Inherit the parent agent (model, instructions); options layer on top.
  // Without this a child created with only `cwd` would lose the model ref
  // and its runs would settle `unanswered`.
  const base = parent.defaultAgent ?? options.agent;
  const agent: AgentChange | undefined =
    options.cwd === undefined && options.agent === undefined
      ? base
      : { ...base, ...options.agent, ...(options.cwd === undefined ? {} : { cwd: options.cwd }) };
  const child = await parent.spawnChild(agent);
  return { session: child, conversationId: child.id };
}

async function collectResult(session: OmpSession, settled: SettledSubmissionRecord): Promise<SubagentResult> {
  const raw = await session.rawEntries();
  return {
    conversationId: session.id,
    transcript: projectTranscript(raw),
    settled,
    usage: await session.usage(),
  };
}

/**
 * Await several in-flight subagent turns together (parallel fan-out).
 * Each entry is `{ session, submission }` from `session.prompt()` calls.
 */
export async function joinSubagents(
  turns: readonly { readonly session: OmpSession; readonly submission: import("@earendil-works/pi-durable").Submission }[],
): Promise<SubagentResult[]> {
  return Promise.all(
    turns.map(async ({ session, submission }) => collectResult(session, await session.waitForTurn(submission))),
  );
}
