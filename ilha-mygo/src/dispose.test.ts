import { describe, expect, test } from "bun:test";

import { MemoryHost } from "./host.ts";
import { disposeObject, markNoDispose, NO_DISPOSE_PROP } from "./dispose.ts";
import { MygoElement } from "./paint.ts";

const buildBranch = (host: MemoryHost): MygoElement => {
  const root = new MygoElement(host, "root");
  const a = new MygoElement(host, "Box");
  const b = new MygoElement(host, "Text");
  host.attach(root.nodeId, a.nodeId);
  host.attach(a.nodeId, b.nodeId);
  return root;
};

describe("dispose", () => {
  test("removes the whole subtree from the store", () => {
    const host = new MemoryHost();
    const root = buildBranch(host);
    expect(host.count()).toBe(3);
    disposeObject(root);
    expect(host.count()).toBe(0);
    expect(host.describe(root.nodeId)).toBeNull();
  });

  test("disposing a missing node is a no-op", () => {
    const host = new MemoryHost();
    const ghost = MygoElement.__adopt(host, 999, "Box");
    expect(() => disposeObject(ghost)).not.toThrow();
    expect(host.count()).toBe(0);
  });

  test("markNoDispose detaches but survives", () => {
    const host = new MemoryHost();
    const root = buildBranch(host);
    const kids = host.describe(root.nodeId)?.children ?? [];
    const child = MygoElement.__adopt(host, kids[0].id, kids[0].kind);
    markNoDispose(child);
    expect(host.describe(child.nodeId)?.props[NO_DISPOSE_PROP]).toBe("1");
    disposeObject(root);
    // The flagged branch was detached from the dying root and survives
    // with its own subtree intact.
    expect(host.describe(child.nodeId)?.kind).toBe("Box");
    expect(host.describe(child.nodeId)?.children.length).toBe(1);
    expect(host.describe(root.nodeId)).toBeNull();
  });
});
