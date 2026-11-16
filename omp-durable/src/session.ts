/**
 * `OmpSession`: omp `AgentSession`-parity lifecycle over pi-durable.
 *
 * omp's `AgentSession` (`packages/coding-agent/src/session/agent-session.ts`)
 * owns the transcript, drives turns, and exposes `prompt / steer / abort /
 * resume / waitForIdle / newSession / switchSession / fork` plus an event
 * subscription. `OmpSession` exposes the same surface, but every state
 * change commits through the pi-durable `Harness`:
 *
 * - session identity → pi conversation (`harness.root` by default)
 * - `prompt` → `Conversation.submit({ type: "input" })`
 * - `steer` → submit with `whenBusy: "steer"` (interrupts the live turn)
 * - follow-up queue → submit with `whenBusy: "followUp"` (the default)
 * - `fork` → `Conversation.fork(at)`
 * - `newSession`/`switchSession` → `createConversation`/`conversation(id)`
 * - `reset`/`compact` → the pi builtins of the same name
 * - crash recovery → `OmpSession.attach()`: reopen the Harness over the same
 *   `Storage` and rebind; unanswered work resumes from the last commit.
 *
 * Events are emitted from this class's own control flow (`input_placed`,
 * `turn_end`, `aborted`, `idled`) plus transcript diffs (`message`) computed
 * from entry fetches around each settled turn.
 *
 * Two turn engines: `ask()` runs pi-durable's own generation task
 * (fully-durable replay); `askOmp()` runs the real omp `agentLoop()` from
 * `@oh-my-pi/pi-agent-core` and commits its messages. Both write the same
 * pi transcript.
 */

import type { Context } from "@earendil-works/chord/context";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type {
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  AgentTool,
  StreamFn,
} from "@oh-my-pi/pi-agent-core";
import type { Message as PiMessage, UserMessage as PiUserMessage } from "@earendil-works/pi-ai";
import {
  createRegistry,
  Harness,
  type AgentChange,
  type Conversation,
  type ConversationId,
  type EntryId,
  type EntryRecord,
  type HarnessOptions,
  type HarnessSettings,
  type ModelRef,
  type Registry,
  type SettledSubmissionRecord,
  type Storage,
  type Submission,
  type UsageState,
} from "@earendil-works/pi-durable";
import { projectTranscript, type OmpTranscriptEntry } from "./entries.ts";
import { roleAgentChange, type OmpRole, type RoleModelMap } from "./models.ts";
import { installOmpTools } from "./tools.ts";

export type OmpPromptOptions = {
  /** Deduplicates resubmissions of the same intent (`Submission.requestId`). */
  readonly requestId?: string;
  /**
   * - `"followUp"` (default): queue behind the live turn, like omp's
   *   follow-up queue.
   * - `"steer"`: interrupt the live turn and answer this first.
   * - `"reject"`: refuse while busy (`ConversationBusy`).
   */
  readonly whenBusy?: "steer" | "followUp" | "reject";
  /** Override the conversation model for the prompted run. */
  readonly model?: ModelRef;
  /** Resolve the model through a role map instead (`roleAgentChange`). */
  readonly role?: OmpRole;
  /** Role bindings used when `role` is set. */
  readonly roleMap?: RoleModelMap;
};

export type OmpSessionEvent =
  | { readonly type: "input_placed"; readonly submissionId: string }
  | { readonly type: "message"; readonly entry: OmpTranscriptEntry }
  | { readonly type: "turn_end"; readonly submission: SettledSubmissionRecord }
  | { readonly type: "aborted" }
  | { readonly type: "idled" }
  | { readonly type: "switched"; readonly conversationId: string };

export type OmpSessionListener = (event: OmpSessionEvent) => void;

export type OmpSessionOpenOptions = {
  /** pi-ai `Models` (or provider); the host's catalog and credentials. */
  readonly models: HarnessOptions["models"];
  /** Wake hook: called after open and whenever `wake()` changes (alarm arming on the host). */
  readonly onWake?: HarnessOptions["onWake"];
  /** Registry to use; defaults to a fresh one with the omp tools installed. */
  readonly registry?: Registry;
  /** Conversation environment (`SandboxExecutionEnv` in cloud, `NodeExecutionEnv` in dev). */
  readonly env?: HarnessOptions["env"];
  readonly settings?: HarnessSettings;
  readonly roleMap?: RoleModelMap;
  /** Agent for the root conversation (default model, cwd, instructions...). */
  readonly agent?: AgentChange;
  readonly context?: Context;
};

export class OmpSession {
  private readonly listeners = new Set<OmpSessionListener>();
  private context: Context;

  private constructor(
    readonly harness: Harness,
    private conversation: Conversation,
    private readonly roleMap: RoleModelMap | undefined,
    context: Context,
    private readonly createdAgent: AgentChange | undefined,
  ) {
    this.context = context;
  }

  /** Open a session: Harness over `storage`, omp tools installed, root bound. */
  static async open(storage: Storage, options: OmpSessionOpenOptions): Promise<OmpSession> {
    const context = options.context ?? BACKGROUND_CONTEXT;
    const registry = options.registry ?? createRegistry();
    if (options.registry === undefined) installOmpTools(registry);
    const harness = await Harness.open(
      storage,
      {
        models: options.models,
        registry,
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.settings === undefined ? {} : { settings: options.settings }),
        ...(options.onWake === undefined ? {} : { onWake: options.onWake }),
        now: () => Date.now(),
      },
      context,
    );
    const conversation = await harness.root(context, options.agent === undefined ? {} : { agent: options.agent });
    return new OmpSession(harness, conversation, options.roleMap, context, options.agent);
  }

  /**
   * Rebind after a crash or redeploy: reopen over the same storage and
   * continue the conversation where the last commit left it. Pass the
   * previous `conversationId` (default: root).
   */
  static async attach(
    storage: Storage,
    options: OmpSessionOpenOptions,
    conversationId?: ConversationId,
  ): Promise<OmpSession> {
    const session = await OmpSession.open(storage, options);
    if (conversationId !== undefined) {
      const found = await session.harness.conversation(conversationId, session.context);
      if (found === undefined) throw new Error(`conversation not found: ${String(conversationId)}`);
      session.conversation = found;
    }
    return session;
  }

  get id(): ConversationId {
    return this.conversation.id;
  }

  on(listener: OmpSessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: OmpSessionEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  /** Agent for conversations this session creates (inheritance for children). */
  get defaultAgent(): AgentChange | undefined {
    return this.createdAgent;
  }

  private async applyModelOverride(options: OmpPromptOptions): Promise<void> {
    const change: AgentChange | undefined =
      options.model !== undefined
        ? { model: options.model }
        : options.role !== undefined
          ? (roleAgentChange(options.roleMap ?? this.roleMap ?? {}, options.role).model === undefined
              ? undefined
              : { model: roleAgentChange(options.roleMap ?? this.roleMap ?? {}, options.role).model })
          : undefined;
    if (change !== undefined) await this.conversation.configure(change, this.context);
  }

  /**
   * Admit user input and start (or queue) a run. Resolves with the durable
   * `Submission` once admitted — await `waitForTurn()` for the answer.
   */
  async prompt(text: string, options: OmpPromptOptions = {}): Promise<Submission> {
    await this.applyModelOverride(options);
    const submission = await this.conversation.submit(
      {
        type: "input",
        content: text,
        whenBusy: options.whenBusy ?? "followUp",
        ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
      },
      this.context,
    );
    this.emit({ type: "input_placed", submissionId: String(submission.id) });
    return submission;
  }

  /** Interrupt the live turn and answer `text` first (`whenBusy: "steer"`). */
  async steer(text: string, options: Omit<OmpPromptOptions, "whenBusy"> = {}): Promise<Submission> {
    return this.prompt(text, { ...options, whenBusy: "steer" });
  }

  /** Wait for one submission's turn, emitting `message` + `turn_end`. */
  async waitForTurn(submission: Submission): Promise<SettledSubmissionRecord> {
    const before = new Set((await this.rawEntries()).map((entry) => String(entry.id)));
    const settled = await submission.wait(this.context);
    const after = await this.rawEntries();
    for (const entry of after) {
      if (!before.has(String(entry.id))) {
        for (const projected of projectTranscript([entry])) this.emit({ type: "message", entry: projected });
      }
    }
    this.emit({ type: "turn_end", submission: settled });
    return settled;
  }

  /** Prompt and wait for the answer in one call. */
  async ask(text: string, options: OmpPromptOptions = {}): Promise<SettledSubmissionRecord> {
    return this.waitForTurn(await this.prompt(text, options));
  }

  /**
   * Run a turn through the real omp loop (`agentLoop()`) and commit its
   * messages to the pi transcript.
   *
   * This is the genuine-integration path: scheduling, tool dispatch, and
   * the event lifecycle execute inside omp's code; pi-durable owns the
   * durable record around it. The prompt is stored as a passive `pi.user`
   * write first (no pi generation run), then `runOmpTurn()` executes, then
   * each produced message commits as its pi entry kind. Use `ask()` for
   * the fully-durable pi-generation engine instead.
   */
  async askOmp(
    text: string,
    request: {
      readonly tools?: readonly AgentTool[];
      readonly streamFn?: StreamFn;
      readonly model?: AgentLoopConfig["model"];
      readonly systemPrompt?: string[];
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<{ readonly messages: AgentMessage[]; readonly events: AgentEvent[] }> {
    const { runOmpTurn, ompMessagesToPi, piMessagesToOmp } = await import("./omp-loop.ts");
    const userMessage = { role: "user", content: text, timestamp: Date.now() } as PiUserMessage;
    const admission = await this.conversation.submit(
      { type: "write", entry: { kind: "pi.user", model: [userMessage] } },
      this.context,
    );
    await admission.wait(this.context);
    const history: PiMessage[] = [];
    for (const entry of await this.rawEntries()) history.push(...(entry.model ?? []));
    const result = await runOmpTurn({
      prompt: text,
      history: piMessagesToOmp(history),
      ...(request.tools === undefined ? {} : { tools: request.tools }),
      ...(request.streamFn === undefined ? {} : { streamFn: request.streamFn }),
      ...(request.model === undefined ? {} : { model: request.model }),
      ...(request.systemPrompt === undefined ? {} : { systemPrompt: request.systemPrompt }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    const committed = await this.conversation.commit(async (tx) => {
      const records: EntryRecord[] = [];
      for (const message of ompMessagesToPi(result.messages)) {
        const kind = message.role === "assistant" ? "pi.assistant" : message.role === "toolResult" ? "pi.tool-result" : "pi.user";
        records.push(await tx.appendEntry(this.conversation.id, { kind, model: [message] }));
      }
      return records;
    }, this.context);
    for (const record of committed) {
      for (const projected of projectTranscript([record])) this.emit({ type: "message", entry: projected });
    }
    return result;
  }

  /** Withdraw queued inputs, abort live work, wait until idle. */
  async abort(): Promise<void> {
    await this.conversation.abort(this.context);
    this.emit({ type: "aborted" });
  }

  /** Enable task scheduling (idempotent; also implied by submit/wait). */
  resume(): void {
    this.harness.resume();
  }

  /** Resolve when the conversation (and its owned subagents) go idle. */
  async waitForIdle(): Promise<void> {
    await this.conversation.waitForIdle(this.context);
    this.emit({ type: "idled" });
  }

  /** Start a fresh context carrying `handoff` as the first user message. */
  async reset(handoff?: string): Promise<void> {
    await this.conversation.reset(handoff, this.context);
  }

  /** Run a manual compaction task; resolves with its task id. */
  async compact(instructions?: string): Promise<unknown> {
    return this.conversation.compact(instructions, this.context);
  }

  /** Fork this conversation at `at` (an entry id) into a new conversation. */
  async fork(at: EntryId, agent?: AgentChange): Promise<OmpSession> {
    const forked = await this.conversation.fork(
      at,
      {
        ownership: { kind: "ownerless" },
        ...(agent === undefined ? {} : { agent }),
      },
      this.context,
    );
    return new OmpSession(this.harness, forked, this.roleMap, this.context, this.createdAgent);
  }

  /** Create a new session (sibling conversation) and switch to it. */
  async newSession(agent?: AgentChange): Promise<ConversationId> {
    const effective = agent ?? this.createdAgent;
    const created = await this.harness.createConversation(
      { ownership: { kind: "ownerless" }, ...(effective === undefined ? {} : { agent: effective }) },
      this.context,
    );
    this.conversation = created;
    this.emit({ type: "switched", conversationId: String(created.id) });
    return created.id;
  }

  /**
   * Create a child session (sibling conversation) without switching this
   * handle: the subagent primitive. Shares the Harness and role map.
   */
  async spawnChild(agent?: AgentChange): Promise<OmpSession> {
    const effective = agent ?? this.createdAgent;
    const created = await this.harness.createConversation(
      { ownership: { kind: "ownerless" }, ...(effective === undefined ? {} : { agent: effective }) },
      this.context,
    );
    return new OmpSession(this.harness, created, this.roleMap, this.context, effective);
  }

  /** Switch this handle to an existing conversation. */
  async switchSession(id: ConversationId): Promise<void> {
    const found = await this.harness.conversation(id, this.context);
    if (found === undefined) throw new Error(`conversation not found: ${String(id)}`);
    this.conversation = found;
    this.emit({ type: "switched", conversationId: String(id) });
  }

  /** Raw pi entries, oldest first. */
  async rawEntries(): Promise<Awaited<ReturnType<Conversation["entries"]>>["items"]> {
    const page = await this.conversation.entries({ order: "ascending" }, 10000, undefined, this.context);
    return page.items;
  }

  /** omp-projected transcript, oldest first. */
  async transcript(): Promise<OmpTranscriptEntry[]> {
    return projectTranscript(await this.rawEntries());
  }

  /** Aggregate model spend for the session. */
  async usage(): Promise<UsageState> {
    return this.harness.usage(this.context);
  }

  /** Close the Harness (flush + stop scheduling). Storage is closed by the caller. */
  async close(): Promise<void> {
    await this.harness.close(this.context);
  }
}
