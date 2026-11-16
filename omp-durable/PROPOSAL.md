# omp-durable: run omp harness features on pi-durable, everywhere

Proposal for approval. Nothing is built yet — this doc is the decision to react to.

## Goal

An adapter in `labs/omp-durable` that brings oh-my-pi (omp) harness features
onto `@earendil-works/pi-durable`, so omp-style agent runs gain durable
execution (crash-resume, atomic commits) and can run on cloud substrates
(Cloudflare Durable Objects, hosted Node + SQLite/KV) instead of only a local
dev machine.

Direction is fixed: **pi-durable is the host runtime, omp features are guests.**
pi-durable owns the transcript, tasks, and storage. omp is not pi-durable
first (own loop, own JSONL transcript, Bun-local assumptions throughout), so we
do not fork omp and do not embed its session — we project its features through
pi-durable's extension seams.

## What the scan found

**pi-durable** (`earendil-works/pi`, `packages/durable`, MIT, v1.5.2) is a
durable agent harness: conversations (immutable entries) + checkpointed tasks +
typed docs, committed atomically through one Session over a `Storage` backend.
`Harness.open(storage, options, context)` (`src/harness/harness.ts:615`) is the
entry point. Cloud-ready pieces already exist: `openDurableObjectSqliteStorage`
(`src/storage/sqlite/cloudflare.ts`), `onWake` alarm recipe, `StoreStorage`
for custom KV, `readOnly` viewers, `RemoteCodemodeSandbox`. Cloud blockers are
concentrated in `NodeExecutionEnv` (`node:child_process` spawn, `node:fs`,
`node:os`), the `bash` tool, `node:worker_threads` images, and `setTimeout`
timers — i.e. exactly the layer an `ExecutionEnv` adapter replaces.

**omp** (`can1357/oh-my-pi`, MIT, Bun+TS monorepo) is five layers, not one
loop: portable agent loop (`packages/agent/`: `agentLoop()`, steering queues),
local-heavy tool harness (`packages/coding-agent/src/tools/`: 31 built-ins,
persistent shell sessions, PTY, LSP/DAP, browser, computer, eval kernels),
session runtime (`session/agent-session.ts`: transcript, compaction, cost gate,
retry chains), delivery modes (TUI / `-p` print / RPC-over-stdio / ACP), and
fleet/sharing (collab relay, Agent Hub, metaharness). State persists as JSONL
`SessionEntry` streams via `SessionStorage` backends (file/SQL/redis), but
live turn state is in-process and recovery is rehydrate-and-retry. Local-only
assumptions: Bun runtime, `~/.omp/` + session-dir layout, `Bun.spawn`/PTY,
MCP-stdio children, Chromium/CDP, GUI/clipboard/voice hooks.

Cleanest omp seams, ranked: `sdk.ts:createAgentSession()` (in-process embed),
`Agent` + `agentLoop` (headless core, no session chrome), `--mode rpc`
(JSON-RPC over stdio + host tools/URIs + py/go/rust mirror SDKs — the only
cross-machine seam), `-p` print mode (one-shot, no steering).

## Recommended approach

**Tools-down, in three phases.** pi-durable keeps its loop (`pi.generation`
task), transcript, and durability; each omp capability lands on the
pi-durable seam that already means that thing:

| omp feature | pi-durable seam | Notes |
|---|---|---|
| bash/read/write/edit (+ persistent shells, Hashline anchors) | `defineExtension` / `defineTool`, executed through `HarnessOptions.env` (`ExecutionEnv`) | Local `NodeExecutionEnv` for dev; new `RemoteExecutionEnv` (ssh/worker-side exec + remote fs) for cloud. Single highest-leverage piece. |
| Model routing (roles, fallback chains, 60+ providers) | `models` / `settings` (function form) over pi-ai `Transport` | No omp model code is ported; routing policy is re-expressed. |
| Steering / follow-ups / abort | `Conversation.submit()` + `defineSignal` + `Submission` notify | Mid-turn steer maps to submissions; inbound webhooks map to signals. |
| `task` tool / subagents / worktree isolation | Child `defineTask` + `SubmissionSettled` signal | Durable subagents fall out of the task model; isolation via ExecutionEnv cwd roots. |
| Compaction, title fork, autolearn | `CompactionTask`, `conversationCreated` / `afterRun` hooks | Already first-class in pi-durable. |
| Approvals / permission gates | `beforeToolCall` hook + signal round-trip | Human-in-the-loop approval becomes a parked tool (`ToolPark.wait`) woken by signal — durable across restarts. |
| MCP servers, skills, custom tools | `Registry.install` / `wrapTool` / `registerTool`-equivalent | Cloud-safe tools injected; local-only ones shadowed. |
| Browser / computer / LSP / DAP / voice | **RPC sidecar escape hatch**: `omp --mode rpc` colocated with the repo, driven from a pi-durable tool via host tools/URIs | These cannot be durable or remote; isolate, don't port. |
| omp JSONL transcript / `SessionStorage` | **Not reused.** pi entries are the single source of truth | Dual transcripts caused every dual-write hazard; one-line migration (export → import) covers history. |

Rejected: (a) embedding `AgentSession` in-process — dual source of truth,
in-process turn state, recovery by re-prompt (expensive, nondeterministic);
(b) forking omp — permanent maintenance burden against a fast-moving repo;
(c) RPC-only driver — sidecar lifecycle ops before any value is proven.

Both repos are MIT, so the adapter takes both as versioned dependencies —
no vendoring.

## Work plan (after approval)

1. **Scaffold** `labs/omp-durable` per labs conventions (`bun install`,
   `example`, `typecheck`, `test`, `build`), pinned `pi-durable` + omp dep.
2. **Phase 1 — tools-down v1:** `defineExtension` wrapping a curated omp tool
   subset (bash/read/write/edit/glob/grep first); `RemoteExecutionEnv` design
   (transport TBD in Q2); model-routing options; headless example run on local
   SQLite.
3. **Phase 2 — loop behaviors:** steering/submissions/signals, child-task
   subagents, approvals-as-parked-tools, compaction wiring.
4. **Phase 3 — cloud:** DO SQLite storage path + `onWake` alarms, remote-exec
   backend, kill-mid-run recovery demo, RPC-sidecar hatch for one local-only
   tool (browser or LSP) as proof.
5. Each phase: fail-before test, docs + changelog fragment, green CI.

Non-goals: TUI delivery, omp session-format compatibility, Windows/voice/GUI
tools, forking either upstream.

## Validation

- pi-durable's own `createStorageConformance` / `createEnvConformance` suites
  against every new backend/env.
- Crash-recovery probe: kill worker mid-tool-execution, reopen Harness, assert
  resume from last commit with no duplicate side effects.
- Cloud smoke: same example conversation runs unmodified on local SQLite and
  on the DO target.
- Highest-risk check: pi-durable (+ chord SQLite) under the Bun runtime;
  if it fails, workers run Node and Bun hosts only the RPC sidecar.

## Risks

- omp tools assume Bun/Node locals (`Bun.spawn`, PTY, `~/.omp`); each ported
  tool needs a cloud story or sidecar exile — scope creep is the main risk,
  contained by the curated-subset rule.
- omp moves fast; pin versions, port behind our interfaces, never patch
  upstream behavior in the adapter.
- Model-call determinism on replay: tool `replay` hooks must be supplied for
  every ported tool or crash-recovery re-executes side effects.

## Open questions (need your call)

1. **v1 scope:** (a) tools-down only [recommended] / (b) + loop behaviors /
   (c) full session parity.
2. **Cloud target:** (a) Cloudflare DO [recommended — binding already exists]
   / (b) hosted Node + SQLite file / (c) both.
3. **Remote exec transport:** (a) worker-side sandbox API / (b) ssh to repo box
   / (c) defer to Phase 3 [recommended].
