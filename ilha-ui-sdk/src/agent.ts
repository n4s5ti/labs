// Agent tools (port of `@ui-sdk/solid`'s `agent`: a pure re-export of
// `@ui-sdk/core/agent`, with no reactivity to bind).
export {
  agentTools,
  createAgent,
  registerTools,
} from "@ui-sdk/core/agent";
export type {
  AgentAction,
  AgentChange,
  AgentComponent,
  AgentStep,
  ObservedChange,
} from "@ui-sdk/core/agent";
