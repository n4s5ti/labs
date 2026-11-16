/// <reference types="@cloudflare/workers-types" />

/**
 * The cloud session host: one Durable Object per omp-durable session.
 *
 * `OmpSessionObject` is the unit that runs everywhere. It owns:
 * - durable state via `openOmpStorage(this.ctx.storage)` (DO SQLite);
 * - turn execution via the real omp `agentLoop` (`askOmp`), with tools
 *   against `drivers.sandboxFor()` and the model via
 *   `drivers.streamFnFor()` — both plain interfaces, so Cloudflare,
 *   miniflare, and (later) Rivet actors all host the same class;
 * - wake delivery (`alarm()` → `harness.wake()`), so parked work survives
 *   eviction, re-armed through `onWake` → `armAlarms()` on every open.
 *
 * `SessionDrivers` is the only platform seam: `entry.ts` binds the HTTP
 * sandbox + Anthropic transport, `test-entry.ts` binds scripted + in-memory
 * doubles. Nothing in this file imports `node:*`, `bun:*`, or omp's
 * local-only modules.
 */

import type { StreamFn } from "@oh-my-pi/pi-agent-core";
import { emptyModels } from "./pi-models.ts";
import type { SandboxApi } from "../src/sandbox.ts";
import { sandboxAgentTools } from "../src/omp-loop.ts";
import { OmpSession } from "../src/session.ts";
import { spawnOmp } from "../src/spawn-omp.ts";
import { approve, deny } from "../src/approvals.ts";
import { armAlarms, openOmpStorage } from "../src/storage/do.ts";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";

export type SessionDrivers = {
  /** Model transport for real turns (fetch-based in prod, scripted in tests). */
  readonly streamFnFor: (sessionId: string) => StreamFn;
  /** Tool backend for real turns (HTTP sandbox in prod, memory in tests). */
  readonly sandboxFor: (sessionId: string) => SandboxApi;
  readonly systemPrompt?: string[];
  readonly model?: string;
};

export class OmpSessionObject implements DurableObject {
  static drivers: SessionDrivers | undefined;

  private session: OmpSession | undefined;
  private readonly context = BACKGROUND_CONTEXT;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Record<string, unknown>,
  ) {}

  private drivers(): SessionDrivers {
    const drivers = OmpSessionObject.drivers;
    if (drivers === undefined) throw new Error("OmpSessionObject.drivers not bound (entry or test-entry must set it)");
    return drivers;
  }

  private async open(): Promise<OmpSession> {
    if (this.session !== undefined) return this.session;
    const storage = await openOmpStorage(
      (this.ctx as unknown as { storage: Parameters<typeof openOmpStorage>[0] }).storage,
    );
    const models = emptyModels();
    const session = await OmpSession.open(storage, {
      models,
      // No pi ExecutionEnv: the real loop's tools are omp AgentTools bound
      // directly to the SandboxApi (drivers.sandboxFor), never to api.env.
      env: () => undefined,
      context: this.context,
      onWake: (wake) => {
        void armAlarms(this.ctx.storage as unknown as Parameters<typeof armAlarms>[0], wake).catch((error) =>
          console.error("alarm arm failed", error),
        );
      },
    });
    this.session = session;
    return session;
  }

  private tools(sessionId: string) {
    return sandboxAgentTools(this.drivers().sandboxFor(sessionId));
  }

  private streamFn(sessionId: string): StreamFn {
    return this.drivers().streamFnFor(sessionId);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = this.ctx.id.toString();
    try {
      const session = await this.open();
      if (request.method === "POST" && url.pathname === "/ask") {
        const body = (await request.json()) as { prompt?: string };
        if (typeof body.prompt !== "string" || body.prompt === "") {
          return Response.json({ error: "prompt (string) is required" }, { status: 400 });
        }
        // DBG ask start
        const tools = this.tools(sessionId);
        // DBG tools
        const streamFn = this.streamFn(sessionId);
        // DBG streamFn
        const result = await session.askOmp(body.prompt, {
          tools,
          streamFn,
          ...(this.drivers().systemPrompt === undefined ? {} : { systemPrompt: this.drivers().systemPrompt }),
        });
        // DBG done
        return Response.json({
          messages: result.messages.length,
          events: result.events.map((event) => event.type),
          transcript: await session.transcript(),
        });
      }
      if (request.method === "GET" && url.pathname === "/transcript") {
        return Response.json(await session.transcript());
      }
      if (request.method === "GET" && url.pathname === "/usage") {
        return Response.json(await session.usage());
      }
      if (request.method === "POST" && (url.pathname === "/approve" || url.pathname === "/internal/approve")) {
        const body = (await request.json()) as { key?: string; approved?: boolean; note?: string };
        if (typeof body.key !== "string" || typeof body.approved !== "boolean") {
          return Response.json({ error: "key (string) and approved (boolean) are required" }, { status: 400 });
        }
        const done = body.approved
          ? await approve(session.harness, body.key, body.note, this.context)
          : await deny(session.harness, body.key, body.note, this.context);
        return Response.json({ decided: done });
      }
      if (request.method === "POST" && (url.pathname === "/subagent" || url.pathname === "/internal/subagent")) {
        const body = (await request.json()) as { input?: string; cwd?: string };
        if (typeof body.input !== "string" || body.input === "") {
          return Response.json({ error: "input (string) is required" }, { status: 400 });
        }
        const drivers = this.drivers();
        const result = await spawnOmp(
          session,
          body.input,
          {
            tools: this.tools(sessionId),
            streamFn: this.streamFn(sessionId),
            ...(drivers.systemPrompt === undefined ? {} : { systemPrompt: drivers.systemPrompt }),
          },
          { ...(body.cwd === undefined ? {} : { cwd: body.cwd }) },
        );
        return Response.json({ conversationId: String(result.conversationId), transcript: result.transcript });
      }
      if (request.method === "POST" && url.pathname === "/internal/register") {
        // Index role: this DO is addressed as "index" and tracks session ids for the cron sweep.
        const body = (await request.json()) as { sessionId?: string };
        if (typeof body.sessionId !== "string" || body.sessionId === "") {
          return Response.json({ error: "sessionId (string) is required" }, { status: 400 });
        }
        const known = ((await this.ctx.storage.get<string[]>("index-sessions")) ?? []) as string[];
        if (!known.includes(body.sessionId)) {
          known.push(body.sessionId);
          await this.ctx.storage.put("index-sessions", known);
        }
        return Response.json({ ok: true });
      }
      if (request.method === "GET" && url.pathname === "/internal/list") {
        return Response.json({ sessions: ((await this.ctx.storage.get<string[]>("index-sessions")) ?? []) as string[] });
      }
      if (request.method === "POST" && url.pathname === "/reset") {
        const body = (await request.json().catch(() => ({}))) as { handoff?: string };
        await session.reset(typeof body.handoff === "string" ? body.handoff : undefined);
        return Response.json({ ok: true });
      }
      if (request.method === "POST" && url.pathname === "/maintain") {
        session.resume();
        session.harness.wake();
        await session.waitForIdle();
        return Response.json({ ok: true });
      }
      return Response.json({ error: "not found" }, { status: 404 });
    } catch (error) {
      return Response.json(
        {
          error: String((error as Error)?.message ?? error).slice(0, 1000),
          stack: String((error as Error)?.stack ?? "").slice(0, 3000),
        },
        { status: 500 },
      );
    }
  }

  async alarm(): Promise<void> {
    const session = await this.open();
    session.resume();
    session.harness.wake();
    await session.waitForIdle().catch((error) => console.error("alarm drain failed", error));
  }
}
