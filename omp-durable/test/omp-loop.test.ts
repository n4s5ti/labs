/**
 * Proof that real omp code executes: `agentLoop()` from
 * `@oh-my-pi/pi-agent-core` drives these turns — scheduling, tool dispatch,
 * and the event lifecycle are omp's, not a re-implementation.
 */

import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type } from "@oh-my-pi/omptype";
import type { AgentTool } from "@oh-my-pi/pi-agent-core";
import { LocalSandboxApi } from "../src/local.ts";
import {
  ompMessagesToPi,
  runOmpTurn,
  sandboxAgentTools,
  scriptedModel,
  scriptedStreamFn,
} from "../src/index.ts";
import { openTestSession, type Rig } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

let rigs: Rig[] = [];
afterEach(async () => {
  for (const rig of rigs.splice(0)) {
    await rig.session.close();
    rig.cleanup();
  }
});

describe("real omp loop", () => {
  it("runs a turn with tool dispatch and the full event lifecycle", async () => {
    const executed: string[] = [];
    const echo = {
      name: "echo",
      label: "Echo",
      description: "Echo text back",
      parameters: type({ text: type("string") }),
      execute: async (_id: string, params: Record<string, unknown>) => {
        executed.push(params.text as string);
        return { content: [{ type: "text", text: `echo:${params.text}` }] };
      },
    } as unknown as AgentTool;

    const result = await runOmpTurn({
      prompt: "say it",
      tools: [echo],
      streamFn: scriptedStreamFn([
        { toolCalls: [{ name: "echo", args: { text: "real-loop" }, id: "c1" }] },
        { text: "done" },
      ]),
      model: scriptedModel(),
    });

    // The real loop executed the tool — this is omp's dispatch, not ours.
    expect(executed).toEqual(["real-loop"]);
    const kinds = result.events.map((event) => event.type);
    expect(kinds).toContain("tool_execution_start");
    expect(kinds).toContain("tool_execution_end");
    expect(kinds[kinds.length - 1]).toBe("agent_end");
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("runs sandbox tools through the real loop against a real sandbox", async () => {
    const root = mkdtempSync(join(tmpdir(), "omp-durable-realloop-"));
    dirs.push(root);
    const tools = sandboxAgentTools(new LocalSandboxApi(root));
    const result = await runOmpTurn({
      prompt: "write the file",
      tools,
      streamFn: scriptedStreamFn([
        { toolCalls: [{ name: "write", args: { path: "real.txt", content: "via omp loop" }, id: "w1" }] },
        { toolCalls: [{ name: "read", args: { path: "real.txt" }, id: "r1" }] },
        { text: "read it" },
      ]),
      model: scriptedModel(),
    });
    const kinds = result.events.map((event) => event.type);
    expect(kinds.filter((kind) => kind === "tool_execution_end").length).toBe(2);
    const pi = ompMessagesToPi(result.messages);
    const texts = pi
      .map((message) => JSON.stringify(message.content))
      .join("\n");
    expect(texts).toContain("via omp loop");
  });
});

describe("askOmp", () => {
  it("commits real-loop messages to the pi transcript", async () => {
    const rig = await openTestSession();
    rigs.push(rig);
    const { session } = rig;
    const root = mkdtempSync(join(tmpdir(), "omp-durable-askomp-"));
    dirs.push(root);
    const tools = sandboxAgentTools(new LocalSandboxApi(root));
    const events: string[] = [];
    session.on((event) => events.push(event.type));

    const result = await session.askOmp("do it for real", {
      tools,
      streamFn: scriptedStreamFn([
        { toolCalls: [{ name: "bash", args: { command: "echo ask-omp" }, id: "b1" }] },
        { text: "finished" },
      ]),
    });
    expect(result.events.map((event) => event.type)).toContain("tool_execution_end");

    const transcript = await session.transcript();
    const texts = transcript
      .filter((entry) => entry.kind === "message")
      .map((entry) => (entry.kind === "message" ? entry.message.text : ""))
      .join("\n");
    expect(texts).toContain("do it for real");
    expect(texts).toContain("ask-omp");
    expect(texts).toContain("finished");
    expect(events).toContain("message");
  });
});
