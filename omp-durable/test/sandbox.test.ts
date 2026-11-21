/** Sandbox contract: jailing, env round-trip, polling watch. */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { LocalSandboxApi } from "../src/local.ts";
import { SandboxExecutionEnv } from "../src/sandbox.ts";

const context = BACKGROUND_CONTEXT;
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "omp-durable-sandbox-"));
  dirs.push(root);
  return { root, api: new LocalSandboxApi(root) };
}

describe("LocalSandboxApi", () => {
  it("jails paths to its root", async () => {
    const { api } = sandbox();
    const escaped = await api.readText("../../etc/hostname");
    expect(escaped.ok).toBe(false);
    if (!escaped.ok) expect(escaped.error.code).toBe("permission_denied");
  });

  it("reads and writes files", async () => {
    const { api } = sandbox();
    expect((await api.writeFile("/a.txt", "hello")).ok).toBe(true);
    const read = await api.readText("/a.txt");
    expect(read.ok && read.value).toBe("hello");
    const missing = await api.readText("/nope.txt");
    expect(missing.ok).toBe(false);
  });

  it("executes commands with output", async () => {
    const { api } = sandbox();
    const result = await api.exec("echo hi", undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(0);
      expect(result.value.stdout).toContain("hi");
    }
  });

  // These two exercise real OS processes and signals, so they wait on the real clock;
  // fake timers cannot advance a child shell's `sleep`.
  it("kills a running command when its host process is killed", async () => {
    const { root } = sandbox();
    const host = join(root, "host.ts");
    writeFileSync(
      host,
      `import { LocalSandboxApi } from ${JSON.stringify(join(import.meta.dir, "../src/local.ts"))};
new LocalSandboxApi(${JSON.stringify(root)}).exec("echo started >> log.txt; sleep 2; echo finished >> log.txt", undefined);
await new Promise(() => {});
`,
    );
    const proc = Bun.spawn(["bun", host], { stdout: "ignore", stderr: "ignore" });
    const log = join(root, "log.txt");
    for (let i = 0; i < 100 && !existsSync(log); i++) await Bun.sleep(20);
    proc.kill("SIGKILL");
    await proc.exited;
    await Bun.sleep(2500);
    expect(readFileSync(log, "utf8")).toBe("started\n");
  }, 10_000);

  it("kills the whole process tree on timeout", async () => {
    const { root, api } = sandbox();
    const result = await api.exec("(sleep 1; echo late >> late.txt) & wait", { timeoutMs: 200 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("timeout");
    await Bun.sleep(1500);
    expect(existsSync(join(root, "late.txt"))).toBe(false);
  }, 10_000);
});

describe("SandboxExecutionEnv", () => {
  it("adapts read/write/exec over the sandbox", async () => {
    const { api } = sandbox();
    const env = new SandboxExecutionEnv(api, { cwd: "/" });
    expect((await env.writeFile("x.txt", "data", context)).ok).toBe(true);
    const lines = await env.readTextLines("x.txt", undefined, context);
    expect(lines.ok && lines.value).toEqual(["data"]);
    const exec = await env.exec("echo ok", undefined, context);
    expect(exec.ok && exec.value.exitCode).toBe(0);
  });

  it("resolves relative paths against cwd", async () => {
    const { api } = sandbox();
    const env = new SandboxExecutionEnv(api, { cwd: "/sub" });
    expect((await env.createDir("/sub", { recursive: true }, context)).ok).toBe(true);
    expect((await env.writeFile("f.txt", "v", context)).ok).toBe(true);
    expect((await api.readText("/sub/f.txt")).ok).toBe(true);
  });

  it("polls for changes", async () => {
    const { api } = sandbox();
    const env = new SandboxExecutionEnv(api, { cwd: "/", watchIntervalMs: 50 });
    await env.writeFile("w.txt", "v1", context);
    const seen: string[][] = [];
    const watcher = await env.watch([{ path: "w.txt" }], (change) => {
      if (change.kind === "paths") seen.push(change.paths);
    });
    expect(watcher.ok).toBe(true);
    await env.writeFile("w.txt", "v2", context);
    const deadline = Date.now() + 3000;
    while (seen.length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.length).toBeGreaterThan(0);
    if (watcher.ok) await watcher.value.stop(context);
  });
});
