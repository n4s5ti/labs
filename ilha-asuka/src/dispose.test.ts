import { describe, expect, test } from "bun:test";

import { MemoryHost } from "./host.ts";
import { disposeObject, markNoDispose, NO_DISPOSE_PROP } from "./dispose.ts";
import { AsukaElement } from "./paint.ts";

const buildBranch = (host: MemoryHost): AsukaElement => {
  const root = new AsukaElement(host, 1);
  const a = new AsukaElement(host, 1);
  const b = new AsukaElement(host, 2);
  host.insert(root.nodeId, a.nodeId, 0);
  host.insert(a.nodeId, b.nodeId, 0);
  return root;
};

describe("dispose", () => {
  test("destroys the whole subtree from the store", () => {
    const host = new MemoryHost();
    const root = buildBranch(host);
    expect(host.count()).toBe(3);
    disposeObject(root);
    expect(host.count()).toBe(0);
    expect(host.describe(root.nodeId)).toBeNull();
  });

  test("disposing a missing node is a no-op", () => {
    const host = new MemoryHost();
    const ghost = AsukaElement.__adopt(host, 999, 1);
    expect(() => disposeObject(ghost)).not.toThrow();
    expect(host.count()).toBe(0);
  });

  test("markNoDispose detaches but survives", () => {
    const host = new MemoryHost();
    const root = buildBranch(host);
    const kids = host.describe(root.nodeId)?.children ?? [];
    const child = AsukaElement.__adopt(host, kids[0].id, kids[0].kindId);
    markNoDispose(child);
    expect(host.describe(child.nodeId)?.props[NO_DISPOSE_PROP]).toBe("1");
    disposeObject(root);
    // The flagged branch was detached from the dying root and survives
    // with its own subtree intact.
    expect(host.describe(child.nodeId)?.kind).toBe("View");
    expect(host.describe(child.nodeId)?.children.length).toBe(1);
    expect(host.describe(root.nodeId)).toBeNull();
  });
});
