/**
 * omp-durable: oh-my-pi harness features on pi-durable, runnable everywhere.
 *
 * Full session parity over durable execution: `OmpSession` mirrors omp's
 * `AgentSession` lifecycle, pi-durable owns the transcript/tasks/storage, and
 * the worker-side `SandboxApi` replaces every local-machine assumption.
 */

export { OmpSession, type OmpPromptOptions, type OmpSessionEvent, type OmpSessionListener, type OmpSessionOpenOptions } from "./session.ts";
export { projectTranscript, projectEntry, renderTranscript, type OmpTranscriptEntry, type OmpProjectedMessage } from "./entries.ts";
export { sandboxEnvFor } from "./sandbox.ts";
export { SandboxExecutionEnv, type SandboxApi, type SandboxExecOptions, type SandboxExecResult, type SandboxOutputChunk } from "./sandbox.ts";
export { LocalSandboxApi } from "./local.ts";
export { OMP_ROLES, isOmpRole, roleAgentChange, withRoleFallback, type OmpRole, type RoleModelMap } from "./models.ts";
export { createOmpTools, ompExtension, installOmpTools } from "./tools.ts";
export { spawnSubagent, spawnDetached, joinSubagents, type SubagentOptions, type SubagentResult } from "./subagents.ts";
export { ApprovalDoc, approvalKey, approvalGuard, decideApproval, approve, deny, type ApprovalRecord, type ApprovalStatus, type ApprovalGuardOptions } from "./approvals.ts";
export { maybeCompact, compactNow, transcriptLength, DEFAULT_COMPACTION_POLICY, type CompactionPolicy } from "./compaction.ts";
export { skillExtension, installSkills, unportableTool, registerRemoteTools, type SkillDefinition } from "./registry.ts";
export { PARITY, parityCoverage, type ParityRow, type ParityStatus } from "./parity.ts";
