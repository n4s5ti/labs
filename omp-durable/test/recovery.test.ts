/** Crash recovery: close mid-life, reopen over the same storage, continue. */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { LocalSandboxApi } from "../src/local.ts";
import { sandboxEnvFor } from "../src/sandbox.ts";
import { OmpSession } from "../src/session.ts";
import { openLocalSqlite } from "../src/storage/local.ts";
import { context } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "omp-durable-recover-"));
  dirs.push(dir);
  return dir;
}

describe("recovery", () => {
  it("reattaches over SQLite and continues the transcript", async () => {
    const root = tempRoot();
    const dbPath = join(root, "session.sqlite");
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    const sandbox = new LocalSandboxApi(root);

    const storage = await openLocalSqlite(dbPath);
    const first = await OmpSession.open(storage, {
      models,
      env: sandboxEnvFor(sandbox),
      agent: { model: { provider: "faux", modelId: "faux-1" }, cwd: "/" },
      context,
    });
    faux.setResponses([fauxAssistantMessage("before crash")]);
    await first.ask("hello");
    const conversationId = first.id;
    const before = await first.transcript();
    await first.close();
    await storage.close(context);

    const reopened = await openLocalSqlite(dbPath);
    faux.setResponses([fauxAssistantMessage("after crash")]);
    const second = await OmpSession.attach(
      reopened,
      {
        models,
        env: sandboxEnvFor(sandbox),
        agent: { model: { provider: "faux", modelId: "faux-1" }, cwd: "/" },
        context,
      },
      conversationId,
    );
    const revived = await second.transcript();
    expect(revived.length).toBe(before.length);
    await second.ask("again");
    const after = await second.transcript();
    expect(after.length).toBeGreaterThan(revived.length);
    expect(
      after
        .filter((entry) => entry.kind === "message")
        .map((entry) => (entry.kind === "message" ? entry.message.text : "")),
    ).toContain("after crash");
    await second.close();
    await reopened.close(context);
  });

  it("a kill that strands storage replays from the last commit", async () => {
    const root = tempRoot();
    const dbPath = join(root, "kill.sqlite");
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    const sandbox = new LocalSandboxApi(root);
    const options = {
      models,
      env: sandboxEnvFor(sandbox),
      agent: { model: { provider: "faux" as const, modelId: "faux-1" }, cwd: "/" },
      context,
    };

    const inner = await openLocalSqlite(dbPath);
    let dead = false;
    const hanging = new Proxy(inner, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) =>
          dead ? new Promise(() => {}) : (value as (...callArgs: unknown[]) => unknown).apply(target, args);
      },
    });
    const session = await OmpSession.open(hanging, options);
    faux.setResponses([fauxAssistantMessage("survivor")]);
    await session.ask("commit me");
    const committed = await session.transcript();
    dead = true; // simulate the kill: nothing more lands on this handle

    const fresh = await openLocalSqlite(dbPath);
    faux.setResponses([fauxAssistantMessage("continued")]);
    const revived = await OmpSession.attach(fresh, options, session.id);
    const revivedTranscript = await revived.transcript();
    expect(revivedTranscript.length).toBe(committed.length);
    await revived.ask("continue");
    expect((await revived.transcript()).length).toBeGreaterThan(committed.length);
    await revived.close();
    await fresh.close(context);
    await inner.close(context).catch(() => {});
  });
});
