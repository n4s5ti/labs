/**
 * `spawnOmp`: durable subagents through the real omp loop.
 *
 * Same shape as `spawnSubagent` (child conversation, parent untouched,
 * persisted transcript), but the child runs `askOmp()` — the real
 * `agentLoop()` — instead of pi generation. The caller supplies the turn
 * drivers (tools + streamFn); durability comes from the shared storage.
 */

import type { AgentTool, StreamFn, AgentLoopConfig } from "@oh-my-pi/pi-agent-core";
import type { ConversationId } from "@earendil-works/pi-durable";
import type { OmpTranscriptEntry } from "./entries.ts";
import { projectTranscript } from "./entries.ts";
import type { OmpSession } from "./session.ts";
import { spawnDetached } from "./subagents.ts";

export type OmpRunDrivers = {
  readonly tools?: readonly AgentTool[];
  readonly streamFn?: StreamFn;
  readonly model?: AgentLoopConfig["model"];
  readonly systemPrompt?: string[];
};

export type OmpSubagentResult = {
  readonly conversationId: ConversationId;
  readonly transcript: OmpTranscriptEntry[];
};

/** Spawn a child session and run one real-loop turn in it. */
export async function spawnOmp(
  parent: OmpSession,
  input: string,
  run: OmpRunDrivers = {},
  options: { readonly cwd?: string; readonly requestId?: string } = {},
): Promise<OmpSubagentResult> {
  const { session: child } = await spawnDetached(parent, {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });
  await child.askOmp(input, run);
  return { conversationId: child.id, transcript: await child.transcript() };
}
