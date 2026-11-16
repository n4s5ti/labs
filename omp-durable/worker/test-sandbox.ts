/**
 * In-memory `SandboxApi` for worker tests. Test-only: a `Map<string,
 * Uint8Array>` filesystem plus an `echo`-shaped exec stub. Anything else
 * returns exit 0 with empty output — enough to prove the real loop drives
 * tools end to end under miniflare, not to emulate a shell.
 */

import type { FileInfo } from "@earendil-works/pi-durable/env";
import { err, ok, type Result } from "@earendil-works/pi-durable/env";
import type { SandboxApi, SandboxExecOptions, SandboxExecResult } from "../src/sandbox.ts";

type Failure = { code: "not_found"; message: string };

export class MemorySandboxApi implements SandboxApi {
  readonly id = "memory:test";
  private readonly files = new Map<string, Uint8Array>();
  private readonly dirs = new Set<string>(["/"]);

  private static fail(path: string): Result<never, Failure> {
    return err({ code: "not_found", message: `no such file: ${path}` });
  }

  async stat(path: string): Promise<Result<FileInfo, Failure>> {
    const bytes = this.files.get(path);
    if (bytes !== undefined) {
      return ok({ name: path.split("/").pop() ?? path, path, kind: "file", size: bytes.length, mtimeMs: Date.now() });
    }
    if (this.dirs.has(path)) {
      return ok({ name: path.split("/").pop() ?? path, path, kind: "directory", size: 0, mtimeMs: Date.now() });
    }
    return MemorySandboxApi.fail(path);
  }

  async readText(path: string): Promise<Result<string, Failure>> {
    const bytes = this.files.get(path);
    if (bytes === undefined) return MemorySandboxApi.fail(path);
    return ok(new TextDecoder().decode(bytes));
  }

  async readBinary(path: string): Promise<Result<Uint8Array, Failure>> {
    const bytes = this.files.get(path);
    if (bytes === undefined) return MemorySandboxApi.fail(path);
    return ok(bytes);
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<Result<void, Failure>> {
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    this.files.set(path, bytes);
    const slash = path.lastIndexOf("/");
    if (slash > 0) this.dirs.add(path.slice(0, slash));
    return ok(undefined);
  }

  async appendFile(path: string, content: string | Uint8Array): Promise<Result<void, Failure>> {
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    const existing = this.files.get(path) ?? new Uint8Array(0);
    const next = new Uint8Array(existing.length + bytes.length);
    next.set(existing, 0);
    next.set(bytes, existing.length);
    this.files.set(path, next);
    return ok(undefined);
  }

  async rename(sourcePath: string, destinationPath: string): Promise<Result<void, Failure>> {
    const bytes = this.files.get(sourcePath);
    if (bytes === undefined) return MemorySandboxApi.fail(sourcePath);
    this.files.delete(sourcePath);
    this.files.set(destinationPath, bytes);
    return ok(undefined);
  }

  async listDir(path: string): Promise<Result<FileInfo[], Failure>> {
    if (!this.dirs.has(path)) return MemorySandboxApi.fail(path);
    const prefix = path === "/" ? "/" : `${path}/`;
    const entries: FileInfo[] = [];
    for (const file of this.files.keys()) {
      if (file.startsWith(prefix) && !file.slice(prefix.length).includes("/")) {
        const bytes = this.files.get(file) ?? new Uint8Array(0);
        entries.push({ name: file.slice(prefix.length), path: file, kind: "file", size: bytes.length, mtimeMs: Date.now() });
      }
    }
    return ok(entries);
  }

  async mkdir(path: string, _recursive: boolean): Promise<Result<void, Failure>> {
    this.dirs.add(path);
    return ok(undefined);
  }

  async rm(path: string, _recursive: boolean): Promise<Result<void, Failure>> {
    this.files.delete(path);
    this.dirs.delete(path);
    return ok(undefined);
  }

  async createTempDir(prefix: string | undefined): Promise<Result<string, Failure>> {
    const dir = `/tmp/${prefix ?? "test"}-${Math.floor(Math.random() * 1e9)}`;
    this.dirs.add(dir);
    return ok(dir);
  }

  exec(command: string | readonly string[], options: SandboxExecOptions | undefined): Promise<Result<SandboxExecResult, { code: "unknown"; message: string }>> {
    const text = typeof command === "string" ? command : command.join(" ");
    // Test-only echo shape; everything else succeeds silently.
    const stdout = text.startsWith("echo ") ? `${text.slice(5)}\n` : "";
    options?.onOutput?.({ stream: "stdout", text: stdout });
    return Promise.resolve(ok({ exitCode: 0, stdout, stderr: "" }));
  }
}
