// Sync retained-host surface over the Asuka op protocol.
//
// The FFI backend is primary: every method is a synchronous `dlopen`
// call into `go/libasuka.so`, which is exactly what ilha's synchronous
// `PaintOps` needs. `MemoryHost` mirrors Go semantics in pure TypeScript
// for tests and for environments without the compiled library — its
// layout pass is a documented structural approximation (row/column
// stacking with stretch), while the Go engine (Asuka's own flexbox) is
// the source of truth. The child-process fallback (`IpcHost`) is async
// by nature and drives the same Go store over stdio.
import { dlopen } from "bun:ffi";
import type { FileSink } from "bun";

/** Recursive tree snapshot served by `describe`. */
export interface AsukaTreeNode {
  readonly id: number;
  readonly kind: string;
  readonly kindId: number;
  readonly props: Record<string, string | number | boolean>;
  readonly children: AsukaTreeNode[];
  /** Last layout frame: x, y, width, height in points. */
  readonly frame: [number, number, number, number];
  /** Host event subscriptions on the node, by Asuka name. */
  readonly listens: string[];
}

/** Style keys the core consumes as layout inputs (never batched). */
export const STYLE_KEYS = new Set([
  "direction",
  "wrap",
  "gap",
  "padding",
  "width",
  "height",
  "align",
  "justify",
  "grow",
  "shrink",
]);

/** Synchronous retained-host operations. Handles start at 1; 0 is never valid. */
export interface SyncHost {
  readonly backend: "ffi" | "memory";
  version(): number;
  reset(): void;
  create(kind: number): number;
  setString(id: number, prop: number, value: string): boolean;
  setInt(id: number, prop: number, value: number): boolean;
  setFloat(id: number, prop: number, value: number): boolean;
  setBool(id: number, prop: number, value: boolean): boolean;
  setEnum(id: number, prop: number, value: number): boolean;
  setStyle(id: number, key: string, value: string): boolean;
  setAttr(id: number, key: string, value: string): boolean;
  delProp(id: number, key: string): boolean;
  insert(parent: number, child: number, index: number): boolean;
  remove(parent: number, child: number): boolean;
  destroy(id: number): boolean;
  listen(id: number, event: number): boolean;
  unlisten(id: number, event: number): boolean;
  setRoot(id: number): boolean;
  /** Run the layout engine over the subtree; returns changed frames. */
  layout(root: number, width: number, height: number): number;
  /** The recorded op log, one Asuka op string per entry. */
  ops(): string[];
  count(): number;
  describe(id: number): AsukaTreeNode | null;
}

const toNumber = (value: bigint | number): number => Number(value);

const loadLibrary = (libPath: string) =>
  dlopen(libPath, {
    AsukaVersion: { args: [], returns: "i64" },
    AsukaReset: { args: [], returns: "void" },
    AsukaCreate: { args: ["i32"], returns: "i64" },
    AsukaSetString: { args: ["i64", "i32", "cstring"], returns: "i32" },
    AsukaSetInt: { args: ["i64", "i32", "i64"], returns: "i32" },
    AsukaSetFloat: { args: ["i64", "i32", "f64"], returns: "i32" },
    AsukaSetBool: { args: ["i64", "i32", "i32"], returns: "i32" },
    AsukaSetEnum: { args: ["i64", "i32", "i32"], returns: "i32" },
    AsukaSetStyle: { args: ["i64", "cstring", "cstring"], returns: "i32" },
    AsukaSetAttr: { args: ["i64", "cstring", "cstring"], returns: "i32" },
    AsukaDelProp: { args: ["i64", "cstring"], returns: "i32" },
    AsukaInsert: { args: ["i64", "i64", "i32"], returns: "i32" },
    AsukaRemove: { args: ["i64", "i64"], returns: "i32" },
    AsukaDestroy: { args: ["i64"], returns: "i32" },
    AsukaListen: { args: ["i64", "i32"], returns: "i32" },
    AsukaUnlisten: { args: ["i64", "i32"], returns: "i32" },
    AsukaSetRoot: { args: ["i64"], returns: "i32" },
    AsukaLayout: { args: ["i64", "f32", "f32"], returns: "i32" },
    AsukaCount: { args: [], returns: "i64" },
    AsukaDescribeInto: { args: ["i64", "buffer", "i64"], returns: "i64" },
    AsukaOpsInto: { args: ["buffer", "i64"], returns: "i64" },
  });

type AsukaLib = ReturnType<typeof loadLibrary>;

/** `SyncHost` over the compiled Go shared library via `bun:ffi`. */
export class FfiHost implements SyncHost {
  readonly backend = "ffi" as const;
  private lib: AsukaLib;
  private scratch = Buffer.alloc(64 * 1024);

  private constructor(lib: AsukaLib) {
    this.lib = lib;
  }

  /** Open `libPath` (e.g. `go/libasuka.so`, built by `bun run build:lib`). */
  static open(libPath: string): FfiHost {
    return new FfiHost(loadLibrary(libPath));
  }

  version(): number {
    return toNumber(this.lib.symbols.AsukaVersion());
  }

  reset(): void {
    this.lib.symbols.AsukaReset();
  }

  create(kind: number): number {
    return toNumber(this.lib.symbols.AsukaCreate(kind));
  }

  setString(id: number, prop: number, value: string): boolean {
    return this.lib.symbols.AsukaSetString(id, prop, value) === 1;
  }

  setInt(id: number, prop: number, value: number): boolean {
    return this.lib.symbols.AsukaSetInt(id, prop, Math.trunc(value)) === 1;
  }

  setFloat(id: number, prop: number, value: number): boolean {
    return this.lib.symbols.AsukaSetFloat(id, prop, value) === 1;
  }

  setBool(id: number, prop: number, value: boolean): boolean {
    return this.lib.symbols.AsukaSetBool(id, prop, value ? 1 : 0) === 1;
  }

  setEnum(id: number, prop: number, value: number): boolean {
    return this.lib.symbols.AsukaSetEnum(id, prop, Math.trunc(value)) === 1;
  }

  setStyle(id: number, key: string, value: string): boolean {
    return this.lib.symbols.AsukaSetStyle(id, key, value) === 1;
  }

  setAttr(id: number, key: string, value: string): boolean {
    return this.lib.symbols.AsukaSetAttr(id, key, value) === 1;
  }

  delProp(id: number, key: string): boolean {
    return this.lib.symbols.AsukaDelProp(id, key) === 1;
  }

  insert(parent: number, child: number, index: number): boolean {
    return this.lib.symbols.AsukaInsert(parent, child, Math.trunc(index)) === 1;
  }

  remove(parent: number, child: number): boolean {
    return this.lib.symbols.AsukaRemove(parent, child) === 1;
  }

  destroy(id: number): boolean {
    return this.lib.symbols.AsukaDestroy(id) === 1;
  }

  listen(id: number, event: number): boolean {
    return this.lib.symbols.AsukaListen(id, event) === 1;
  }

  unlisten(id: number, event: number): boolean {
    return this.lib.symbols.AsukaUnlisten(id, event) === 1;
  }

  setRoot(id: number): boolean {
    return this.lib.symbols.AsukaSetRoot(id) === 1;
  }

  layout(root: number, width: number, height: number): number {
    return toNumber(this.lib.symbols.AsukaLayout(root, width, height));
  }

  count(): number {
    return toNumber(this.lib.symbols.AsukaCount());
  }

  private readInto(read: (buf: Buffer, cap: bigint) => bigint | number): string | null {
    for (;;) {
      const n = toNumber(read(this.scratch, BigInt(this.scratch.length)));
      if (n === -1) {
        return null;
      }
      if (n >= this.scratch.length) {
        this.scratch = Buffer.alloc(n);
        continue;
      }
      return this.scratch.subarray(0, n).toString();
    }
  }

  describe(id: number): AsukaTreeNode | null {
    const raw = this.readInto((buf, cap) =>
      this.lib.symbols.AsukaDescribeInto(id, buf, cap),
    );
    return raw === null ? null : (JSON.parse(raw) as AsukaTreeNode);
  }

  ops(): string[] {
    const raw = this.readInto((buf, cap) => this.lib.symbols.AsukaOpsInto(buf, cap));
    return raw === null || raw === "" ? [] : raw.split("\n");
  }

  close(): void {
    this.lib.close();
  }
}

interface MemoryNode {
  kind: number;
  props: Map<number, string | number | boolean>;
  attrs: Map<string, string>;
  style: Map<string, string>;
  children: number[];
  listens: Set<number>;
  frame: [number, number, number, number];
}

/** Trim floats for op-log readability (the FFI log is canonical). */
const fmtN = (n: number): string => `${Math.round(n * 1000) / 1000}`;

/** Pure-TypeScript `SyncHost` with identical protocol semantics to the Go store. */
export class MemoryHost implements SyncHost {
  readonly backend = "memory" as const;
  private next = 1;
  private nodes = new Map<number, MemoryNode>();
  private root = 0;
  private log: string[] = [];

  version(): number {
    return 2;
  }

  reset(): void {
    this.next = 1;
    this.nodes.clear();
    this.root = 0;
    this.log = [];
  }

  create(kind: number): number {
    if (!(kind in MemoryHost.KIND_NAMES)) {
      return 0;
    }
    const id = this.next++;
    this.nodes.set(id, {
      kind,
      props: new Map(),
      attrs: new Map(),
      style: new Map(),
      children: [],
      listens: new Set(),
      frame: [0, 0, 0, 0],
    });
    this.log.push(`Create ${id} ${MemoryHost.KIND_NAMES[kind]}`);
    return id;
  }

  private static KIND_NAMES: Record<number, string> = {
    1: "View",
    2: "Text",
    3: "Button",
    4: "TextField",
    5: "Toggle",
    6: "Slider",
    7: "Scroll",
    15: "Image",
  };

  private static EVENT_NAMES: Record<number, string> = {
    1: "Press",
    2: "LongPress",
    3: "TextChanged",
    4: "Submit",
    5: "Focus",
    6: "Blur",
    7: "Toggled",
    8: "ValueChanged",
  };

  setString(id: number, prop: number, value: string): boolean {
    return this.setTyped(id, prop, "string", value);
  }

  setInt(id: number, prop: number, value: number): boolean {
    return this.setTyped(id, prop, "int", Math.trunc(value));
  }

  setFloat(id: number, prop: number, value: number): boolean {
    return this.setTyped(id, prop, "float", value);
  }

  setBool(id: number, prop: number, value: boolean): boolean {
    return this.setTyped(id, prop, "bool", value);
  }

  setEnum(id: number, prop: number, value: number): boolean {
    return this.setTyped(id, prop, "enum", Math.trunc(value));
  }

  private setTyped(
    id: number,
    prop: number,
    type: string,
    value: string | number | boolean,
  ): boolean {
    const node = this.nodes.get(id);
    if (node === undefined || MemoryHost.propType(node.kind, prop) !== type) {
      return false;
    }
    node.props.set(prop, value);
    const shown = typeof value === "string" ? JSON.stringify(value) : `${value}`;
    this.log.push(`SetProp ${id} ${MemoryHost.propName(node.kind, prop)}=${shown}`);
    return true;
  }

  /** Mirror of the schema subset ilha sends (kind -> name -> wire type). */
  private static PROP_TYPES: Record<number, Record<string, string>> = {
    1: { FontSize: "float", Disabled: "bool", Hidden: "bool", Opacity: "float", TextAlign: "enum", LineLimit: "int" },
    2: { Text: "string" },
    3: { Title: "string", Variant: "enum" },
    4: { Value: "string", Placeholder: "string" },
    5: { On: "bool" },
    6: { Value: "float" },
    15: { Source: "string" },
  };

  private static PROP_IDS: Record<number, Record<string, number>> = {
    1: { FontSize: 16, Disabled: 20, Hidden: 6, Opacity: 5, TextAlign: 18, LineLimit: 19 },
    2: { Text: 64 },
    3: { Title: 64, Variant: 65 },
    4: { Value: 64, Placeholder: 65 },
    5: { On: 64 },
    6: { Value: 64 },
    15: { Source: 64 },
  };

  private static COMMON: Record<string, { id: number; type: string }> = {
    FontSize: { id: 16, type: "float" },
    Disabled: { id: 20, type: "bool" },
    Hidden: { id: 6, type: "bool" },
    Opacity: { id: 5, type: "float" },
    TextAlign: { id: 18, type: "enum" },
    LineLimit: { id: 19, type: "int" },
  };

  private static propType(kind: number, prop: number): string | undefined {
    for (const [name, entry] of Object.entries(MemoryHost.PROP_IDS[kind] ?? {})) {
      if (entry === prop) {
        return MemoryHost.PROP_TYPES[kind]?.[name];
      }
    }
    for (const entry of Object.values(MemoryHost.COMMON)) {
      if (entry.id === prop) {
        return entry.type;
      }
    }
    return undefined;
  }

  private static propName(kind: number, prop: number): string {
    for (const [name, entry] of Object.entries(MemoryHost.PROP_IDS[kind] ?? {})) {
      if (entry === prop) {
        return name;
      }
    }
    for (const [name, entry] of Object.entries(MemoryHost.COMMON)) {
      if (entry.id === prop) {
        return name;
      }
    }
    return `Prop(${prop})`;
  }

  setStyle(id: number, key: string, value: string): boolean {
    const node = this.nodes.get(id);
    if (node === undefined) {
      return false;
    }
    node.style.set(key, value);
    return true;
  }

  setAttr(id: number, key: string, value: string): boolean {
    const node = this.nodes.get(id);
    if (node === undefined) {
      return false;
    }
    node.attrs.set(key, value);
    return true;
  }

  delProp(id: number, key: string): boolean {
    const node = this.nodes.get(id);
    if (node === undefined) {
      return false;
    }
    const tabled =
      MemoryHost.PROP_IDS[node.kind]?.[key] ?? MemoryHost.COMMON[key]?.id;
    if (tabled !== undefined) {
      node.props.delete(tabled);
      return true;
    }
    if (STYLE_KEYS.has(key)) {
      node.style.delete(key);
      return true;
    }
    node.attrs.delete(key);
    return true;
  }

  private parentOf(id: number): number | undefined {
    for (const [pid, node] of this.nodes) {
      if (node.children.includes(id)) {
        return pid;
      }
    }
    return undefined;
  }

  private reaches(id: number, ancestor: number): boolean {
    if (id === ancestor) {
      return true;
    }
    const node = this.nodes.get(ancestor);
    if (node === undefined) {
      return false;
    }
    return node.children.some((child) => this.reaches(id, child));
  }

  insert(parent: number, child: number, index: number): boolean {
    const p = this.nodes.get(parent);
    if (p === undefined || !this.nodes.has(child)) {
      return false;
    }
    if (this.parentOf(child) !== undefined || this.reaches(parent, child)) {
      return false;
    }
    if (p.kind === 7 && p.children.length > 0) {
      return false;
    }
    const at = Math.max(0, Math.min(Math.trunc(index), p.children.length));
    p.children.splice(at, 0, child);
    this.log.push(`Insert ${parent} ${child} @${at}`);
    return true;
  }

  remove(parent: number, child: number): boolean {
    const p = this.nodes.get(parent);
    if (p === undefined || !this.nodes.has(child)) {
      return false;
    }
    const at = p.children.indexOf(child);
    if (at < 0) {
      return false;
    }
    p.children.splice(at, 1);
    this.log.push(`Remove ${parent} ${child}`);
    return true;
  }

  destroy(id: number): boolean {
    if (!this.nodes.has(id)) {
      return false;
    }
    const parent = this.parentOf(id);
    if (parent !== undefined) {
      this.remove(parent, id);
    }
    const drop = (nodeId: number): void => {
      const node = this.nodes.get(nodeId);
      if (node === undefined) {
        return;
      }
      this.nodes.delete(nodeId);
      for (const child of [...node.children]) {
        drop(child);
      }
      this.log.push(`Destroy ${nodeId}`);
    };
    drop(id);
    if (this.root === id) {
      this.root = 0;
    }
    return true;
  }

  listen(id: number, event: number): boolean {
    const node = this.nodes.get(id);
    if (node === undefined || MemoryHost.EVENT_NAMES[event] === undefined) {
      return false;
    }
    node.listens.add(event);
    this.log.push(`Listen ${id} ${MemoryHost.EVENT_NAMES[event]}`);
    return true;
  }

  unlisten(id: number, event: number): boolean {
    const node = this.nodes.get(id);
    if (node === undefined || MemoryHost.EVENT_NAMES[event] === undefined) {
      return false;
    }
    node.listens.delete(event);
    return true;
  }

  setRoot(id: number): boolean {
    if (!this.nodes.has(id)) {
      return false;
    }
    this.root = id;
    this.log.push(`SetRoot ${id}`);
    return true;
  }

  private num(key: string | undefined, fallback: number): number {
    if (key === undefined) {
      return fallback;
    }
    const v = Number(key);
    return Number.isFinite(v) ? v : fallback;
  }

  private measure(id: number, availW: number): [number, number] {
    const node = this.nodes.get(id);
    if (node === undefined) {
      return [0, 0];
    }
    const fontSize = typeof node.props.get(16) === "number"
      ? (node.props.get(16) as number)
      : 16;
    const styleW = node.style.get("width");
    const styleH = node.style.get("height");
    const textOf = (...names: string[]): string => {
      const table = MemoryHost.PROP_IDS[node.kind] ?? {};
      for (const name of names) {
        const pid = table[name];
        if (pid !== undefined) {
          const v = node.props.get(pid);
          if (typeof v === "string") {
            return v;
          }
        }
      }
      return "";
    };
    switch (node.kind) {
      case 2: {
        const lines = textOf("Text").split("\n");
        let w = 0;
        for (const line of lines) {
          w = Math.max(w, line.length * fontSize * 0.6);
        }
        return [w, lines.length * fontSize * 1.2];
      }
      case 3: {
        const s = textOf("Title").split("\n");
        let w = 0;
        for (const line of s) {
          w = Math.max(w, line.length * fontSize * 0.6);
        }
        return [w + 24, Math.max(s.length * fontSize * 1.2 + 20, 28)];
      }
      case 4: {
        const content = textOf("Value", "Placeholder");
        const w = styleW === undefined
          ? Math.max(content.length * fontSize * 0.6 + 24, 200)
          : this.num(styleW, 200);
        return [w, styleH === undefined ? 36 : this.num(styleH, 36)];
      }
      case 15:
        return [
          styleW === undefined ? 64 : this.num(styleW, 64),
          styleH === undefined ? 64 : this.num(styleH, 64),
        ];
      case 5:
        return [51, 31];
      case 6:
        return [Number.isFinite(availW) && availW > 0 ? availW : 200, 30];
      default:
        return [0, 0];
    }
  }

  layout(root: number, width: number, height: number): number {
    if (!this.nodes.has(root)) {
      return 0;
    }
    // Structural approximation of the Go engine: row/column stacking
    // with padding, gap and stretch-to-widest. Frames agree structurally
    // (order, stacking, containment); exact floats come from Go.
    let changed = 0;
    const place = (id: number, x: number, y: number, availW: number): [number, number] => {
      const node = this.nodes.get(id);
      if (node === undefined) {
        return [0, 0];
      }
      const styleW = node.style.get("width");
      const styleH = node.style.get("height");
      const pad = this.num(node.style.get("padding"), 0);
      const gap = this.num(node.style.get("gap"), 0);
      if (node.children.length === 0) {
        const [mw, mh] = this.measure(id, availW - pad * 2);
        const w = styleW === undefined ? mw : this.num(styleW, mw);
        const h = styleH === undefined ? mh : this.num(styleH, mh);
        node.frame = [x, y, w, h];
        this.log.push(`SetFrame ${id} ${fmtN(x)},${fmtN(y)} ${fmtN(w)}x${fmtN(h)}`);
        changed += 1;
        return [w, h];
      }
      const direction = node.style.get("direction") ?? "row";
      const kids = node.children.map((c) => ({ id: c, size: this.measure(c, availW) as [number, number] }));
      let w = 0;
      let h = 0;
      if (direction === "column") {
        w = Math.max(0, ...kids.map((k) => k.size[0]));
        h = kids.reduce((sum, k) => sum + k.size[1], 0) + gap * Math.max(0, kids.length - 1);
      } else {
        w = kids.reduce((sum, k) => sum + k.size[0], 0) + gap * Math.max(0, kids.length - 1);
        h = Math.max(0, ...kids.map((k) => k.size[1]));
      }
      w = styleW === undefined ? w + pad * 2 : this.num(styleW, w);
      h = styleH === undefined ? h + pad * 2 : this.num(styleH, h);
      node.frame = [x, y, w, h];
      this.log.push(`SetFrame ${id} ${fmtN(x)},${fmtN(y)} ${fmtN(w)}x${fmtN(h)}`);
      changed += 1;
      let cx = x + pad;
      let cy = y + pad;
      for (const k of kids) {
        const kw = direction === "column" ? Math.max(w - pad * 2, k.size[0]) : k.size[0];
        const kh = direction === "row" ? Math.max(h - pad * 2, k.size[1]) : k.size[1];
        const child = this.nodes.get(k.id);
        if (child !== undefined && child.children.length > 0) {
          place(k.id, cx, cy, kw);
        } else if (child !== undefined) {
          child.frame = [cx, cy, kw, kh];
          this.log.push(`SetFrame ${k.id} ${fmtN(cx)},${fmtN(cy)} ${fmtN(kw)}x${fmtN(kh)}`);
          changed += 1;
        }
        if (direction === "column") {
          cy += kh + gap;
        } else {
          cx += kw + gap;
        }
      }
      return [w, h];
    };
    place(root, 0, 0, width);
    const r = this.nodes.get(root);
    if (r !== undefined) {
      r.frame = [0, 0, width, height];
    }
    void height;
    return changed;
  }

  ops(): string[] {
    return [...this.log];
  }

  count(): number {
    return this.nodes.size;
  }

  describe(id: number): AsukaTreeNode | null {
    const expand = (nodeId: number): AsukaTreeNode | null => {
      const node = this.nodes.get(nodeId);
      if (node === undefined) {
        return null;
      }
      const props: Record<string, string | number | boolean> = {};
      const table = MemoryHost.PROP_IDS[node.kind] ?? {};
      for (const [name, pid] of Object.entries(table)) {
        const v = node.props.get(pid);
        if (v !== undefined) {
          props[name] = v;
        }
      }
      for (const [name, entry] of Object.entries(MemoryHost.COMMON)) {
        const v = node.props.get(entry.id);
        if (v !== undefined) {
          props[name] = v;
        }
      }
      for (const [k, v] of node.style) {
        props[k] = v;
      }
      for (const [k, v] of node.attrs) {
        props[k] = v;
      }
      return {
        id: nodeId,
        kind: MemoryHost.KIND_NAMES[node.kind] ?? `Kind(${node.kind})`,
        kindId: node.kind,
        props,
        children: node.children.flatMap((child) => {
          const expanded = expand(child);
          return expanded ? [expanded] : [];
        }),
        frame: [...node.frame] as [number, number, number, number],
        listens: [...node.listens].flatMap((e) => {
          const name = MemoryHost.EVENT_NAMES[e];
          return name === undefined ? [] : [name];
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
 * Async host over the `asuka-ipc` child process (JSON lines on stdio) —
 * the fallback transport when the shared library cannot load. Shares
 * the same Go store, so trees read back identically to the FFI backend.
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
      throw new Error("asuka-ipc: child process has no piped stdout");
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
      throw new Error("asuka-ipc: child process has no piped stdin");
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

  create(kind: number): Promise<number> {
    return this.request<number>("create", { kind });
  }

  setString(id: number, prop: number, value: string): Promise<boolean> {
    return this.request<boolean>("setString", { node: id, prop, value });
  }

  setInt(id: number, prop: number, value: number): Promise<boolean> {
    return this.request<boolean>("setInt", { node: id, prop, int: Math.trunc(value) });
  }

  setFloat(id: number, prop: number, value: number): Promise<boolean> {
    return this.request<boolean>("setFloat", { node: id, prop, float: value });
  }

  setBool(id: number, prop: number, value: boolean): Promise<boolean> {
    return this.request<boolean>("setBool", { node: id, prop, bool: value });
  }

  setEnum(id: number, prop: number, value: number): Promise<boolean> {
    return this.request<boolean>("setEnum", { node: id, prop, int: Math.trunc(value) });
  }

  setStyle(id: number, key: string, value: string): Promise<boolean> {
    return this.request<boolean>("setStyle", { node: id, key, value });
  }

  setAttr(id: number, key: string, value: string): Promise<boolean> {
    return this.request<boolean>("setAttr", { node: id, key, value });
  }

  delProp(id: number, key: string): Promise<boolean> {
    return this.request<boolean>("delProp", { node: id, key });
  }

  insert(parent: number, child: number, index: number): Promise<boolean> {
    return this.request<boolean>("insert", { parent, child, index: Math.trunc(index) });
  }

  remove(parent: number, child: number): Promise<boolean> {
    return this.request<boolean>("remove", { parent, child });
  }

  destroy(id: number): Promise<boolean> {
    return this.request<boolean>("destroy", { node: id });
  }

  listen(id: number, event: number): Promise<boolean> {
    return this.request<boolean>("listen", { node: id, event });
  }

  unlisten(id: number, event: number): Promise<boolean> {
    return this.request<boolean>("unlisten", { node: id, event });
  }

  setRoot(id: number): Promise<boolean> {
    return this.request<boolean>("setRoot", { node: id });
  }

  layout(root: number, width: number, height: number): Promise<number> {
    return this.request<number>("layout", { node: root, width, height });
  }

  ops(): Promise<string[]> {
    return this.request<string[]>("ops");
  }

  count(): Promise<number> {
    return this.request<number>("count");
  }

  describe(id: number): Promise<AsukaTreeNode> {
    return this.request<AsukaTreeNode>("describe", { node: id });
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
