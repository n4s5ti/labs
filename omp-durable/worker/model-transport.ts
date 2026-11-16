/**
 * Fetch-based model transport for the worker: Anthropic Messages API over
 * SSE, shaped as an omp `StreamFn`.
 *
 * The loop calls `streamFn(model, context, options)` where `context` is the
 * provider context (`systemPrompt`, provider-ready `messages`, `tools`).
 * This transport converts that into one `POST /v1/messages` and replays the
 * SSE stream as `AssistantMessageEvent`s (`start` → block deltas → `done`),
 * exactly the contract `agentLoop()` consumes. Tool schemas convert from
 * omptype IR via `irToJsonSchema`.
 *
 * No SDK, no Node: `fetch` + `TextDecoder` only. A non-2xx response or a
 * truncated stream ends the message with `stopReason: "error"`, which the
 * loop surfaces through its normal retry path. Keys arrive via env
 * (`ANTHROPIC_API_KEY`), never in the bundle.
 */

import type { StreamFn } from "@oh-my-pi/pi-agent-core";
import type { AssistantMessage, Message, Tool } from "@oh-my-pi/pi-ai";
import { createAssistantMessageEventStream } from "@oh-my-pi/pi-ai/utils/event-stream";
import { irToJsonSchema } from "@oh-my-pi/omptype";

export type AnthropicTransportOptions = {
  readonly apiKey: string;
  readonly model: string;
  readonly maxTokens?: number;
  readonly baseUrl?: string;
  readonly version?: string;
};

type AnthropicBlock = { type: string; text?: string; id?: string; name?: string; input?: unknown };

function toAnthropicContent(content: unknown): AnthropicBlock[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [];
  const out: AnthropicBlock[] = [];
  for (const block of content as Record<string, unknown>[]) {
    if (block.type === "text" && typeof block.text === "string") out.push({ type: "text", text: block.text });
    else if (block.type === "image" && typeof block.data === "string") {
      out.push({
        type: "image",
        source: { type: "base64", media_type: (block.mimeType as string) ?? "image/png", data: block.data },
      } as unknown as AnthropicBlock);
    } else if (block.type === "toolCall") {
      out.push({
        type: "tool_use",
        id: String(block.id ?? ""),
        name: String(block.name ?? ""),
        input: (block.arguments as Record<string, unknown>) ?? {},
      });
    } else if (block.type === "toolResult") {
      out.push({
        type: "tool_result",
        tool_use_id: String((block as Record<string, unknown>).toolCallId ?? ""),
        content: typeof (block as Record<string, unknown>).content === "string" ? block.content : JSON.stringify(block.content ?? ""),
        is_error: (block as Record<string, unknown>).isError ?? undefined,
      } as unknown as AnthropicBlock);
    } else if (block.type === "thinking" && typeof block.thinking === "string") {
      out.push({ type: "text", text: block.thinking });
    }
  }
  return out;
}

function toAnthropicMessages(messages: readonly Message[]): { role: string; content: unknown }[] {
  const out: { role: string; content: unknown }[] = [];
  for (const raw of messages) {
    const message = raw as unknown as Record<string, unknown>;
    if (message.role === "user") out.push({ role: "user", content: toAnthropicContent(message.content) });
    else if (message.role === "assistant") out.push({ role: "assistant", content: toAnthropicContent(message.content) });
    else if (message.role === "toolResult") out.push({ role: "user", content: toAnthropicContent([message]) });
  }
  return out;
}

export function anthropicStreamFn(transport: AnthropicTransportOptions): StreamFn {
  const baseUrl = transport.baseUrl ?? "https://api.anthropic.com";
  const version = transport.version ?? "2023-06-01";
  const maxTokens = transport.maxTokens ?? 4096;
  return (async (model, context, options) => {
    const stream = createAssistantMessageEventStream();
    const partial = {
      role: "assistant",
      content: [],
      stopReason: "pending",
      api: "anthropic",
      provider: "anthropic",
      model: transport.model,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      timestamp: Date.now(),
    } as unknown as AssistantMessage;
    stream.push({ type: "start", partial: { ...partial } });

    const fail = (error: string): typeof stream => {
      const failed = { ...partial, stopReason: "error" } as AssistantMessage;
      stream.push({ type: "error", reason: "error", error: failed });
      stream.end(failed);
      void error;
      return stream;
    };

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": transport.apiKey,
          "anthropic-version": version,
        },
        body: JSON.stringify({
          model: transport.model,
          max_tokens: maxTokens,
          system: (context.systemPrompt ?? []).join("\n\n"),
          messages: toAnthropicMessages(context.messages),
          tools: (context.tools ?? []).map((tool: Tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: irToJsonSchema(tool.parameters as never),
          })),
        }),
        signal: (options as { signal?: AbortSignal } | undefined)?.signal,
      });
    } catch (error) {
      return fail(`transport error: ${(error as Error).message}`);
    }
    if (!response.ok || response.body === null) {
      return fail(`HTTP ${response.status}: ${(await response.text().catch(() => "")).slice(0, 500)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "";
    let blockIndex = -1;
    let inputTokens = 0;
    let outputTokens = 0;
    const toolInputs: string[] = [];

    const pushText = (delta: string): void => {
      const current = partial.content[blockIndex] as unknown as { type?: string; text: string } | undefined;
      if (current && current.type === "text") {
        current.text += delta;
        stream.push({ type: "text_delta", contentIndex: blockIndex, delta, partial: { ...partial } });
      }
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const data = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
            if (eventName === "message_start") {
              const usage = ((data.message as Record<string, unknown>).usage ?? {}) as Record<string, number>;
              inputTokens = usage.input_tokens ?? 0;
            } else if (eventName === "content_block_start") {
              blockIndex++;
              const block = data.content_block as Record<string, unknown>;
              if (block.type === "text") {
                (partial.content as unknown[]).push({ type: "text", text: "" });
                stream.push({ type: "text_start", contentIndex: blockIndex, partial: { ...partial } });
              } else if (block.type === "tool_use") {
                (partial.content as unknown[]).push({
                  type: "toolCall",
                  id: String(block.id ?? ""),
                  name: String(block.name ?? ""),
                  arguments: {},
                });
                toolInputs[blockIndex] = "";
                stream.push({ type: "toolcall_start", contentIndex: blockIndex, partial: { ...partial } });
              }
            } else if (eventName === "content_block_delta") {
              const delta = data.delta as Record<string, unknown>;
              if (delta.type === "text_delta" && typeof delta.text === "string") pushText(delta.text);
              else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
                toolInputs[blockIndex] = (toolInputs[blockIndex] ?? "") + (delta.partial_json as string);
                stream.push({
                  type: "toolcall_delta",
                  contentIndex: blockIndex,
                  delta: delta.partial_json as string,
                  partial: { ...partial },
                });
              }
            } else if (eventName === "content_block_stop") {
              const block = (partial.content as unknown as Record<string, unknown>[])[blockIndex];
              if (block?.type === "toolCall") {
                try {
                  (block as Record<string, unknown>).arguments = JSON.parse(toolInputs[blockIndex] || "{}");
                } catch {
                  (block as Record<string, unknown>).arguments = {};
                }
                stream.push({ type: "toolcall_end", contentIndex: blockIndex, toolCall: block as never, partial: { ...partial } });
              } else if (block?.type === "text") {
                stream.push({ type: "text_end", contentIndex: blockIndex, content: String(block.text ?? ""), partial: { ...partial } });
              }
            } else if (eventName === "message_delta") {
              const usage = (data.usage ?? {}) as Record<string, number>;
              outputTokens = usage.output_tokens ?? outputTokens;
              const stop = (data.delta as Record<string, unknown>)?.stop_reason as string | undefined;
              if (stop !== undefined) {
                (partial as { stopReason: string }).stopReason =
                  stop === "tool_use" ? "toolUse" : stop === "max_tokens" ? "length" : "stop";
              }
            }
          }
        }
      }
    } catch (error) {
      return fail(`stream error: ${(error as Error).message}`);
    }

    const usage = partial.usage as { input: number; output: number; totalTokens: number };
    usage.input = inputTokens;
    usage.output = outputTokens;
    usage.totalTokens = inputTokens + outputTokens;
    const finished = { ...partial, stopReason: (partial as { stopReason: string }).stopReason } as AssistantMessage;
    stream.push({ type: "done", reason: finished.stopReason as never, message: finished });
    stream.end(finished);
    void model;
    return stream;
  }) as StreamFn;
}
