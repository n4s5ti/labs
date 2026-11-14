import { describe, expect, test } from "bun:test";

import { MemoryHost } from "./host.ts";
import { createAsukaOps, createAsukaRenderer, AsukaElement } from "./paint.ts";

describe("asukaOps", () => {
  test("element, props, and ordered children round-trip", () => {
    const host = new MemoryHost();
    const ops = createAsukaOps(host);
    const root = new AsukaElement(host, 1);
    const el = ops.createElement("div");
    expect(el.kind).toBe(1); // catalogue resolves div -> View
    expect(ops.setProp?.(el, "id", "a")).toBe(true);
    ops.setStyle?.(el, "color:red");
    ops.setFormControl?.(el, "value", "v");
    expect(host.describe(el.nodeId)?.props).toEqual({ id: "a", style: "color:red", value: "v" });
    el.removeAttribute("id");
    expect(host.describe(el.nodeId)?.props).toEqual({ style: "color:red", value: "v" });

    // Row tags imply their layout direction.
    const row = ops.createElement("row");
    expect(host.describe(row.nodeId)?.props).toMatchObject({ direction: "row" });

    const t1 = ops.createText("one");
    const t2 = ops.createText("two");
    expect(t1.kind).toBe(2);
    expect(host.describe(t1.nodeId)?.props).toEqual({ Text: "one" });
    ops.placeChildren(root as unknown as ParentNode, [el, t1, t2] as never);
    expect(host.describe(root.nodeId)?.children.map((c) => c.id)).toEqual([
      el.nodeId,
      t1.nodeId,
      t2.nodeId,
    ]);

    // Reorder + removal reconcile in order through indexed inserts.
    ops.placeChildren(root as unknown as ParentNode, [t2, el] as never);
    const kids = host.describe(root.nodeId)?.children ?? [];
    expect(kids.map((c) => c.id)).toEqual([t2.nodeId, el.nodeId]);
    expect(kids[0]?.props).toEqual({ Text: "two" });

    expect(ops.createRaw("<p></p>", root as unknown as ParentNode)).toEqual([]);
    expect(ops.committed?.(el)).toBe(el);
  });

  test("content props, enums and events route to the schema", () => {
    const host = new MemoryHost();
    const ops = createAsukaOps(host);
    const button = ops.createElement("button");
    expect(button.kind).toBe(3);
    ops.setProp?.(button, "value", "press");
    ops.setProp?.(button, "Variant", "Filled");
    expect(host.describe(button.nodeId)?.props).toMatchObject({
      Title: "press",
      Variant: 1,
    });
    const field = ops.createElement("asukaInput");
    expect(field.kind).toBe(4);
    ops.setProp?.(field, "value", "name");
    expect(host.describe(field.nodeId)?.props).toMatchObject({ Value: "name" });
    // camelCase aliases describe under canonical Asuka names.
    ops.setProp?.(button, "fontSize", "18");
    expect(host.describe(button.nodeId)?.props).toMatchObject({ FontSize: 18 });

    const svg = ops.createElement("svg", "http://www.w3.org/2000/svg");
    expect(host.describe(svg.nodeId)?.props.xmlns).toBe("http://www.w3.org/2000/svg");
    const onClick = (): void => undefined;
    ops.bindEvents?.(button, { onClick }, null as never);
    expect(button.handlers).toEqual({ Press: onClick });
    expect(host.describe(button.nodeId)?.listens).toEqual(["Press"]);
  });
});

describe("createAsukaRenderer", () => {
  test("mounts a view and clears it on unmount", async () => {
    const host = new MemoryHost();
    const renderer = createAsukaRenderer(host);
    const root = new AsukaElement(host, 1);
    const handle = renderer.mount(root as unknown as ParentNode, () => "hello");
    await handle.ready;
    const kids = host.describe(root.nodeId)?.children ?? [];
    expect(kids.length).toBe(1);
    expect(kids[0]?.kind).toBe("Text");
    expect(kids[0]?.props.Text).toBe("hello");
    handle.unmount();
    expect(host.describe(root.nodeId)?.children).toEqual([]);
  });
});
