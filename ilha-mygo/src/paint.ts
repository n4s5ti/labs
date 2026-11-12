// ilha `PaintOps` over a synchronous mygo host (FFI primary, memory fallback).
//
// The adapter keeps no shadow tree of its own: element identity is the Go
// handle, props live in the store, and `placeChildren` reconciles by
// detaching the current children and attaching the next list in order.
// `createRaw` returns no nodes (same precedent as the pixi host: a retained
// scene graph has no HTML parser). Namespaces are recorded as an `xmlns`
// prop; event props are collected on the element for the app to dispatch.
import { createRenderer } from "ilha/renderer";
import type { FiberLocal, HostRenderer, PaintOps, PropBag, PropValue } from "ilha/renderer";

import type { SyncHost } from "./host.ts";
import { resolveKind } from "./catalogue.ts";
import { warnOnLowercaseEventProp } from "./events.ts";

/** A retained mygo node carrying the element surface ilha's painter needs. */
export class MygoElement {
  readonly ilhaMygo = true as const;
  readonly nodeId: number;
  readonly host: SyncHost;
  tagName: string;
  handlers: Record<string, PropValue> = {};
  /** Opt out of auto-dispose (`dispose={null}` parity; see `markNoDispose`). */
  noDispose = false;

  constructor(host: SyncHost, tag: string) {
    this.host = host;
    this.tagName = tag;
    this.nodeId = host.create(tag);
    track(this);
  }

  /**
   * Wrap an existing store handle without allocating (disposal walks and
   * event-target lookups). The handle must already exist in `host`.
   */
  static __adopt(host: SyncHost, nodeId: number, tag: string): MygoElement {
    const el = Object.create(MygoElement.prototype) as MygoElement;
    (el as { host: SyncHost }).host = host;
    (el as { nodeId: number }).nodeId = nodeId;
    el.tagName = tag;
    el.handlers = {};
    el.noDispose = false;
    track(el);
    return el;
  }

  setAttribute(name: string, value: string): void {
    this.host.setProp(this.nodeId, name, value);
  }

  removeAttribute(name: string): void {
    this.host.delProp(this.nodeId, name);
  }

  append(...nodes: MygoElement[]): void {
    for (const node of nodes) {
      this.host.attach(this.nodeId, node.nodeId);
    }
  }
}

/** A mygo host node is the element itself (`El extends PaintEl<Node> & Node`). */
export type MygoNode = MygoElement;

const liveElements = new WeakMap<SyncHost, Map<number, MygoElement>>();

const track = (el: MygoElement): void => {
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
 * `dispatchMygoEvent` at a mounted node by id.
 */
export const elementFor = (
  host: SyncHost,
  id: number,
): MygoElement | undefined => liveElements.get(host)?.get(id);

const serializeProp = (value: PropValue): string =>
  typeof value === "string" ? value : (JSON.stringify(value) ?? "");

/** Build the shared painter ops over `host`. */
export const createMygoOps = (host: SyncHost): PaintOps<MygoNode, MygoElement> => ({
  createElement: (tag: string, ns?: string) => {
    const el = new MygoElement(host, resolveKind(tag));
    if (ns !== undefined) {
      el.setAttribute("xmlns", ns);
    }
    return el;
  },
  createText: (text: string) => {
    const el = new MygoElement(host, "#text");
    el.setAttribute("text", text);
    return el;
  },
  createRaw: () => [],
  placeChildren: (root, nodes) => {
    const parent = root as unknown as MygoElement;
    const current = host.describe(parent.nodeId)?.children.map((child) => child.id) ?? [];
    for (const id of current) {
      host.detach(parent.nodeId, id);
    }
    for (const node of nodes as MygoNode[]) {
      host.attach(parent.nodeId, node.nodeId);
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
      if (key.startsWith("on") && typeof value === "function") {
        el.handlers[key] = value;
      }
    }
  },
});

/** Host renderer painting ilha views into a mygo retained tree. */
export const createMygoRenderer = (host: SyncHost): HostRenderer<MygoNode> =>
  createRenderer<MygoNode, MygoElement>(createMygoOps(host));
