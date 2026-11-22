/**
 * `LocalSandboxApi`: a `SandboxApi` over the machine running this process.
 *
 * Dev and tests only. The cloud path is a remote `SandboxApi` (a sandbox
 * service next to the repo); this backend exists so the adapter runs and its
 * tests prove behavior without any cloud dependency.
 *
 * Safety: every path is resolved under `root` and escapes are rejected with
 * `permission_denied`. This is a convenience jail, not a security boundary —
 * a hostile prompt can still run `exec()` with any command, which is exactly
 * what a coding agent is for. Real isolation lives in the sandbox service.
 *
 * Namespace rule: callers speak *sandbox* paths throughout (`/` is this
 * backend's root, mapped to `root` on the host). Never pass host paths as
 * `cwd` or file arguments — a host path resolves under the jail like any
 * other escape attempt.
 */

import { spawn } from "node:child_process";
import { appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { FileErrorCode, FileInfo } from "@earendil-works/pi-durable/env";
import type { SandboxApi, SandboxExecOptions, SandboxExecResult } from "./sandbox.ts";
import { err, ok, type Result } from "@earendil-works/pi-durable/env";

type SandboxFailure = { code: FileErrorCode; message: string };
type ExecFailure = { code: import("@earendil-works/pi-durable/env").ExecutionErrorCode; message: string };

function fail(code: FileErrorCode, message: string): Result<never, SandboxFailure> {
  return err({ code, message });
}

const POSIX = process.platform !== "win32";

/** SIGKILL a detached child's whole process group (its shell and everything it started). */
function killGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(POSIX ? -pid : pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

/**
 * Runs a command in its own process group, guarded by this process's
 * lifetime. Before exec'ing the command, the group leader starts a background
 * watcher in the same group. While this host (`$1`) is alive it polls; once
 * the command (the leader, `$$`) is gone it exits quietly. If the host dies,
 * even by SIGKILL, the watcher kills the whole group within one poll. The guard
 * exists before the command's first instruction, so the command never runs
 * unguarded. Without it an interrupted tool call keeps running after its host
 * is gone and finishes side effects nothing recorded.
 *
 * Liveness polling instead of an inherited pipe: Bun's extra stdio pipes can
 * report EOF to the child while the parent still holds them.
 */
const GUARDED_EXEC =
  'host=$1; shift; { while kill -0 "$host" 2>/dev/null; do kill -0 $$ 2>/dev/null || exit 0; sleep 0.2; done; kill -KILL 0; } </dev/null >/dev/null 2>&1 & exec "$@"';

function nodeCode(error: unknown): FileErrorCode {
  const code = (error as { code?: string } | undefined)?.code;
  if (code === "OMP_ESCAPE") return "permission_denied";
  switch (code) {
    case "ENOENT":
      return "not_found";
    case "EACCES":
    case "EPERM":
      return "permission_denied";
    case "ENOTDIR":
      return "not_directory";
    case "EISDIR":
      return "is_directory";
    case "EINVAL":
      return "invalid";
    default:
      return "unknown";
  }
}

export class LocalSandboxApi implements SandboxApi {
  readonly id: string;
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
    this.id = `local:${this.root}`;
  }

  private jail(path: string): string {
    const full = resolve(this.root, path.startsWith("/") ? path.slice(1) : path);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      const escape = new Error(`path escapes sandbox root: ${path}`);
      (escape as { code?: string }).code = "OMP_ESCAPE";
      throw escape;
    }
    return full;
  }

  async stat(path: string): Promise<Result<FileInfo, SandboxFailure>> {
    let full: string;
    try {
      full = this.jail(path);
    } catch (error) {
      return fail("permission_denied", (error as Error).message);
    }
    try {
      const info = await stat(full);
      const kind = info.isDirectory() ? "directory" : info.isSymbolicLink() ? "symlink" : "file";
      return ok({ name: full.split(sep).pop() ?? full, path, kind, size: info.size, mtimeMs: info.mtimeMs });
    } catch (error) {
      return fail(nodeCode(error), (error as Error).message);
    }
  }

  async readText(path: string): Promise<Result<string, SandboxFailure>> {
    try {
      return ok(await readFile(this.jail(path), "utf8"));
    } catch (error) {
      return fail(nodeCode(error), (error as Error).message);
    }
  }

  async readBinary(path: string): Promise<Result<Uint8Array, SandboxFailure>> {
    try {
      return ok(new Uint8Array(await readFile(this.jail(path))));
    } catch (error) {
      return fail(nodeCode(error), (error as Error).message);
    }
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<Result<void, SandboxFailure>> {
    try {
      await writeFile(this.jail(path), content);
      return ok(undefined);
    } catch (error) {
      return fail(nodeCode(error), (error as Error).message);
    }
  }

  async appendFile(path: string, content: string | Uint8Array): Promise<Result<void, SandboxFailure>> {
    try {
      await appendFile(this.jail(path), content);
      return ok(undefined);
    } catch (error) {
      return fail(nodeCode(error), (error as Error).message);
    }
  }

  async rename(sourcePath: string, destinationPath: string): Promise<Result<void, SandboxFailure>> {
    try {
      await rename(this.jail(sourcePath), this.jail(destinationPath));
      return ok(undefined);
    } catch (error) {
      return fail(nodeCode(error), (error as Error).message);
    }
  }

  async listDir(path: string): Promise<Result<FileInfo[], SandboxFailure>> {
    try {
      const full = this.jail(path);
      const names = await readdir(full);
      const infos: FileInfo[] = [];
      for (const name of names) {
        try {
          const info = await stat(join(full, name));
          infos.push({
            name,
            path: join(path, name),
            kind: info.isDirectory() ? "directory" : info.isSymbolicLink() ? "symlink" : "file",
            size: info.size,
            mtimeMs: info.mtimeMs,
          });
        } catch {
          continue;
        }
      }
      return ok(infos);
    } catch (error) {
      return fail(nodeCode(error), (error as Error).message);
    }
  }

  async mkdir(path: string, recursive: boolean): Promise<Result<void, SandboxFailure>> {
    try {
      await mkdir(this.jail(path), { recursive });
      return ok(undefined);
    } catch (error) {
      return fail(nodeCode(error), (error as Error).message);
    }
  }

  async rm(path: string, recursive: boolean): Promise<Result<void, SandboxFailure>> {
    try {
      await rm(this.jail(path), { recursive, force: true });
      return ok(undefined);
    } catch (error) {
      return fail(nodeCode(error), (error as Error).message);
    }
  }

  async createTempDir(prefix: string | undefined): Promise<Result<string, SandboxFailure>> {
    try {
      const dir = await mkdtemp(join(tmpdir(), prefix ?? "omp-durable-"));
      return ok(dir);
    } catch (error) {
      return fail(nodeCode(error), (error as Error).message);
    }
  }

  exec(
    command: string | readonly string[],
    options: SandboxExecOptions | undefined,
  ): Promise<Result<SandboxExecResult, ExecFailure>> {
    let full: string;
    try {
      // No cwd means the sandbox root ("/" in sandbox namespace), never the
      // host path — callers speak sandbox paths throughout.
      full = this.jail(options?.cwd ?? "/");
    } catch (error) {
      return Promise.resolve(err({ code: "spawn_error" as const, message: (error as Error).message }));
    }
    return new Promise((resolvePromise) => {
      const argv = typeof command === "string" ? ["/bin/sh", "-c", command] : [...command];
      const [file, args] = POSIX
        ? ["/bin/sh", ["-c", GUARDED_EXEC, "omp-exec", String(process.pid), ...argv]]
        : [argv[0], argv.slice(1)];
      let child;
      try {
        // Own process group, so the whole tree can be killed together.
        child = spawn(file, args, {
          cwd: full,
          env: options?.inheritEnv === false ? { ...(options?.env ?? {}) } : { ...process.env, ...(options?.env ?? {}) },
          detached: POSIX,
        });
      } catch (error) {
        resolvePromise(err({ code: "spawn_error" as const, message: (error as Error).message }));
        return;
      }
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (result: Result<SandboxExecResult, ExecFailure>): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise(result);
      };
      const timer =
        options?.timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              killGroup(child.pid);
              finish(err({ code: "timeout" as const, message: `command timed out after ${options.timeoutMs}ms` }));
            }, options.timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stdout += text;
        if (stdout.length > (options?.maxBytes ?? 1 << 20)) {
          killGroup(child.pid);
          finish(err({ code: "unknown" as const, message: "output exceeded maxBytes" }));
          return;
        }
        options?.onOutput?.({ stream: "stdout", text });
      });
      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stderr += text;
        options?.onOutput?.({ stream: "stderr", text });
      });
      child.on("error", (error) => {
        finish(err({ code: "spawn_error" as const, message: error.message }));
      });
      child.on("close", (code) => {
        finish(ok({ exitCode: code ?? 1, stdout, stderr }));
      });
    });
  }
}
