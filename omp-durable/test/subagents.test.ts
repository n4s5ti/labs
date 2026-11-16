/** Subagents: child conversations, fan-out, parent isolation. */

import { afterEach, describe, expect, it } from "bun:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { joinSubagents, spawnDetached, spawnSubagent } from "../src/index.ts";
import { openTestSession } from "./helpers.ts";
import type { Rig } from "./helpers.ts";

let rigs: Rig[] = [];
afterEach(async () => {
  for (const rig of rigs) {
    await rig.session.close();
    rig.cleanup();
  }
  rigs = [];
});

describe("subagents", () => {
  it("spawns a child that answers independently", async () => {
    const rig = await openTestSession();
    rigs.push(rig);
    const { session, faux } = rig;
    faux.setResponses([fauxAssistantMessage("child answer")]);
    const result = await spawnSubagent(session, "do the thing");
    expect(String(result.conversationId)).not.toBe(String(session.id));
    const texts = result.transcript
      .filter((entry) => entry.kind === "message")
      .map((entry) => (entry.kind === "message" ? entry.message.text : ""));
    expect(texts).toContain("do the thing");
    expect(texts).toContain("child answer");
    // Parent handle is untouched: its transcript has no child content.
    const parentTexts = (await session.transcript())
      .filter((entry) => entry.kind === "message")
      .map((entry) => (entry.kind === "message" ? entry.message.text : ""));
    expect(parentTexts.join("\n")).not.toContain("child answer");
  });

  it("fans out in parallel and joins", async () => {
    const rig = await openTestSession();
    rigs.push(rig);
    const { session, faux } = rig;
    faux.setResponses([fauxAssistantMessage("one"), fauxAssistantMessage("two")]);
    const first = await spawnDetached(session);
    const second = await spawnDetached(session);
    const submissionA = await first.session.prompt("task a");
    const submissionB = await second.session.prompt("task b");
    const [resultA, resultB] = await joinSubagents([
      { session: first.session, submission: submissionA },
      { session: second.session, submission: submissionB },
    ]);
    expect(resultA.settled.status).toBe("done");
    expect(resultB.settled.status).toBe("done");
    expect(resultA.conversationId).not.toBe(resultB.conversationId);
  });
});
