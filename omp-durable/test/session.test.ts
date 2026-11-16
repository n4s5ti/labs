/** Session lifecycle parity: prompt/steer, tools, fork, sessions, events. */

import { afterEach, describe, expect, it } from "bun:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { OmpSessionEvent } from "../src/index.ts";
import { openTestSession, type Rig } from "./helpers.ts";

let rigs: Rig[] = [];
afterEach(async () => {
  for (const rig of rigs) {
    await rig.session.close();
    rig.cleanup();
  }
  rigs = [];
});

async function open(): Promise<Rig> {
  const rig = await openTestSession();
  rigs.push(rig);
  return rig;
}

describe("prompt", () => {
  it("runs a text turn and projects the transcript", async () => {
    const { session, faux } = await open();
    faux.setResponses([fauxAssistantMessage("hello from the model")]);
    const events: OmpSessionEvent[] = [];
    session.on((event) => events.push(event));

    const settled = await session.ask("hi");
    expect(settled.status).toBe("done");

    const transcript = await session.transcript();
    const texts = transcript.map((entry) => (entry.kind === "message" ? entry.message.text : undefined));
    expect(texts).toContain("hi");
    expect(texts).toContain("hello from the model");
    expect(events.map((event) => event.type)).toContain("input_placed");
    expect(events.map((event) => event.type)).toContain("turn_end");
    expect(events.some((event) => event.type === "message")).toBe(true);
  });

  it("dedupes resubmissions by requestId", async () => {
    const { session, faux } = await open();
    faux.setResponses([fauxAssistantMessage("once")]);
    const first = await session.prompt("hi", { requestId: "req-1" });
    const second = await session.prompt("hi again", { requestId: "req-1" });
    expect(String(first.id)).toBe(String(second.id));
    await session.waitForTurn(first);
  });
});

describe("tools", () => {
  it("executes a bash tool call in the sandbox", async () => {
    const { session, faux } = await open();
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("bash", { command: "echo sandbox-hi" }, { id: "call-1" })], { stopReason: "toolUse" }),
      fauxAssistantMessage("done"),
    ]);
    const settled = await session.ask("run something");
    expect(settled.status).toBe("done");
    const transcript = await session.transcript();
    const results = transcript.filter(
      (entry) => entry.kind === "message" && entry.message.role === "tool-result",
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].kind === "message" && results[0].message.text).toContain("sandbox-hi");
  });

  it("reads and writes files round-trip through tools", async () => {
    const { session, faux } = await open();
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "note.txt", content: " durable " }, { id: "call-1" })], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxToolCall("read", { path: "note.txt" }, { id: "call-2" })], { stopReason: "toolUse" }),
      fauxAssistantMessage("read it"),
    ]);
    const settled = await session.ask("write then read");
    expect(settled.status).toBe("done");
    const transcript = await session.transcript();
    const texts = transcript
      .filter((entry) => entry.kind === "message")
      .map((entry) => (entry.kind === "message" ? entry.message.text : ""));
    expect(texts.join("\n")).toContain("durable");
  });
});

describe("fork and sessions", () => {
  it("forks history at an entry", async () => {
    const { session, faux } = await open();
    faux.setResponses([fauxAssistantMessage("first"), fauxAssistantMessage("second")]);
    await session.ask("one");
    const before = await session.rawEntries();
    await session.ask("two");
    const forked = await session.fork(before[before.length - 1].id);
    const forkedTexts = (await forked.transcript())
      .filter((entry) => entry.kind === "message")
      .map((entry) => (entry.kind === "message" ? entry.message.text : ""));
    expect(forkedTexts).toContain("first");
    expect(forkedTexts).not.toContain("second");
    await forked.close();
  });

  it("creates and switches sessions", async () => {
    const { session, faux } = await open();
    faux.setResponses([fauxAssistantMessage("a1"), fauxAssistantMessage("b1")]);
    await session.ask("in first");
    const firstId = session.id;
    const secondId = await session.newSession();
    expect(String(secondId)).not.toBe(String(firstId));
    await session.ask("in second");
    await session.switchSession(firstId);
    const transcript = await session.transcript();
    const texts = transcript
      .filter((entry) => entry.kind === "message")
      .map((entry) => (entry.kind === "message" ? entry.message.text : ""));
    expect(texts.join("\n")).toContain("in first");
    expect(texts.join("\n")).not.toContain("in second");
  });

  it("resets the context with a handoff", async () => {
    const { session, faux } = await open();
    faux.setResponses([fauxAssistantMessage("answering")]);
    await session.ask("before reset");
    await session.reset("fresh start");
    const transcript = await session.transcript();
    expect(transcript.some((entry) => entry.kind === "reset-boundary")).toBe(true);
  });
});
