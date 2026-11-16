/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Worker front door for omp-durable sessions.
 *
 * - `fetch`: session REST API. Sessions are named Durable Objects
 *   (`SESSION_OBJECT.idFromName(sessionId)`), so any isolate routes to the
 *   right one; the transcript, tasks, and docs live in its SQLite.
 * - `queue`: approval decisions and subagent requests arrive here (webhooks
 *   and other workers enqueue; nothing blocks on a local keypress). Each
 *   message fans out to its session DO's internal route.
 * - `scheduled` (cron): poke every registered session's `/maintain`
 *   (drains wakes, re-arms alarms). Registration lives in the `index` DO.
 *
 * Porting note (Rivet or any actor platform): only this file and
 * `session-do.ts` touch Cloudflare APIs. The session logic, loop, tools,
 * and transports are platform-free — re-host by implementing `fetch`,
 * `queue`, `scheduled`, and `alarm` against the target actor SDK.
 */

import { HttpSandboxApi } from "./http-sandbox.ts";
import { anthropicStreamFn } from "./model-transport.ts";
import { OmpSessionObject, type SessionDrivers } from "./session-do.ts";

export { OmpSessionObject };

export type WorkerEnv = {
  SESSION_OBJECT: DurableObjectNamespace;
  APPROVALS: Queue;
  SUBAGENTS: Queue;
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL?: string;
  SANDBOX_URL: string;
  SANDBOX_TOKEN: string;
};

function prodDrivers(env: WorkerEnv): SessionDrivers {
  return {
    streamFnFor: () =>
      anthropicStreamFn({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
      }),
    sandboxFor: () => new HttpSandboxApi({ baseUrl: env.SANDBOX_URL, token: env.SANDBOX_TOKEN }, fetch),
  };
}

function stub(env: WorkerEnv, sessionId: string): DurableObjectStub {
  return env.SESSION_OBJECT.get(env.SESSION_OBJECT.idFromName(sessionId));
}

export type QueueMessageBody =
  | { readonly kind: "approval"; readonly sessionId: string; readonly key: string; readonly approved: boolean; readonly note?: string }
  | { readonly kind: "subagent"; readonly sessionId: string; readonly input: string; readonly cwd?: string };

/** Route one queue message to its session DO. Pure enough to unit-test with a stubbed env. */
export async function dispatchQueueMessage(env: WorkerEnv, message: QueueMessageBody): Promise<void> {
  if (message.kind === "approval") {
    await stub(env, message.sessionId).fetch("https://do/internal/approve", {
      method: "POST",
      body: JSON.stringify({ key: message.key, approved: message.approved, note: message.note }),
    });
    return;
  }
  await stub(env, message.sessionId).fetch("https://do/internal/subagent", {
    method: "POST",
    body: JSON.stringify({ input: message.input, cwd: message.cwd }),
  });
}

async function registerSession(env: WorkerEnv, sessionId: string): Promise<void> {
  const index = stub(env, "index");
  await index.fetch("https://do/internal/register", { method: "POST", body: JSON.stringify({ sessionId }) });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    OmpSessionObject.drivers ??= prodDrivers(env);
    const url = new URL(request.url);
    const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)(\/.*)$/);
    try {
      if (request.method === "POST" && url.pathname === "/sessions") {
        const body = (await request.json().catch(() => ({}))) as { id?: string };
        const sessionId = typeof body.id === "string" && body.id !== "" ? body.id : crypto.randomUUID();
        await registerSession(env, sessionId);
        return Response.json({ sessionId });
      }
      if (sessionMatch) {
        const [, sessionId, rest] = sessionMatch;
        if (request.method === "POST" && rest === "/ask") {
          const body = (await request.json()) as { prompt?: string };
          await registerSession(env, sessionId);
          return stub(env, sessionId).fetch(`https://do${rest}`, {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        return stub(env, sessionId).fetch(`https://do${rest}`, {
          method: request.method,
          body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
        });
      }
      if (request.method === "POST" && url.pathname === "/decide") {
        // Approval webhook: enqueue, don't block. The DO decides on delivery.
        const body = (await request.json()) as {
          sessionId?: string;
          key?: string;
          approved?: boolean;
          note?: string;
        };
        if (typeof body.sessionId !== "string" || typeof body.key !== "string" || typeof body.approved !== "boolean") {
          return Response.json({ error: "sessionId, key, approved are required" }, { status: 400 });
        }
        await env.APPROVALS.send({ kind: "approval", sessionId: body.sessionId, key: body.key, approved: body.approved, note: body.note });
        return Response.json({ queued: true });
      }
      if (request.method === "POST" && url.pathname === "/subagents") {
        const body = (await request.json()) as { sessionId?: string; input?: string; cwd?: string };
        if (typeof body.sessionId !== "string" || typeof body.input !== "string") {
          return Response.json({ error: "sessionId, input are required" }, { status: 400 });
        }
        await env.SUBAGENTS.send({ kind: "subagent", sessionId: body.sessionId, input: body.input, cwd: body.cwd });
        return Response.json({ queued: true });
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return Response.json({ ok: true });
      }
      return Response.json({ error: "not found" }, { status: 404 });
    } catch (error) {
      return Response.json({ error: String((error as Error)?.message ?? error).slice(0, 500), stack: String((error as Error)?.stack ?? "").slice(0, 3000) }, { status: 500 });
    }
  },

  async queue(batch: MessageBatch<QueueMessageBody>, env: WorkerEnv): Promise<void> {
    OmpSessionObject.drivers ??= prodDrivers(env);
    for (const message of batch.messages) {
      try {
        await dispatchQueueMessage(env, message.body);
      } catch (error) {
        message.retry();
        console.error("queue dispatch failed, retrying", error);
        return;
      }
    }
  },

  async scheduled(_event: ScheduledEvent, env: WorkerEnv): Promise<void> {
    OmpSessionObject.drivers ??= prodDrivers(env);
    // Cron sweep: every registered session drains wakes and re-arms alarms.
    const index = await stub(env, "index").fetch("https://do/internal/list").then((response) => response.json() as Promise<{ sessions: string[] }>);
    await Promise.all(
      index.sessions.map((sessionId) =>
        stub(env, sessionId)
          .fetch("https://do/maintain", { method: "POST" })
          .catch((error) => console.error(`maintain ${sessionId} failed`, error)),
      ),
    );
  },
};
