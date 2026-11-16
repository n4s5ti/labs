/**
 * Real omp turn execution.
 *
 * This module drives the genuine oh-my-pi agent loop — `agentLoop()` from
 * `@oh-my-pi/pi-agent-core`, the same `runLoop` that powers omp's CLI,
 * RPC, and ACP modes — instead of re-implementing its scheduling. What is
 * real here:
 *
 * - turn-taking, tool-call dispatch (parallel/sequential), argument
 *   validation against `omptype` schemas, and the full `AgentEvent`
 *   lifecycle (`agent_start` → `turn_start` → `tool_execution_start/end` →
 *   `turn_end` → `agent_end`) all execute inside omp's code;
 * - `sandboxAgentTools()` expresses cloud-portable tools (bash/read/write/
 *   edit/list/glob) as real omp `AgentTool`s backed by a `SandboxApi`, so
 *   the loop validates, schedules, and reports them like any native tool;
 * - `scriptedStreamFn()` stands in for a model transport (tests/demo);
 *   production passes a `StreamFn` over a live provider transport.
 *
 * What stays pi-durable: every message the loop produces is committed to
 * pi entries by `OmpSession.askOmp()`, so the durable record, crash
 * recovery, approvals, and subagents keep working unchanged. The loop
 * itself runs wherever Bun loads (dev machine, repo-colocated container);
 * the durable state lives anywhere pi-durable runs (local SQLite,
 * Cloudflare DO).
 *
 * This module imports real omp code at runtime — `@oh-my-pi/pi-agent-core`
 * is a dependency, not a type mirror.
 */

import {
  agentLoop,
  type AgentContext,
  type AgentEvent,
  type AgentLoopConfig,
  type AgentMessage,
  type AgentTool,
  type StreamFn,
} from "@oh-my-pi/pi-agent-core";
import { createAssistantMessageEventStream } from "@oh-my-pi/pi-ai/utils/event-stream";
import { type } from "@oh-my-pi/omptype";
import type {
  AssistantMessage as OmpAssistantMessage,
  Message as OmpWireMessage,
} from "@oh-my-pi/pi-ai";
import type { Message as PiMessage } from "@earendil-works/pi-ai";
import type { SandboxApi } from "./sandbox.ts";

export type { AgentEvent, AgentMessage, AgentTool, StreamFn };

/** One scripted assistant step: text and/or tool calls the fake model emits. */
export type OmpScriptStep = {
  readonly text?: string;
  readonly toolCalls?: readonly { readonly name: string; readonly args: Record<string, unknown>; readonly id?: string }[];
};

const SPIKE_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

let scriptedCallId = 0;

/**
 * A `StreamFn` that replays scripted assistant messages — the model
 * transport stand-in for tests and the demo. Each step becomes one model
 * response; steps run out → the last step repeats.
 */
export function scriptedStreamFn(steps: readonly OmpScriptStep[]): StreamFn {
  let index = 0;
  return (async () => {
    const stream = createAssistantMessageEventStream();
    const step = steps[Math.min(index++, steps.length - 1)] ?? {};
    const content: OmpAssistantMessage["content"] = [];
    if (step.text !== undefined) content.push({ type: "text", text: step.text });
    for (const call of step.toolCalls ?? []) {
      content.push({
        type: "toolCall",
        id: call.id ?? `scripted-${++scriptedCallId}`,
        name: call.name,
        arguments: call.args,
      });
    }
    const stopReason = (step.toolCalls ?? []).length > 0 ? "toolUse" : "stop";
    const message = {
      role: "assistant",
      content,
      stopReason,
      api: "omp-durable-scripted",
      provider: "omp-durable-scripted",
      model: "scripted-1",
      usage: SPIKE_USAGE,
      timestamp: Date.now(),
    } as unknown as OmpAssistantMessage;
    stream.push({ type: "done", reason: stopReason, message });
    stream.end(message);
    return stream;
  }) as StreamFn;
}

/** Minimal model identity for loop runs (the transport owns the rest). */
export function scriptedModel(id = "scripted-1"): AgentLoopConfig["model"] {
  return { id, name: id, api: "omp-durable-scripted", provider: "omp-durable-scripted" } as AgentLoopConfig["model"];
}

/**
 * The cloud-portable tool surface as real omp `AgentTool`s. Same tools as
 * the pi-durable `createOmpTools()` set, same `SandboxApi` backend — but
 * scheduled, validated, and reported by omp's own loop instead of pi's
 * generation task. `execute` follows `AgentToolExecFn`: results are
 * `{ content, details?, isError? }`.
 */
export function sandboxAgentTools(sandbox: SandboxApi): AgentTool[] {
  const textResult = (text: string) => ({ content: [{ type: "text", text }] });
  const errorResult = (text: string) => ({ content: [{ type: "text", text }], isError: true });

  const bash: AgentTool = {
    name: "bash",
    label: "Bash",
    description: "Run a shell command in the conversation's sandbox. Returns exit code and output.",
    parameters: type({
      command: type("string").describe("Shell command to run."),
      "cwd?": type("string").describe("Working directory inside the sandbox."),
    }),
    execute: async (_id: string, params: Record<string, unknown>) => {
      const result = await sandbox.exec(params.command as string, { cwd: (params.cwd as string | undefined) ?? "/" });
      if (!result.ok) return errorResult(`exec failed: ${result.error.message}`);
      return textResult(`exit=${result.value.exitCode}\n${result.value.stdout}${result.value.stderr}`);
    },
  } as AgentTool;

  const read: AgentTool = {
    name: "read",
    label: "Read",
    description: "Read a text file from the sandbox.",
    parameters: type({ path: type("string").describe("Sandbox-absolute or cwd-relative file path.") }),
    execute: async (_id: string, params: Record<string, unknown>) => {
      const result = await sandbox.readText(params.path as string);
      if (!result.ok) return errorResult(`read ${params.path}: ${result.error.message}`);
      return textResult(result.value);
    },
  } as AgentTool;

  const write: AgentTool = {
    name: "write",
    label: "Write",
    description: "Create or overwrite a text file in the sandbox.",
    parameters: type({
      path: type("string").describe("Sandbox-absolute or cwd-relative file path."),
      content: type("string").describe("Full file content."),
    }),
    execute: async (_id: string, params: Record<string, unknown>) => {
      const path = params.path as string;
      const slash = path.lastIndexOf("/");
      if (slash > 0) await sandbox.mkdir(path.slice(0, slash), true);
      const result = await sandbox.writeFile(path, params.content as string);
      if (!result.ok) return errorResult(`write ${path}: ${result.error.message}`);
      return textResult(`wrote ${path}`);
    },
  } as AgentTool;

  const edit: AgentTool = {
    name: "edit",
    label: "Edit",
    description: "Replace exactly one occurrence of old_string with new_string.",
    parameters: type({
      path: type("string").describe("Sandbox file path."),
      old_string: type("string").describe("Exact text to replace (must occur exactly once)."),
      new_string: type("string").describe("Replacement text."),
    }),
    execute: async (_id: string, params: Record<string, unknown>) => {
      const path = params.path as string;
      const loaded = await sandbox.readText(path);
      if (!loaded.ok) return errorResult(`edit ${path}: ${loaded.error.message}`);
      const parts = loaded.value.split(params.old_string as string);
      if (parts.length - 1 !== 1) return errorResult(`edit ${path}: old_string must occur exactly once`);
      const result = await sandbox.writeFile(path, parts.join(params.new_string as string));
      if (!result.ok) return errorResult(`edit ${path}: ${result.error.message}`);
      return textResult(`edited ${path}`);
    },
  } as AgentTool;

  const list: AgentTool = {
    name: "list",
    label: "List",
    description: "List directory entries in the sandbox.",
    parameters: type({ "path?": type("string").describe("Directory to list; defaults to /.") }),
    execute: async (_id: string, params: Record<string, unknown>) => {
      const result = await sandbox.listDir((params.path as string | undefined) ?? "/");
      if (!result.ok) return errorResult(`list: ${result.error.message}`);
      return textResult(result.value.map((info) => (info.kind === "directory" ? `${info.name}/` : info.name)).join("\n"));
    },
  } as AgentTool;

  return [bash, read, write, edit, list];
}

export type OmpTurnOptions = {
  /** Prompt that starts the turn. */
  readonly prompt: string;
  /** Prior conversation, oldest first (usually projected from pi entries). */
  readonly history?: readonly AgentMessage[];
  /** Tools the loop may call. Default: none. */
  readonly tools?: readonly AgentTool[];
  /** Model transport. Default: scripted empty reply (ends immediately). */
  readonly streamFn?: StreamFn;
  readonly model?: AgentLoopConfig["model"];
  readonly systemPrompt?: string[];
  readonly signal?: AbortSignal;
};

export type OmpTurnResult = {
  /** Every message the loop appended (assistant turns + tool results). */
  readonly messages: AgentMessage[];
  /** The loop's own event lifecycle, in order. */
  readonly events: AgentEvent[];
};

/**
 * Run one real omp turn. `history` + the prompt seed the loop context; the
 * returned `messages` are what the loop appended and are committed to pi
 * entries by the caller (`OmpSession.askOmp()`).
 */
export async function runOmpTurn(options: OmpTurnOptions): Promise<OmpTurnResult> {
  const userMessage = { role: "user", content: options.prompt, timestamp: Date.now() };
  const context: AgentContext = {
    systemPrompt: options.systemPrompt ?? [],
    messages: [...(options.history ?? [])],
    tools: [...(options.tools ?? [])] as AgentTool[],
  };
  const config = {
    model: options.model ?? scriptedModel(),
    convertToLlm: (messages: AgentMessage[]) => messages as unknown as OmpWireMessage[],
  } as AgentLoopConfig;
  const stream = agentLoop(
    [userMessage] as AgentMessage[],
    context,
    config,
    options.signal,
    options.streamFn ?? scriptedStreamFn([{ text: "" }]),
  );
  const events: AgentEvent[] = [];
  let finalMessages: AgentMessage[] = [];
  for await (const event of stream) {
    events.push(event);
    if (event.type === "agent_end") finalMessages = event.messages.slice(context.messages.length + 1);
  }
  return { messages: finalMessages, events };
}

/**
 * Convert messages the real loop produced into pi-ai messages for entry
 * commit. Text, thinking, tool calls, and tool results map 1:1 (both stacks
 * share these block shapes); anything else becomes a text block carrying
 * its JSON, so nothing is silently dropped.
 */
export function ompMessagesToPi(messages: readonly AgentMessage[]): PiMessage[] {
  const out: PiMessage[] = [];
  for (const message of messages) {
    const role = (message as { role?: string }).role;
    const content = ((message as { content?: unknown }).content ?? []) as Record<string, unknown>[];
    if (role === "user") {
      out.push({ role: "user", content: textOf(content), timestamp: Date.now() } as PiMessage);
    } else if (role === "assistant") {
      out.push({
        role: "assistant",
        content: content.map((block) => {
          if (block.type === "text" || block.type === "thinking") return { type: block.type, ...(block as object) };
          if (block.type === "toolCall") {
            const call = block as { id?: string; name?: string; arguments?: unknown };
            return {
              type: "toolCall",
              id: String(call.id ?? ""),
              name: String(call.name ?? ""),
              arguments: (call.arguments ?? {}) as Record<string, unknown>,
            };
          }
          return { type: "text", text: JSON.stringify(block) };
        }),
        api: "omp",
        provider: "omp",
        model: "omp-loop",
        usage: zeroUsage(),
        stopReason: (message as { stopReason?: string }).stopReason === "toolUse" ? "toolUse" : "stop",
        timestamp: Date.now(),
      } as unknown as PiMessage);
    } else if (role === "toolResult") {
      const result = message as { toolCallId?: string; toolName?: string; content?: unknown; isError?: boolean };
      const blocks = Array.isArray(result.content) ? result.content : [];
      out.push({
        role: "toolResult",
        toolCallId: String(result.toolCallId ?? ""),
        toolName: String(result.toolName ?? ""),
        content: (blocks as Record<string, unknown>[]).map((block) =>
          block.type === "text" || block.type === "image" ? block : { type: "text", text: JSON.stringify(block) },
        ),
        isError: result.isError ?? false,
        timestamp: Date.now(),
      } as unknown as PiMessage);
    }
  }
  return out;
}

/** Reverse direction: pi transcript messages seed the real loop's history. */
export function piMessagesToOmp(messages: readonly PiMessage[]): AgentMessage[] {
  return messages.map((message) => {
    const anyMessage = message as unknown as Record<string, unknown>;
    if (message.role === "user") return { role: "user", content: textOf(message.content), timestamp: Date.now() };
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: (message.content as unknown[]).map((block) => ({ ...(block as object) })),
        api: "omp-durable-history",
        provider: "omp-durable-history",
        model: "history",
        usage: zeroUsage(),
        stopReason: (anyMessage.stopReason as string) ?? "stop",
        timestamp: Date.now(),
      };
    }
    return {
      role: "toolResult",
      toolCallId: (anyMessage.toolCallId as string) ?? "",
      toolName: (anyMessage.toolName as string) ?? "",
      content: (anyMessage.content as unknown[]) ?? [],
      isError: (anyMessage.isError as boolean) ?? false,
      timestamp: Date.now(),
    };
  }) as AgentMessage[];
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const item = block as { type?: string; text?: string; thinking?: string };
      if (item.type === "text") return item.text ?? "";
      if (item.type === "thinking") return item.thinking ?? "";
      return "";
    })
    .join("");
}

function zeroUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}
