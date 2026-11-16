/**
 * Worker-side sandbox API.
 *
 * omp's tools assume a local machine (`Bun.spawn`, `node:fs`, `~/.omp`).
 * pi-durable's `ExecutionEnv` is the cloud seam that replaces those
 * assumptions — and per the approved decision (Q3a) its implementation here
 * talks to a **worker-side sandbox service** instead of the local machine.
 *
 * `SandboxApi` is the wire-shaped contract such a service implements: plain
 * data in and out (no callbacks except the optional streaming `onOutput`,
 * which a remote transport batches). `SandboxExecutionEnv` adapts the full
 * pi-durable `ExecutionEnv` (`FileSystem` + `Shell`) over it, so omp-style
 * tools (bash/read/write/edit/list) run unchanged against any backend.
 *
 * Backends in this file:
 * - `LocalSandboxApi` — direct `node:fs` + `node:child_process` execution,
 *   jailed to a root directory. Dev and tests only; never the cloud path.
 * - Bring your own: implement `SandboxApi` over fetch/WebSocket to a sandbox
 *   sidecar (e.g. a container next to the repo, or a sandbox product API).
 */

import type { Context } from "@earendil-works/chord/context";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  err,
  type ExecutionEnv,
  ExecutionError,
  type ExecutionErrorCode,
  FileError,
  type FileErrorCode,
  type FileInfo,
  type FileWatcher,
  type ListFilesOptions,
  ok,
  type Result,
  type ShellExecOptions,
  type ShellExecResult,
  type WatchTarget,
} from "@earendil-works/pi-durable/env";

/** Chunk of process output delivered while a command runs. */
export type SandboxOutputChunk = {
  readonly stream: "stdout" | "stderr";
  readonly text: string;
};

/** Options for `SandboxApi.exec`. Mirrors the fields a remote call needs. */
export type SandboxExecOptions = {
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly inheritEnv?: boolean;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly onOutput?: (chunk: SandboxOutputChunk) => void;
};

/** Buffered result of `SandboxApi.exec`. */
export type SandboxExecResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

/**
 * Wire-shaped sandbox contract. Every method returns `Result` — expected
 * failures (missing file, bad exit) are values, not throws — so the
 * `SandboxExecutionEnv` adapter maps them 1:1 onto `ExecutionEnv` semantics.
 * Paths are service-absolute; a service may additionally jail them.
 */
export interface SandboxApi {
  readonly id: string;
  stat(path: string): Promise<Result<FileInfo, { code: FileErrorCode; message: string }>>;
  readText(path: string): Promise<Result<string, { code: FileErrorCode; message: string }>>;
  readBinary(path: string): Promise<Result<Uint8Array, { code: FileErrorCode; message: string }>>;
  writeFile(path: string, content: string | Uint8Array): Promise<Result<void, { code: FileErrorCode; message: string }>>;
  appendFile(path: string, content: string | Uint8Array): Promise<Result<void, { code: FileErrorCode; message: string }>>;
  rename(sourcePath: string, destinationPath: string): Promise<Result<void, { code: FileErrorCode; message: string }>>;
  listDir(path: string): Promise<Result<FileInfo[], { code: FileErrorCode; message: string }>>;
  mkdir(path: string, recursive: boolean): Promise<Result<void, { code: FileErrorCode; message: string }>>;
  rm(path: string, recursive: boolean): Promise<Result<void, { code: FileErrorCode; message: string }>>;
  createTempDir(prefix: string | undefined): Promise<Result<string, { code: FileErrorCode; message: string }>>;
  exec(
    command: string | readonly string[],
    options: SandboxExecOptions | undefined,
  ): Promise<Result<SandboxExecResult, { code: ExecutionErrorCode; message: string }>>;
}

function fileError(path: string, code: FileErrorCode, message: string): FileError {
  return new FileError(code, message, path);
}

function lift<T>(path: string, result: Result<T, { code: FileErrorCode; message: string }>): Result<T, FileError> {
  if (result.ok) return result;
  return err(fileError(path, result.error.code, result.error.message));
}

/**
 * `ExecutionEnv` over a `SandboxApi`. Structural notes:
 * - One sandbox `id` per service: equal ids see the same files (matches the
 *   `FileSystem.id` contract; each sandbox backend gets its own id).
 * - `watch()` is polling (`FileWatcher.mode: "polling"`): remote sandboxes
 *   have no fs events, so snapshots are compared on an interval. Local-only
 *   `native` watching stays in `NodeExecutionEnv`.
 * - Random-access readers buffer the whole file once: correct for the
 *   tool-sized files agents touch, not for multi-GB binaries (documented,
 *   matches `readBinaryFile` bounds in practice).
 */
export class SandboxExecutionEnv implements ExecutionEnv {
  readonly id: string;
  cwd: string;

  constructor(
    private readonly sandbox: SandboxApi,
    options: { readonly cwd?: string; readonly watchIntervalMs?: number } = {},
  ) {
    this.id = `sandbox:${sandbox.id}`;
    this.cwd = options.cwd ?? "/";
    this.watchIntervalMs = options.watchIntervalMs ?? 2000;
  }

  private readonly watchIntervalMs: number;

  private resolve(path: string): string {
    if (path.startsWith("/")) return path;
    const base = this.cwd.endsWith("/") ? this.cwd : `${this.cwd}/`;
    return base + path;
  }

  async absolutePath(path: string, _context: Context = BACKGROUND_CONTEXT): Promise<Result<string, FileError>> {
    return ok(this.resolve(path));
  }

  async joinPath(parts: string[], _context: Context = BACKGROUND_CONTEXT): Promise<Result<string, FileError>> {
    return ok(parts.join("/").replace(/\/+/g, "/"));
  }

  async readTextFile(path: string, _context: Context = BACKGROUND_CONTEXT): Promise<Result<string, FileError>> {
    const full = this.resolve(path);
    return lift(path, await this.sandbox.readText(full));
  }

  async readBinaryFile(path: string, _context: Context = BACKGROUND_CONTEXT): Promise<Result<Uint8Array, FileError>> {
    const full = this.resolve(path);
    return lift(path, await this.sandbox.readBinary(full));
  }

  async openTextLineReader(path: string, _context: Context = BACKGROUND_CONTEXT): Promise<Result<import("@earendil-works/pi-durable/env").TextLineReader, FileError>> {
    const text = this.readTextFile(path);
    return text.then((result) => {
      if (!result.ok) return result;
      const lines = result.value.split("\n");
      let index = 0;
      let closed = false;
      return ok({
        readLine: async () => {
          if (closed || index >= lines.length) return ok(undefined);
          const last = index === lines.length - 1;
          const text = lines[index++];
          return ok({ text, terminated: !last });
        },
        close: async () => {
          closed = true;
        },
      });
    });
  }

  async readTextLines(
    path: string,
    options: { maxLines?: number } | undefined,
    _context: Context = BACKGROUND_CONTEXT,
  ): Promise<Result<string[], FileError>> {
    const result = await this.readTextFile(path);
    if (!result.ok) return result;
    const lines = result.value.split("\n");
    // A trailing newline does not add an empty final line.
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    const max = options?.maxLines ?? lines.length;
    return ok(lines.slice(0, max));
  }

  async openBinaryReader(
    path: string,
    _options: { noFollow?: boolean } | undefined,
    _context: Context = BACKGROUND_CONTEXT,
  ): Promise<Result<import("@earendil-works/pi-durable/env").BinaryReader, FileError>> {
    const loaded = await this.readBinaryFile(path);
    if (!loaded.ok) return loaded;
    const bytes = loaded.value;
    let closed = false;
    const newlineIndexes: number[] = [];
    for (let i = 0; i < bytes.length; i++) if (bytes[i] === 10) newlineIndexes.push(i);
    return ok({
      info: async () => {
        const stat = await this.fileInfo(path);
        if (!stat.ok) return stat;
        return ok({ ...stat.value, size: bytes.length });
      },
      read: async (offset, length) => {
        if (closed) return err(fileError(path, "unknown", "reader is closed"));
        return ok(bytes.slice(offset, offset + length));
      },
      scanLines: async ({ startLine, endLine }) => {
        const starts = [0, ...newlineIndexes.map((n) => n + 1)];
        const start = starts[Math.min(startLine, starts.length - 1)] ?? bytes.length;
        const endExclusive = endLine === undefined ? bytes.length : (starts[Math.min(endLine, starts.length - 1)] ?? bytes.length);
        const end = endExclusive > start && bytes[endExclusive - 1] === 10 ? endExclusive - 1 : endExclusive;
        return ok({
          newlines: newlineIndexes.length,
          start,
          end,
          firstLineEnd: Math.min(start + selectedLength(bytes, start), bytes.length),
          lastLineStart: start,
          selectedBytes: end - start,
          firstLineBytes: Math.min(selectedLength(bytes, start), end - start),
        });
      },
      close: async () => {
        closed = true;
      },
    });
  }

  async writeFile(path: string, content: string | Uint8Array, _context: Context = BACKGROUND_CONTEXT): Promise<Result<void, FileError>> {
    const full = this.resolve(path);
    return lift(path, await this.sandbox.writeFile(full, content));
  }

  async appendFile(path: string, content: string | Uint8Array, _context: Context = BACKGROUND_CONTEXT): Promise<Result<void, FileError>> {
    const full = this.resolve(path);
    return lift(path, await this.sandbox.appendFile(full, content));
  }

  async truncateFile(path: string, size: number, _context: Context = BACKGROUND_CONTEXT): Promise<Result<void, FileError>> {
    const full = this.resolve(path);
    const current = await this.sandbox.readBinary(full);
    if (!current.ok) return lift(path, current);
    const next = new Uint8Array(size);
    next.set(current.value.slice(0, size));
    return lift(path, await this.sandbox.writeFile(full, next));
  }

  async flushFile(_path: string, _context: Context = BACKGROUND_CONTEXT): Promise<Result<void, FileError>> {
    // Sandbox writes are already durable on return; nothing to flush.
    return ok(undefined);
  }

  async renameFile(sourcePath: string, destinationPath: string, _context: Context = BACKGROUND_CONTEXT): Promise<Result<void, FileError>> {
    const full = this.resolve(destinationPath);
    return lift(sourcePath, await this.sandbox.rename(this.resolve(sourcePath), full));
  }

  async fileInfo(path: string, _context: Context = BACKGROUND_CONTEXT): Promise<Result<FileInfo, FileError>> {
    const full = this.resolve(path);
    return lift(path, await this.sandbox.stat(full));
  }

  async listDir(path: string, _context: Context = BACKGROUND_CONTEXT): Promise<Result<FileInfo[], FileError>> {
    const full = this.resolve(path);
    return lift(path, await this.sandbox.listDir(full));
  }

  async openDirReader(path: string, _context: Context = BACKGROUND_CONTEXT): Promise<Result<import("@earendil-works/pi-durable/env").DirReader, FileError>> {
    const listed = await this.listDir(path);
    if (!listed.ok) return listed;
    let done = false;
    return ok({
      next: async (maxEntries) => {
        if (done) return ok({ entries: [], done: true });
        done = true;
        return ok({ entries: listed.value.slice(0, maxEntries), done: true });
      },
      close: async () => {
        done = true;
      },
    });
  }

  async watch(
    targets: readonly WatchTarget[],
    onChange: (change: import("@earendil-works/pi-durable/env").FileChange) => void,
    _context: Context = BACKGROUND_CONTEXT,
  ): Promise<Result<FileWatcher, FileError>> {
    // Polling snapshot comparison: `FileWatcher.mode: "polling"`.
    const snapshot = new Map<string, string>();
    const keyOf = async (path: string): Promise<string | undefined> => {
      const info = await this.sandbox.stat(this.resolve(path));
      if (!info.ok) return undefined;
      return `${info.value.kind}:${info.value.size}:${info.value.mtimeMs}`;
    };
    const scan = async (): Promise<void> => {
      for (const target of targets) {
        const key = await keyOf(target.path);
        const previous = snapshot.get(target.path);
        if (key !== previous) {
          snapshot.set(target.path, key ?? "");
          onChange({ kind: "paths", paths: [target.path] });
        }
      }
    };
    await scan();
    const timer = setInterval(() => void scan(), this.watchIntervalMs);
    return ok({
      mode: "polling",
      stop: async () => {
        clearInterval(timer);
      },
    });
  }

  async canonicalPath(path: string, _context: Context = BACKGROUND_CONTEXT): Promise<Result<string, FileError>> {
    return ok(this.resolve(path));
  }

  async exists(path: string, _context: Context = BACKGROUND_CONTEXT): Promise<Result<boolean, FileError>> {
    const info = await this.sandbox.stat(this.resolve(path));
    return ok(info.ok);
  }

  async createDir(path: string, options: { recursive?: boolean } | undefined, _context: Context = BACKGROUND_CONTEXT): Promise<Result<void, FileError>> {
    const full = this.resolve(path);
    return lift(path, await this.sandbox.mkdir(full, options?.recursive ?? false));
  }

  async remove(path: string, _options: { recursive?: boolean; force?: boolean } | undefined, _context: Context = BACKGROUND_CONTEXT): Promise<Result<void, FileError>> {
    const full = this.resolve(path);
    return lift(path, await this.sandbox.rm(full, true));
  }

  async createTempDir(prefix: string | undefined, _context: Context = BACKGROUND_CONTEXT): Promise<Result<string, FileError>> {
    return lift("<tmp>", await this.sandbox.createTempDir(prefix));
  }

  async createTempFile(options: { prefix?: string; suffix?: string } | undefined, _context: Context = BACKGROUND_CONTEXT): Promise<Result<string, FileError>> {
    const dir = await this.sandbox.createTempDir(options?.prefix);
    if (!dir.ok) return lift("<tmp>", dir);
    const name = `tmp-${Date.now()}-${Math.floor(Math.random() * 1e6)}${options?.suffix ?? ""}`;
    const path = `${dir.value}/${name}`;
    const written = await this.sandbox.writeFile(path, "");
    if (!written.ok) return lift(path, written);
    return ok(path);
  }

  async cleanup(_context: Context = BACKGROUND_CONTEXT): Promise<void> {
    // Per-request state lives in the sandbox service; nothing local to drop.
  }

  async exec(
    command: string | readonly string[],
    options: ShellExecOptions | undefined,
    context: Context = BACKGROUND_CONTEXT,
  ): Promise<Result<ShellExecResult, ExecutionError>> {
    const forward = (text: string, stream: "stdout" | "stderr"): void => {
      options?.onOutput?.(text, context, { stream });
    };
    const result = await this.sandbox.exec(command, {
      cwd: options?.cwd ?? this.cwd,
      env: options?.env,
      inheritEnv: options?.inheritEnv,
      timeoutMs: options?.timeout,
      onOutput: options?.onOutput === undefined ? undefined : (chunk) => forward(chunk.text, chunk.stream),
    });
    if (!result.ok) {
      return err(new ExecutionError(result.error.code, result.error.message));
    }
    // Buffered backends deliver output at completion; `spill` thresholds are a
    // local-execution optimization and intentionally have no effect here —
    // tools must bound output with `maxBytes`/`window` instead.
    if (result.value.stdout !== "") forward(result.value.stdout, "stdout");
    if (result.value.stderr !== "") forward(result.value.stderr, "stderr");
    return ok({ exitCode: result.value.exitCode });
  }
}

function selectedLength(bytes: Uint8Array, start: number): number {
  const next = bytes.indexOf(10, start);
  return (next === -1 ? bytes.length : next) - start;
}

/**
 * Build the env function a host passes as `HarnessOptions.env`: one
 * `SandboxExecutionEnv` per conversation, rooted at the conversation agent's
 * `cwd` (the subagent/worktree isolation point). The sandbox service enforces
 * containment; `cwd` only scopes the view.
 */
export function sandboxEnvFor(
  sandbox: SandboxApi,
  options: { readonly root?: string; readonly watchIntervalMs?: number } = {},
): (target: { readonly cwd?: string }, _context: Context) => SandboxExecutionEnv {
  return (target) =>
    new SandboxExecutionEnv(sandbox, {
      cwd: target.cwd ?? options.root ?? "/",
      ...(options.watchIntervalMs === undefined ? {} : { watchIntervalMs: options.watchIntervalMs }),
    });
}
