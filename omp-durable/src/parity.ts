/**
 * Full-session-parity matrix: every omp `AgentSession` capability, where it
 * lands in this adapter, and what is intentionally out of scope.
 *
 * Status key: `durable` (pi-durable is the system of record), `projected`
 * (behavior preserved, format differs), `sidecar` (runs next to the repo,
 * reached over RPC), `absent` (no cloud meaning; tracked, not hidden).
 */

export type ParityStatus = "durable" | "projected" | "sidecar" | "absent";

export type ParityRow = {
  readonly omp: string;
  readonly status: ParityStatus;
  readonly via: string;
  readonly notes: string;
};

export const PARITY: readonly ParityRow[] = [
  { omp: "prompt / steer / abort / resume / waitForIdle", status: "durable", via: "OmpSession → Conversation.submit/abort/waitForIdle", notes: "steer = whenBusy:'steer'; follow-ups queue by default" },
  { omp: "transcript (SessionEntry v3 JSONL)", status: "projected", via: "pi entries → projectTranscript()", notes: "pi entries are the record; projection covers message/usage/model-change/compaction/reset/custom" },
  { omp: "newSession / switchSession / fork / branch", status: "durable", via: "createConversation / conversation(id) / fork(at)", notes: "subagents use spawnChild (no handle switch)" },
  { omp: "reset / compaction (threshold/background/manual)", status: "durable", via: "Conversation.reset/compact + maybeCompact policy", notes: "summarizer model via pi compaction settings" },
  { omp: "task tool fan-out / worktree isolation / revive", status: "durable", via: "spawnSubagent child conversations + cwd scoping", notes: "parallel fan-out via joinSubagents; revive = reopen storage" },
  { omp: "approvals / ACP permission gate", status: "durable", via: "approvalGuard parks + omp/approval signal", notes: "decision survives restarts; UI lists parks from task state" },
  { omp: "Agent Hub steering / multi-turn supervision", status: "durable", via: "spawnDetached + prompt/steer/abort on child", notes: "" },
  { omp: "skills / slash-commands / custom tools", status: "durable", via: "skillExtension → Registry.install", notes: "" },
  { omp: "model roles + fallback chains (60+ providers)", status: "projected", via: "RoleModelMap + roleAgentChange over host Models", notes: "credentials/transport stay in host pi-ai Models" },
  { omp: "cost gate / prewalk / retry chains", status: "durable", via: "HarnessSettings (retry/compaction/toolExecution)", notes: "cost accounting via pi.usage; no separate gate type" },
  { omp: "events (AgentSessionEvent / AgentEvent)", status: "projected", via: "OmpSessionEvent: input_placed/message/turn_end/aborted/idled/switched", notes: "emitted from control flow + transcript diffs" },
  { omp: "usage / stats", status: "durable", via: "Harness.usage() (pi.usage docs)", notes: "" },
  { omp: "bash/read/write/edit/glob tool core", status: "durable", via: "createOmpTools() over ExecutionEnv", notes: "sandbox-backed in cloud, Node locally; replay-safe reads" },
  { omp: "MCP stdio servers", status: "sidecar", via: "registerRemoteTools() / sandbox service", notes: "cannot spawn in a worker" },
  { omp: "browser / computer / LSP / DAP / voice / PTY", status: "sidecar", via: "unportableTool() redirect → omp --mode rpc", notes: "explicit model-readable errors, never silent stubs" },
  { omp: "TUI / print / RPC / ACP delivery modes", status: "absent", via: "—", notes: "delivery is the host's job; this adapter is the runtime" },
  { omp: "--mode rpc host tools/URIs", status: "sidecar", via: "SandboxApi is the host-tool surface", notes: "same shape (host executes, agent asks), durable transport" },
];

export function parityCoverage(): { total: number; durable: number; projected: number; sidecar: number; absent: number } {
  const counts = { total: PARITY.length, durable: 0, projected: 0, sidecar: 0, absent: 0 };
  for (const row of PARITY) counts[row.status]++;
  return counts;
}
