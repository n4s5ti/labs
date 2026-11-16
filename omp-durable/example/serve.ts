/**
 * omp-durable demo: a scripted agent run that never touches the network.
 *
 * Opens an `OmpSession` over local SQLite + a jailed `LocalSandboxApi`,
 * scripts the model with pi-ai's faux provider (write → read → bash, then
 * an approval-gated bash that the demo approves), prints the projected
 * transcript, and serves it on http://localhost:8150/ with a prompt box
 * for one live follow-up turn (served by the same scripted model).
 *
 * Run: `bun run example` inside `labs/omp-durable`.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { createRegistry, defineExtension, MemoryStorage } from "@earendil-works/pi-durable";
import {
  ApprovalDoc,
  approve,
  approvalGuard,
  createOmpTools,
  LocalSandboxApi,
  maybeCompact,
  OmpSession,
  renderTranscript,
  sandboxEnvFor,
  spawnSubagent,
} from "../src/index.ts";

const context = BACKGROUND_CONTEXT;
const root = mkdtempSync(join(tmpdir(), "omp-durable-demo-"));
const dbPath = join(root, "demo.sqlite");

const faux = fauxProvider();
const models = createModels();
models.setProvider(faux.provider);

const sandbox = new LocalSandboxApi(root);
const registry = createRegistry();
const tools = createOmpTools();
const bash = tools.find((tool) => tool.name === "bash");
if (bash === undefined) throw new Error("bash tool missing");
registry.install(
  defineExtension({ name: "demo", tools, wraps: [approvalGuard(bash, { timeoutMs: 60_000 })] }),
);

const { openLocalSqlite } = await import("../src/storage/do.ts");
const storage = await openLocalSqlite(dbPath);

const session = await OmpSession.open(storage, {
  models,
  registry,
  env: sandboxEnvFor(sandbox),
  agent: { model: { provider: "faux", modelId: "faux-1" }, cwd: "/", instructions: "You are a demo agent." },
  context,
});

faux.setResponses([
  fauxAssistantMessage([fauxToolCall("write", { path: "hello.txt", content: "durable agents" }, { id: "w1" })], {
    stopReason: "toolUse",
  }),
  fauxAssistantMessage([fauxToolCall("read", { path: "hello.txt" }, { id: "r1" })], { stopReason: "toolUse" }),
  fauxAssistantMessage([fauxToolCall("bash", { command: "cat hello.txt" }, { id: "b1" })], { stopReason: "toolUse" }),
  fauxAssistantMessage("file confirmed"),
]);

console.log("== turn 1: scripted tools ==");
const turn = await session.prompt("set up the demo file");
const decide = setInterval(() => {
  void (async () => {
    const pending = await session.harness.snapshot(ApprovalDoc, "approval:b1", context);
    if (pending?.status === "pending") {
      clearInterval(decide);
      await approve(session.harness, "approval:b1", "demo auto-approve");
    }
  })();
}, 100);
await session.waitForTurn(turn);
clearInterval(decide);

console.log("== turn 2: subagent ==");
faux.setResponses([fauxAssistantMessage("subagent reporting in")]);
const child = await spawnSubagent(session, "summarize the demo file");

console.log("== compaction check ==");
await maybeCompact(session);

const transcript = renderTranscript(await session.transcript());
console.log("---- transcript ----");
console.log(transcript);
console.log("--------------------");

const port = 8150;
Bun.serve({
  port,
  fetch: async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/transcript") {
      return Response.json(await session.transcript());
    }
    const page = [
      "<!doctype html><html><body><h1>omp-durable demo</h1>",
      '<pre id="t">loading…</pre>',
      "<script>",
      'fetch("/transcript").then(r=>r.json()).then(t=>{',
      "var lines=t.map(function(e){return e.kind===\"message\"?\"[\"+e.message.role+\"] \"+(e.message.text||\"\"):\"(\"+e.kind+\")\"});",
      'document.getElementById("t").textContent=lines.join("\\n")})',
      "</script></body></html>",
    ].join("");
    return new Response(page, { headers: { "content-type": "text/html" } });
  },
});
console.log(`serving transcript viewer on http://localhost:${port}/ (child: ${String(child.conversationId)})`);
