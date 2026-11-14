// ilha `PaintOps` over an Asuka-protocol host (FFI primary, memory fallback).
//
// The adapter keeps no shadow tree of its own: element identity is the
// store handle, schema props live in the store, and `placeChildren`
// reconciles with Remove + indexed Insert — the same ops a real Asuka
// host applies, so the recorded batch replays onto one. `createRaw`
// returns no nodes (same precedent as the pixi host: a retained scene
// graph has no HTML parser). `value` maps onto the kind's content prop
// (Title for buttons, Value for fields, Text otherwise); namespaces and
// foreign attributes ride the lab-only attr escape hatch. Event props
// resolve to Asuka event kinds and subscribe host-side via `listen`.
import { createRenderer } from "ilha/renderer";
import type { FiberLocal, HostRenderer, PaintOps, PropBag, PropValue } from "ilha/renderer";

import type { SyncHost } from "./host.ts";
import { STYLE_KEYS } from "./host.ts";
import { defaultStyleFor, kindName, resolveKind } from "./catalogue.ts";
import { eventForProp, warnOnLowercaseEventProp } from "./events.ts";

/** A retained asuka node carrying the element surface ilha's painter needs. */
export class AsukaElement {
  readonly ilhaAsuka = true as const;
  readonly nodeId: number;
  readonly host: SyncHost;
  /** Asuka schema kind ID (View=1, Text=2, …). */
  kind: number;
  /** Tag-style name for the painter contract (Asuka kind name). */
  get tagName(): string {
    return kindName(this.kind);
  }
  handlers: Record<string, PropValue> = {};
  /** Opt out of auto-destroy (`dispose={null}` parity; see `markNoDispose`). */
  noDispose = false;

  constructor(host: SyncHost, kind: number) {
    this.host = host;
    this.kind = kind;
    const id = host.create(kind);
    if (id === 0) {
      throw new Error(`[ilha-asuka] host refused kind ${kind}`);
    }
    this.nodeId = id;
    track(this);
  }

  /**
   * Wrap an existing store handle without allocating (destroy walks and
   * event-target lookups). The handle must already exist in `host`.
   */
  static __adopt(host: SyncHost, nodeId: number, kind: number): AsukaElement {
    const el = Object.create(AsukaElement.prototype) as AsukaElement;
    (el as { host: SyncHost }).host = host;
    (el as { nodeId: number }).nodeId = nodeId;
    el.kind = kind;
    el.handlers = {};
    el.noDispose = false;
    track(el);
    return el;
  }

  /** Typed schema prop ID for `key` on this element's kind, if ilha sends it. */
  static propIdFor(kind: number, key: string): { id: number; type: string } | undefined {
    const table = PROP_TABLE[kind];
    const entry = table?.[key] ?? COMMON_PROPS[key];
    return entry;
  }

  setAttribute(name: string, value: string): void {
    const key = canonicalProp(name);
    const entry = AsukaElement.propIdFor(this.kind, key);
    if (entry !== undefined) {
      setTyped(this.host, this.nodeId, entry, value);
      return;
    }
    if (STYLE_KEYS.has(key)) {
      this.host.setStyle(this.nodeId, key, value);
      return;
    }
    if (key === "value") {
      this.setContentProp(value);
      return;
    }
    this.host.setAttr(this.nodeId, key, value);
  }

  /** Map a `value` prop onto the kind's content prop (Title/Value/Text). */
  setContentProp(value: string): void {
    const key =
      this.kind === 3 ? "Title" : this.kind === 4 ? "Value" : this.kind === 2 ? "Text" : undefined;
    if (key !== undefined) {
      const entry = AsukaElement.propIdFor(this.kind, key);
      if (entry !== undefined) {
        setTyped(this.host, this.nodeId, entry, value);
        return;
      }
    }
    this.host.setAttr(this.nodeId, "value", value);
  }

  removeAttribute(name: string): void {
    this.host.delProp(this.nodeId, canonicalProp(name));
  }

  append(...nodes: AsukaElement[]): void {
    const tree = this.host.describe(this.nodeId);
    let index = tree?.children.length ?? 0;
    for (const node of nodes) {
      if (this.host.insert(this.nodeId, node.nodeId, index)) {
        index += 1;
      }
    }
  }
}

/** Schema props ilha sends, by kind ID: name -> {schema ID, wire type}. */
const PROP_TABLE: Record<number, Record<string, { id: number; type: string }>> = {
  2: { Text: { id: 64, type: "string" } },
  3: {
    Title: { id: 64, type: "string" },
    Variant: { id: 65, type: "enum" },
  },
  4: {
    Value: { id: 64, type: "string" },
    Placeholder: { id: 65, type: "string" },
  },
  5: { On: { id: 64, type: "bool" } },
  6: { Value: { id: 64, type: "float" } },
  15: { Source: { id: 64, type: "string" } },
};

/** Common schema props ilha sends on any kind (canonical Asuka names). */
const COMMON_PROPS: Record<string, { id: number; type: string }> = {
  FontSize: { id: 16, type: "float" },
  Disabled: { id: 20, type: "bool" },
  Hidden: { id: 6, type: "bool" },
  Opacity: { id: 5, type: "float" },
  TextAlign: { id: 18, type: "enum" },
  LineLimit: { id: 19, type: "int" },
};

/** camelCase aliases ilha accepts for the canonical common prop names. */
const PROP_ALIASES: Record<string, string> = {
  fontSize: "FontSize",
  disabled: "Disabled",
  hidden: "Hidden",
  opacity: "Opacity",
  textAlign: "TextAlign",
  lineLimit: "LineLimit",
};

const canonicalProp = (key: string): string => PROP_ALIASES[key] ?? key;

/** Asuka enum value tables ilha accepts by prop name. */
const ENUM_VALUES: Record<string, string[]> = {
  Variant: ["Plain", "Filled", "Tinted", "Gray", "Bordered", "Glass", "GlassProminent"],
  TextAlign: ["Start", "Center", "End", "Justify"],
};

const setTyped = (
  host: SyncHost,
  id: number,
  entry: { id: number; type: string },
  value: string,
): void => {
  switch (entry.type) {
    case "enum": {
      const names = ENUM_VALUES[entry.id === 65 ? "Variant" : "TextAlign"] ?? [];
      const index = names.indexOf(value);
      host.setEnum(id, entry.id, index >= 0 ? index : Number(value));
      return;
    }
    case "bool": {
      host.setBool(id, entry.id, value === "true" || value === "1");
      return;
    }
    case "int": {
      host.setInt(id, entry.id, Number(value));
      return;
    }
    case "float": {
      host.setFloat(id, entry.id, Number(value));
      return;
    }
    default: {
      host.setString(id, entry.id, value);
    }
  }
};

/** A asuka host node is the element itself (`El extends PaintEl<Node> & Node`). */
export type AsukaNode = AsukaElement;

const liveElements = new WeakMap<SyncHost, Map<number, AsukaElement>>();

const track = (el: AsukaElement): void => {
  let byId = liveElements.get(el.host);
  if (byId === undefined) {
    byId = new Map();
    liveElements.set(el.host, byId);
  }
  // First wrapper wins: the renderer's element (carrying handlers) stays
  // primary over later `__adopt` walk wrappers for the same handle.
  if (!byId.has(el.nodeId)) {
    byId.set(el.nodeId, el);
  }
};

/**
 * Look up the live element wrapper for a store handle — the instance the
 * renderer created, carrying its collected event handlers. Used to target
 * `dispatchAsukaEvent` at a mounted node by id.
 */
export const elementFor = (
  host: SyncHost,
  id: number,
): AsukaElement | undefined => liveElements.get(host)?.get(id);

const serializeProp = (value: PropValue): string =>
  typeof value === "string" ? value : (JSON.stringify(value) ?? "");

/** Build the shared painter ops over `host`. */
export const createAsukaOps = (host: SyncHost): PaintOps<AsukaNode, AsukaElement> => ({
  createElement: (tag: string, ns?: string) => {
    const kind = resolveKind(tag);
    const el = new AsukaElement(host, kind);
    for (const [key, value] of Object.entries(defaultStyleFor(tag))) {
      el.setAttribute(key, value);
    }
    if (ns !== undefined) {
      el.setAttribute("xmlns", ns);
    }
    return el;
  },
  createText: (text: string) => {
    const el = new AsukaElement(host, 2);
    el.setAttribute("Text", text);
    return el;
  },
  createRaw: () => [],
  placeChildren: (root, nodes) => {
    const parent = root as unknown as AsukaElement;
    const current = parent.host.describe(parent.nodeId)?.children.map((child) => child.id) ?? [];
    const next = (nodes as AsukaNode[]).map((node) => node.nodeId);
    const wanted = new Set(next);
    // Detach everything the next list drops, then re-insert in order.
    // Insert refuses parented children, so moves re-attach explicitly —
    // exactly what a real Asuka host requires.
    for (const id of current) {
      if (!wanted.has(id)) {
        parent.host.remove(parent.nodeId, id);
      }
    }
    const live = new Set(
      parent.host.describe(parent.nodeId)?.children.map((child) => child.id) ?? [],
    );
    let index = 0;
    for (const node of nodes as AsukaNode[]) {
      if (live.has(node.nodeId)) {
        parent.host.remove(parent.nodeId, node.nodeId);
      }
      if (parent.host.insert(parent.nodeId, node.nodeId, index)) {
        index += 1;
      }
    }
  },
  setProp: (el, key, value) => {
    el.setAttribute(key, serializeProp(value));
    return true;
  },
  setStyle: (el, css) => {
    el.setAttribute("style", css);
  },
  setFormControl: (el, key, v) => {
    el.setAttribute(key, serializeProp(v));
  },
  committed: (el) => el,
  bindEvents: (el, props: PropBag, _fiber: FiberLocal) => {
    void _fiber;
    for (const [key, value] of Object.entries(props)) {
      warnOnLowercaseEventProp(key);
      if (!key.startsWith("on") || typeof value !== "function") {
        continue;
      }
      const event = eventForProp(key, el.kind);
      if (event === undefined) {
        continue;
      }
      el.handlers[event.name] = value;
      el.host.listen(el.nodeId, event.id);
    }
  },
});

/** Host renderer painting ilha views into an Asuka-protocol tree. */
export const createAsukaRenderer = (host: SyncHost): HostRenderer<AsukaNode> =>
  createRenderer<AsukaNode, AsukaElement>(createAsukaOps(host));
