/**
 * Worker tests: the real omp loop running inside workerd.
 *
 * Builds `worker/dist/test-worker.js` (miniflare, no network, no keys) and
 * drives the full cloud path over HTTP: session create → `ask` through the
 * real `agentLoop()` → durable transcript → subagents → queue routing.
 * Queues themselves are unit-tested with a stub env (no broker needed).
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { dispatchQueueMessage } from "../worker/entry.ts";

const ROOT = new URL("..", import.meta.url).pathname;

let mf: Miniflare;

beforeAll(async () => {
  const built = spawnSync("bun", ["worker/build.ts"], { cwd: ROOT, encoding: "utf8" });
  if (built.status !== 0) throw new Error(`worker build failed:\n${built.stdout}\n${built.stderr}`);
  mf = new Miniflare({
    modules: true,
    script: readFileSync(join(ROOT, "worker/dist/test-worker.js"), "utf8"),
    compatibilityDate: "2025-08-01",
    compatibilityFlags: ["nodejs_compat"],
    durableObjects: { SESSION_OBJECT: { className: "OmpSessionObject", useSQLite: true } },
  });
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
});

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const response = await mf.dispatchFetch(
    `https://worker${path}`,
    {
      headers: { "content-type": "application/json" },
      ...init,
    } as Parameters<typeof mf.dispatchFetch>[1],
  );
  return { status: response.status, body: await response.json().catch(() => null) };
}

describe("worker session", () => {
  it("creates a session and runs a real-loop turn with tools", async () => {
    const created = await api("/sessions", { method: "POST", body: "{}" });
    expect(created.status).toBe(200);
    const sessionId = created.body.sessionId as string;
    expect(typeof sessionId).toBe("string");

    const asked = await api(`/sessions/${sessionId}/ask`, {
      method: "POST",
      body: JSON.stringify({ prompt: "write the file" }),
    });
    expect(asked.status).toBe(200);
    expect(asked.body.events).toContain("tool_execution_start");
    expect(asked.body.events).toContain("tool_execution_end");
    expect(asked.body.events[asked.body.events.length - 1]).toBe("agent_end");

    const transcript = await api(`/sessions/${sessionId}/transcript`);
    expect(transcript.status).toBe(200);
    const texts = (transcript.body as unknown[])
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    expect(texts).toContain("worker real loop");
    expect(texts).toContain("confirmed from the isolate");
  }, 60_000);

  it("spawns a subagent session and resets", async () => {
    const created = await api("/sessions", { method: "POST", body: "{}" });
    const sessionId = created.body.sessionId as string;
    const sub = await api(`/sessions/${sessionId}/subagent`, {
      method: "POST",
      body: JSON.stringify({ input: "child reporting" }),
    });
    expect(sub.status).toBe(200);
    expect(String(sub.body.conversationId)).not.toBe("");

    const reset = await api(`/sessions/${sessionId}/reset`, {
      method: "POST",
      body: JSON.stringify({ handoff: "fresh" }),
    });
    expect(reset.status).toBe(200);
    const transcript = await api(`/sessions/${sessionId}/transcript`);
    expect(JSON.stringify(transcript.body)).toContain("reset-boundary");
  }, 60_000);
});

describe("queue routing", () => {
  it("routes approval and subagent messages to the session DO", async () => {
    const calls: { url: string; init: unknown }[] = [];
    const stub = { fetch: (url: string, init: unknown) => (calls.push({ url, init }), Promise.resolve(new Response("{}"))) };
    const env = { SESSION_OBJECT: { idFromName: (_id: string) => ({}) as never, get: (_id: unknown) => stub } };
    await dispatchQueueMessage(env as never, { kind: "approval", sessionId: "s1", key: "k", approved: true });
    await dispatchQueueMessage(env as never, { kind: "subagent", sessionId: "s1", input: "go" });
    expect(calls.map((call) => call.url)).toEqual([
      "https://do/internal/approve",
      "https://do/internal/subagent",
    ]);
  });
});
