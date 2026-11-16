/** Approvals: guarded tools wait until approve()/deny() decides. */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { createRegistry, defineExtension, MemoryStorage } from "@earendil-works/pi-durable";
import { LocalSandboxApi } from "../src/local.ts";
import { sandboxEnvFor } from "../src/sandbox.ts";
import { OmpSession } from "../src/session.ts";
import { ApprovalDoc, approvalGuard, approve, deny } from "../src/index.ts";
import { createOmpTools } from "../src/index.ts";
import { context } from "./helpers.ts";

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function openGuarded() {
  const root = mkdtempSync(join(tmpdir(), "omp-durable-approval-"));
  dirs.push(root);
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const sandbox = new LocalSandboxApi(root);
  const registry = createRegistry();
  const tools = createOmpTools();
  const bash = tools.find((tool) => tool.name === "bash");
  if (bash === undefined) throw new Error("bash tool missing");
  registry.install(
    defineExtension({ name: "omp-guarded", tools, wraps: [approvalGuard(bash)] }),
  );
  const session = await OmpSession.open(new MemoryStorage(), {
    models,
    registry,
    env: sandboxEnvFor(sandbox),
    agent: { model: { provider: "faux", modelId: "faux-1" }, cwd: "/" },
    context,
  });
  return { session, faux, root };
}

/** Approve/deny the first pending request for `callId`, then stop polling. */
function decideOnPark(
  session: OmpSession,
  callId: string,
  decide: (key: string) => Promise<unknown>,
): () => void {
  const timer = setInterval(() => {
    void (async () => {
      const key = `approval:${callId}`;
      const doc = await session.harness.snapshot(ApprovalDoc, key, context);
      if (doc?.status === "pending") {
        clearInterval(timer);
        await decide(key);
      }
    })();
  }, 100);
  return () => clearInterval(timer);
}

describe("approvals", () => {
  it("blocks until approve() then executes", async () => {
    const { session, faux } = await openGuarded();
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("bash", { command: "echo approved-run" }, { id: "call-1" })], { stopReason: "toolUse" }),
      fauxAssistantMessage("done"),
    ]);
    const submission = await session.prompt("run it");
    const stop = decideOnPark(session, "call-1", (key) => approve(session.harness, key, "test approval"));
    const settled = await session.waitForTurn(submission);
    stop();
    expect(settled.status).toBe("done");
    const texts = (await session.transcript())
      .filter((entry) => entry.kind === "message")
      .map((entry) => (entry.kind === "message" ? entry.message.text : ""))
      .join("\n");
    expect(texts).toContain("approved-run");
    await session.close();
  });

  it("deny() turns the call into an error", async () => {
    const { session, faux } = await openGuarded();
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("bash", { command: "echo never" }, { id: "call-9" })], { stopReason: "toolUse" }),
      fauxAssistantMessage("understood"),
    ]);
    const submission = await session.prompt("run it");
    const stop = decideOnPark(session, "call-9", (key) => deny(session.harness, key, "test denial"));
    const settled = await session.waitForTurn(submission);
    stop();
    expect(settled.status).toBe("done");
    const texts = (await session.transcript())
      .filter((entry) => entry.kind === "message")
      .map((entry) => (entry.kind === "message" ? entry.message.text : ""))
      .join("\n");
    expect(texts).toContain("denied by approver");
    expect(texts).not.toContain("never");
    await session.close();
  });
});
