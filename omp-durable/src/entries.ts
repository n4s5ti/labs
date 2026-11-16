/**
 * omp-compatible transcript projection.
 *
 * System of record: pi-durable entries. omp keeps its own JSONL
 * `SessionEntry` stream (`CURRENT_SESSION_VERSION = 3`); this adapter does
 * **not** write that format — dual transcripts caused every dual-write
 * hazard in the proposal. Instead `projectTranscript()` reads pi entries and
 * projects the omp entry shapes UIs and harnesses consume:
 * `message`, `model-usage`, `model-change`, `compaction`, `branch-summary`,
 * `reset-boundary`, `custom`.
 *
 * The projection is lossy by design where the models genuinely differ
 * (documented per variant); it is sufficient for transcript viewers,
 * export/handoff, and parity tests.
 */

import type { EntryRecord } from "@earendil-works/pi-durable";

/** omp `SessionEntry` role for message entries. */
export type OmpMessageRole = "user" | "assistant" | "system" | "tool-result";

/** One projected message in an `OmpTranscriptEntry` of kind `message`. */
export type OmpProjectedMessage = {
  readonly role: OmpMessageRole;
  readonly text: string | undefined;
  readonly toolCallId: string | undefined;
  readonly toolName: string | undefined;
  readonly isError: boolean | undefined;
};

/**
 * omp entry shapes this adapter projects. `seq` preserves pi ordering;
 * `id` is the pi entry id, so projections round-trip back to the record.
 */
export type OmpTranscriptEntry =
  | {
      readonly kind: "message";
      readonly id: string;
      readonly seq: number;
      readonly message: OmpProjectedMessage;
      readonly byTask: string | undefined;
    }
  | {
      readonly kind: "model-usage";
      readonly id: string;
      readonly seq: number;
      readonly input: number;
      readonly output: number;
      readonly cost: number | undefined;
    }
  | {
      readonly kind: "model-change";
      readonly id: string;
      readonly seq: number;
      readonly provider: string | undefined;
      readonly modelId: string | undefined;
    }
  | {
      readonly kind: "compaction";
      readonly id: string;
      readonly seq: number;
      readonly summary: string | undefined;
    }
  | {
      readonly kind: "branch-summary";
      readonly id: string;
      readonly seq: number;
      readonly text: string | undefined;
    }
  | {
      readonly kind: "reset-boundary";
      readonly id: string;
      readonly seq: number;
      readonly handoff: string | undefined;
    }
  | {
      readonly kind: "custom";
      readonly id: string;
      readonly seq: number;
      readonly entryKind: string;
      readonly data: unknown;
    };

function messageText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return typeof content === "string" ? content : undefined;
  const text = content.find((item) => (item as { type?: string }).type === "text") as
    | { text?: string }
    | undefined;
  return text?.text;
}

/**
 * Project pi entries (oldest first) onto omp transcript entries. Unknown
 * `pi.*` kinds become `custom` carrying their kind; non-`pi.` kinds (writes
 * from extensions, e.g. `pi.reset` data) map where a counterpart exists.
 */
export function projectTranscript(entries: readonly EntryRecord[]): OmpTranscriptEntry[] {
  return entries.map((entry, index) => projectEntry(entry, index));
}

export function projectEntry(entry: EntryRecord, seq: number): OmpTranscriptEntry {
  const base = { id: String(entry.id), seq, byTask: entry.byTaskId === undefined ? undefined : String(entry.byTaskId) };
  switch (entry.kind) {
    case "pi.user":
    case "pi.assistant":
    case "pi.system":
    case "pi.tool-result": {
      const model = entry.model?.[0] as
        | { role?: string; content?: unknown; toolCallId?: string; toolName?: string; isError?: boolean }
        | undefined;
      return {
        kind: "message",
        ...base,
        message: {
          role: entry.kind === "pi.user" ? "user" : entry.kind === "pi.assistant" ? "assistant" : entry.kind === "pi.system" ? "system" : "tool-result",
          text: messageText(model?.content),
          toolCallId: model?.toolCallId,
          toolName: model?.toolName,
          isError: model?.isError,
        },
      };
    }
    case "pi.compaction":
      return { kind: "compaction", id: base.id, seq, summary: messageText((entry.model?.[0] as { content?: unknown } | undefined)?.content) };
    case "pi.reset":
      return {
        kind: "reset-boundary",
        id: base.id,
        seq,
        handoff: (entry.data as { handoff?: string } | undefined)?.handoff,
      };
    default: {
      const data = entry.data as { usage?: { input?: number; output?: number; cost?: { total?: number } }; provider?: string; modelId?: string } | undefined;
      if (entry.kind === "pi.usage" || data?.usage !== undefined) {
        return {
          kind: "model-usage",
          id: base.id,
          seq,
          input: data?.usage?.input ?? 0,
          output: data?.usage?.output ?? 0,
          cost: data?.usage?.cost?.total,
        };
      }
      if (entry.kind === "pi.model-change" || (data?.provider !== undefined && entry.model === undefined)) {
        return { kind: "model-change", id: base.id, seq, provider: data?.provider, modelId: data?.modelId };
      }
      return { kind: "custom", id: base.id, seq, entryKind: entry.kind, data: entry.data ?? null };
    }
  }
}

/** Render a projected transcript as plain text (viewers, logs, handoff). */
export function renderTranscript(entries: readonly OmpTranscriptEntry[]): string {
  return entries
    .map((entry) => {
      switch (entry.kind) {
        case "message":
          return `[${entry.message.role}] ${entry.message.text ?? ""}`;
        case "model-usage":
          return `(usage in=${entry.input} out=${entry.output}${entry.cost === undefined ? "" : ` cost=${entry.cost}`})`;
        case "model-change":
          return `(model → ${entry.provider ?? "?"}:${entry.modelId ?? "?"})`;
        case "compaction":
          return `(compacted: ${(entry.summary ?? "").slice(0, 120)})`;
        case "branch-summary":
          return `(branch: ${entry.text ?? ""})`;
        case "reset-boundary":
          return `(reset${entry.handoff === undefined ? "" : `: ${entry.handoff}`})`;
        case "custom":
          return `(${entry.entryKind})`;
      }
    })
    .join("\n");
}
