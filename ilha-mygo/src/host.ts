// Sync retained-host surface shared by the FFI and in-memory backends.
//
// The FFI backend is primary: every method is a single synchronous
// `dlopen` call into `go/libmygo.so`, which is exactly what ilha's
// synchronous `PaintOps` needs. `MemoryHost` mirrors Go semantics in pure
// TypeScript for tests and for environments without the compiled library.
// The child-process fallback (`IpcHost`) is async by nature and lives
// separately below; it drives the same Go store over stdio.
import { dlopen } from "bun:ffi";
import type { FileSink } from "bun";

/** Recursive tree snapshot served by `describe`. */
export interface MygoTreeNode {
  readonly id: number;
  readonly kind: string;
  readonly props: Record<string, string>;
  readonly children: MygoTreeNode[];
}

/** Synchronous retained-host operations. Handles start at 1; 0 is never valid. */
export interface SyncHost {
  readonly backend: "ffi" | "memory";
  version(): number;
  reset(): void;
  create(kind: string): number;
  setProp(id: number, key: string, value: string): boolean;
  delProp(id: number, key: string): boolean;
  attach(parent: number, child: number): boolean;
  detach(parent: number, child: number): boolean;
  remove(id: number): boolean;
  count(): number;
  describe(id: number): MygoTreeNode | null;
}

const toNumber = (value: bigint | number): number => Number(value);

const loadLibrary = (libPath: string) =>
  dlopen(libPath, {
    MygoVersion: { args: [], returns: "i64" },
    MygoAdd: { args: ["i64", "i64"], returns: "i64" },
    MygoReset: { args: [], returns: "void" },
    MygoCreate: { args: ["cstring"], returns: "i64" },
    MygoSetProp: { args: ["i64", "cstring", "cstring"], returns: "i32" },
    MygoDelProp: { args: ["i64", "cstring"], returns: "i32" },
    MygoAttach: { args: ["i64", "i64"], returns: "i32" },
    MygoDetach: { args: ["i64", "i64"], returns: "i32" },
    MygoRemove: { args: ["i64"], returns: "i32" },
    MygoCount: { args: [], returns: "i64" },
    MygoDescribeInto: { args: ["i64", "buffer", "i64"], returns: "i64" },
  });

type MygoLib = ReturnType<typeof loadLibrary>;

/** `SyncHost` over the compiled Go shared library via `bun:ffi`. */
export class FfiHost implements SyncHost {
  readonly backend = "ffi" as const;
  private lib: MygoLib;
  private scratch = Buffer.alloc(64 * 1024);

  private constructor(lib: MygoLib) {
    this.lib = lib;
  }

  /** Open `libPath` (e.g. `go/libmygo.so`, built by `bun run build:lib`). */
  static open(libPath: string): FfiHost {
    return new FfiHost(loadLibrary(libPath));
  }

  /** Raw integer addition, exercising the FFI boundary in tests. */
  add(a: number, b: number): number {
    return toNumber(this.lib.symbols.MygoAdd(a, b));
  }

  version(): number {
    return toNumber(this.lib.symbols.MygoVersion());
  }

  reset(): void {
    this.lib.symbols.MygoReset();
  }

  create(kind: string): number {
    return toNumber(this.lib.symbols.MygoCreate(kind));
  }

  setProp(id: number, key: string, value: string): boolean {
    return this.lib.symbols.MygoSetProp(id, key, value) === 1;
  }

  delProp(id: number, key: string): boolean {
    return this.lib.symbols.MygoDelProp(id, key) === 1;
  }

  attach(parent: number, child: number): boolean {
    return this.lib.symbols.MygoAttach(parent, child) === 1;
  }

  detach(parent: number, child: number): boolean {
    return this.lib.symbols.MygoDetach(parent, child) === 1;
  }

  remove(id: number): boolean {
    return this.lib.symbols.MygoRemove(id) === 1;
  }

  count(): number {
    return toNumber(this.lib.symbols.MygoCount());
  }

  describe(id: number): MygoTreeNode | null {
    for (;;) {
      const n = toNumber(
        this.lib.symbols.MygoDescribeInto(id, this.scratch, BigInt(this.scratch.length)),
      );
      if (n === -1) {
        return null;
      }
      if (n >= this.scratch.length) {
        this.scratch = Buffer.alloc(n);
        continue;
      }
      return JSON.parse(this.scratch.subarray(0, n).toString()) as MygoTreeNode;
    }
  }

  close(): void {
    this.lib.close();
  }
}

interface MemoryNode {
  kind: string;
  props: Record<string, string>;
  children: number[];
}

/** Pure-TypeScript `SyncHost` with identical semantics to the Go store. */
export class MemoryHost implements SyncHost {
  readonly backend = "memory" as const;
  private next = 1;
  private nodes = new Map<number, MemoryNode>();

  version(): number {
    return 1;
  }

  reset(): void {
    this.next = 1;
    this.nodes.clear();
  }

  create(kind: string): number {
    const id = this.next++;
    this.nodes.set(id, { kind, props: {}, children: [] });
    return id;
  }

  setProp(id: number, key: string, value: string): boolean {
    const node = this.nodes.get(id);
    if (!node) {
      return false;
    }
    node.props[key] = value;
    return true;
  }

  delProp(id: number, key: string): boolean {
    const node = this.nodes.get(id);
    if (!node) {
      return false;
    }
    delete node.props[key];
    return true;
  }

  private reaches(id: number, ancestor: number): boolean {
    if (id === ancestor) {
      return true;
    }
    const node = this.nodes.get(ancestor);
    if (!node) {
      return false;
    }
    return node.children.some((child) => this.reaches(id, child));
  }

  attach(parent: number, child: number): boolean {
    const p = this.nodes.get(parent);
    if (!p || !this.nodes.has(child) || this.reaches(parent, child)) {
      return false;
    }
    if (!p.children.includes(child)) {
      p.children.push(child);
    }
    return true;
  }

  detach(parent: number, child: number): boolean {
    const p = this.nodes.get(parent);
    if (!p || !this.nodes.has(child)) {
      return false;
    }
    p.children = p.children.filter((id) => id !== child);
    return true;
  }

  remove(id: number): boolean {
    if (!this.nodes.has(id)) {
      return false;
    }
    for (const node of this.nodes.values()) {
      node.children = node.children.filter((child) => child !== id);
    }
    const drop = (nodeId: number): void => {
      const node = this.nodes.get(nodeId);
      if (!node) {
        return;
      }
      this.nodes.delete(nodeId);
      for (const child of node.children) {
        drop(child);
      }
    };
    drop(id);
    return true;
  }

  count(): number {
    return this.nodes.size;
  }

  describe(id: number): MygoTreeNode | null {
    const expand = (nodeId: number): MygoTreeNode | null => {
      const node = this.nodes.get(nodeId);
      if (!node) {
        return null;
      }
      return {
        id: nodeId,
        kind: node.kind,
        props: { ...node.props },
        children: node.children.flatMap((child) => {
          const expanded = expand(child);
          return expanded ? [expanded] : [];
        }),
      };
    };
    return expand(id);
  }
}

export interface IpcResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

const splitLines = (): ((chunk: string) => string[]) => {
  let pending = "";
  return (chunk: string): string[] => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    return lines.filter((line) => line.length > 0);
  };
};

/**
 * Async host over the `mygo-ipc` child process (JSON lines on stdio) —
 * the fallback transport when the shared library cannot load. Shares the
 * same Go store, so trees read back identically to the FFI backend.
 */
export class IpcHost {
  private proc: ReturnType<typeof Bun.spawn>;
  private nextId = 1;
  private pending = new Map<number, (response: IpcResponse) => void>();
  private pump: Promise<void>;

  private constructor(proc: ReturnType<typeof Bun.spawn>) {
    this.proc = proc;
    const stdout = proc.stdout;
    if (stdout == null || typeof stdout === "number") {
      throw new Error("mygo-ipc: child process has no piped stdout");
    }
    const takeLines = splitLines();
    const decoder = new TextDecoder();
    this.pump = (async (): Promise<void> => {
      const reader = stdout.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          for (const line of takeLines(decoder.decode(value, { stream: true }))) {
            const response = JSON.parse(line) as IpcResponse;
            this.pending.get(response.id)?.(response);
            this.pending.delete(response.id);
          }
        }
      } catch {
        // Reader closed under us during `close()`; pending callers reject there.
      }
    })();
  }

  /** Launch `binPath` (built by `bun run build:ipc`) and return a host. */
  static launch(binPath: string): IpcHost {
    const proc = Bun.spawn([binPath], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    });
    return new IpcHost(proc);
  }

  private stdin(): FileSink {
    const stdin = this.proc.stdin;
    if (stdin == null || typeof stdin === "number") {
      throw new Error("mygo-ipc: child process has no piped stdin");
    }
    return stdin;
  }

  private request<T>(op: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    const line = `${JSON.stringify({ id, op, ...params })}\n`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, (response) => {
        if (response.ok) {
          resolve(response.result as T);
        } else {
          reject(new Error(response.error ?? "ipc failed"));
        }
      });
      const stdin = this.stdin();
      stdin.write(line);
      stdin.flush();
    });
  }

  version(): Promise<number> {
    return this.request<number>("version");
  }

  reset(): Promise<void> {
    return this.request<void>("reset").then(() => undefined);
  }

  create(kind: string): Promise<number> {
    return this.request<number>("create", { kind });
  }

  setProp(id: number, key: string, value: string): Promise<boolean> {
    return this.request<boolean>("setProp", { node: id, key, value });
  }

  delProp(id: number, key: string): Promise<boolean> {
    return this.request<boolean>("delProp", { node: id, key });
  }

  attach(parent: number, child: number): Promise<boolean> {
    return this.request<boolean>("attach", { parent, child });
  }

  detach(parent: number, child: number): Promise<boolean> {
    return this.request<boolean>("detach", { parent, child });
  }

  remove(id: number): Promise<boolean> {
    return this.request<boolean>("remove", { node: id });
  }

  count(): Promise<number> {
    return this.request<number>("count");
  }

  describe(id: number): Promise<MygoTreeNode> {
    return this.request<MygoTreeNode>("describe", { node: id });
  }

  async close(): Promise<void> {
    this.proc.kill();
    await this.pump.catch(() => undefined);
    for (const resolve of this.pending.values()) {
      resolve({ id: 0, ok: false, error: "closed" });
    }
    this.pending.clear();
  }
}
