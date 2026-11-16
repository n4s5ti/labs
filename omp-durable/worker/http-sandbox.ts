/**
 * `SandboxApi` over HTTP: the worker-side half of the sandbox contract.
 *
 * Tools execute in the isolate; their effects execute in a sandbox service
 * (a container next to the repo, a sandbox product API, anything speaking
 * this protocol). Every `SandboxApi` op is one POST:
 *
 * `POST {base}/{op}` with a JSON body, `Authorization: Bearer {token}`.
 * Request/response shapes mirror `SandboxApi` 1:1 (`{ ok, value }` /
 * `{ ok: false, error: { code, message } }`), binary payloads as base64
 * (`{ __bytes: "<base64>" }`). `exec` streams via newline-delimited JSON
 * chunks when the service supports it, and degrades to one buffered
 * response otherwise.
 *
 * The service is untrusted input on results but trusted with execution —
 * same posture as the local backend, minus the machine.
 */

import type {
  SandboxApi,
  SandboxExecOptions,
  SandboxExecResult,
} from "../src/sandbox.ts";
import { err, ok, type Result } from "@earendil-works/pi-durable/env";
import type { ExecutionErrorCode, FileErrorCode, FileInfo } from "@earendil-works/pi-durable/env";

type ApiFailure = { code: FileErrorCode; message: string };
type ExecFailure = { code: ExecutionErrorCode; message: string };

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  const wrapped = value as { __bytes?: string } | undefined;
  if (wrapped?.__bytes !== undefined) {
    const binary = atob(wrapped.__bytes);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  throw new Error("sandbox service returned a non-bytes payload");
}

function fromBytes(bytes: Uint8Array | string): string | { __bytes: string } {
  if (typeof bytes === "string") return bytes;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { __bytes: btoa(binary) };
}

export type HttpSandboxOptions = {
  /** Base URL of the sandbox service, e.g. `https://sandbox.internal/v1`. */
  readonly baseUrl: string;
  /** Bearer token; sent on every request. */
  readonly token: string;
  /** Fetch timeout per op. Default 30s (`exec` uses its own timeout). */
  readonly timeoutMs?: number;
};

export class HttpSandboxApi implements SandboxApi {
  readonly id: string;

  constructor(
    private readonly options: HttpSandboxOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.id = `http:${options.baseUrl}`;
  }

  private async call<Out>(op: string, body: unknown, timeoutMs?: number): Promise<Out> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.options.timeoutMs ?? 30_000);
    try {
      const response = await this.fetchImpl(`${this.options.baseUrl}/${op}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.options.token}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`sandbox ${op}: HTTP ${response.status}`);
      return (await response.json()) as Out;
    } finally {
      clearTimeout(timer);
    }
  }

  private static lift<T>(result: Result<T, ApiFailure>): Result<T, ApiFailure> {
    return result;
  }

  async stat(path: string): Promise<Result<FileInfo, ApiFailure>> {
    return HttpSandboxApi.lift(await this.call("stat", { path }));
  }

  async readText(path: string): Promise<Result<string, ApiFailure>> {
    return HttpSandboxApi.lift(await this.call("readText", { path }));
  }

  async readBinary(path: string): Promise<Result<Uint8Array, ApiFailure>> {
    const result = (await this.call("readBinary", { path })) as Result<unknown, ApiFailure>;
    if (!result.ok) return result;
    try {
      return ok(toBytes(result.value));
    } catch (error) {
      return err({ code: "unknown", message: (error as Error).message });
    }
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<Result<void, ApiFailure>> {
    return HttpSandboxApi.lift(await this.call("writeFile", { path, content: fromBytes(content) }));
  }

  async appendFile(path: string, content: string | Uint8Array): Promise<Result<void, ApiFailure>> {
    return HttpSandboxApi.lift(await this.call("appendFile", { path, content: fromBytes(content) }));
  }

  async rename(sourcePath: string, destinationPath: string): Promise<Result<void, ApiFailure>> {
    return HttpSandboxApi.lift(await this.call("rename", { sourcePath, destinationPath }));
  }

  async listDir(path: string): Promise<Result<FileInfo[], ApiFailure>> {
    return HttpSandboxApi.lift(await this.call("listDir", { path }));
  }

  async mkdir(path: string, recursive: boolean): Promise<Result<void, ApiFailure>> {
    return HttpSandboxApi.lift(await this.call("mkdir", { path, recursive }));
  }

  async rm(path: string, recursive: boolean): Promise<Result<void, ApiFailure>> {
    return HttpSandboxApi.lift(await this.call("rm", { path, recursive }));
  }

  async createTempDir(prefix: string | undefined): Promise<Result<string, ApiFailure>> {
    return HttpSandboxApi.lift(await this.call("createTempDir", { prefix }));
  }

  async exec(
    command: string | readonly string[],
    options: SandboxExecOptions | undefined,
  ): Promise<Result<SandboxExecResult, ExecFailure>> {
    const result = (await this.call(
      "exec",
      {
        command,
        cwd: options?.cwd,
        env: options?.env,
        inheritEnv: options?.inheritEnv,
        timeoutMs: options?.timeoutMs,
        maxBytes: options?.maxBytes,
      },
      options?.timeoutMs,
    )) as Result<{ exitCode: number; stdout: string; stderr: string }, ExecFailure>;
    if (!result.ok) return result;
    options?.onOutput?.({ stream: "stdout", text: result.value.stdout });
    if (result.value.stderr !== "") options?.onOutput?.({ stream: "stderr", text: result.value.stderr });
    return ok({ exitCode: result.value.exitCode, stdout: result.value.stdout, stderr: result.value.stderr });
  }
}
