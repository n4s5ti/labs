import { describe, expect, test } from "bun:test";

import { MemoryHost } from "./host.ts";
import { createMygoOps, createMygoRenderer, MygoElement } from "./paint.ts";

describe("mygoOps", () => {
  test("element, props, and ordered children round-trip", () => {
    const host = new MemoryHost();
    const ops = createMygoOps(host);
    const root = new MygoElement(host, "root");
    const el = ops.createElement("div");
    expect(el.tagName).toBe("Box"); // catalogue resolves div -> Box
    expect(ops.setProp?.(el, "id", "a")).toBe(true);
    ops.setStyle?.(el, "color:red");
    ops.setFormControl?.(el, "value", "v");
    expect(host.describe(el.nodeId)?.props).toEqual({ id: "a", style: "color:red", value: "v" });
    el.removeAttribute("id");
    expect(host.describe(el.nodeId)?.props).toEqual({ style: "color:red", value: "v" });

    const t1 = ops.createText("one");
    const t2 = ops.createText("two");
    expect(t1.tagName).toBe("#text");
    ops.placeChildren(root as unknown as ParentNode, [el, t1, t2] as never);
    expect(host.describe(root.nodeId)?.children.map((c) => c.id)).toEqual([
      el.nodeId,
      t1.nodeId,
      t2.nodeId,
    ]);

    // Reorder + removal reconcile in order.
    ops.placeChildren(root as unknown as ParentNode, [t2, el] as never);
    const kids = host.describe(root.nodeId)?.children ?? [];
    expect(kids.map((c) => c.id)).toEqual([t2.nodeId, el.nodeId]);
    expect(kids[0]?.props).toEqual({ text: "two" });

    expect(ops.createRaw("<p></p>", root as unknown as ParentNode)).toEqual([]);
    expect(ops.committed?.(el)).toBe(el);
  });

  test("namespaces are recorded and events collected", () => {
    const host = new MemoryHost();
    const ops = createMygoOps(host);
    const el = ops.createElement("svg", "http://www.w3.org/2000/svg");
    expect(host.describe(el.nodeId)?.props.xmlns).toBe("http://www.w3.org/2000/svg");
    const onClick = (): void => undefined;
    ops.bindEvents?.(el, { onClick }, null as never);
    expect(el.handlers).toEqual({ onClick });
  });
});

describe("createMygoRenderer", () => {
  test("mounts a view and clears it on unmount", async () => {
    const host = new MemoryHost();
    const renderer = createMygoRenderer(host);
    const root = new MygoElement(host, "root");
    const handle = renderer.mount(root as unknown as ParentNode, () => "hello");
    await handle.ready;
    const kids = host.describe(root.nodeId)?.children ?? [];
    expect(kids.length).toBe(1);
    expect(kids[0]?.kind).toBe("#text");
    expect(kids[0]?.props.text).toBe("hello");
    handle.unmount();
    expect(host.describe(root.nodeId)?.children).toEqual([]);
  });
});
