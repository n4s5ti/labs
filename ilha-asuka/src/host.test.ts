import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { FfiHost, IpcHost, MemoryHost } from "./host.ts";
import type { AsukaTreeNode, SyncHost } from "./host.ts";

const libPath = join(import.meta.dir, "..", "go", "libasuka.so");
const ipcPath = join(import.meta.dir, "..", "bin", "asuka-ipc");

const VIEW = 1;
const TEXT = 2;
const BUTTON = 3;
const PRESS = 1;

const checkSyncHost = (name: string, make: () => SyncHost & { close?: () => void }): void => {
  describe(name, () => {
    test("typed props round-trip through describe", () => {
      const host = make();
      try {
        expect(host.version()).toBe(2);
        const root = host.create(VIEW);
        expect(root).toBe(1);
        expect(host.create(999)).toBe(0); // unknown kind refused
        expect(host.setStyle(root, "direction", "column")).toBe(true);
        expect(host.setAttr(root, "id", "a")).toBe(true);
        expect(host.setString(root, 16, "nope")).toBe(false); // int prop, string value
        expect(host.setString(999, 64, "x")).toBe(false);
        const text = host.create(TEXT);
        expect(host.setString(text, 64, "hello")).toBe(true);
        expect(host.setBool(text, 64, true)).toBe(false); // TString, not TBool
        expect(host.setFloat(root, 16, 14)).toBe(true); // FontSize is common
        expect(host.insert(root, text, 0)).toBe(true);
        expect(host.insert(root, text, 0)).toBe(false); // already parented
        expect(host.count()).toBe(2);
        const tree = host.describe(root);
        expect(tree).toMatchObject({
          id: root,
          kind: "View",
          kindId: VIEW,
          props: { direction: "column", id: "a", FontSize: 14 },
        });
        expect(tree?.children).toEqual([
          {
            id: text,
            kind: "Text",
            kindId: TEXT,
            props: { Text: "hello" },
            children: [],
            frame: [0, 0, 0, 0],
            listens: [],
          },
        ]);
        expect(host.delProp(root, "direction")).toBe(true);
        expect(host.describe(root)?.props.direction).toBeUndefined();
        expect(host.remove(root, text)).toBe(true);
        expect(host.describe(root)?.children).toEqual([]);
        expect(host.count()).toBe(2); // remove detaches; destroy deletes
        expect(host.destroy(text)).toBe(true);
        expect(host.count()).toBe(1);
        host.reset();
        expect(host.count()).toBe(0);
        expect(host.create(VIEW)).toBe(1); // handles restart after reset
      } finally {
        host.reset();
        host.close?.();
      }
    });

    test("insert orders, cycles refuse, destroys cascade", () => {
      const host = make();
      try {
        const a = host.create(VIEW);
        const b = host.create(VIEW);
        const c = host.create(VIEW);
        expect(host.insert(a, b, 0)).toBe(true);
        expect(host.insert(a, c, 0)).toBe(true);
        expect(host.describe(a)?.children.map((k) => k.id)).toEqual([c, b]);
        expect(host.insert(a, a, 0)).toBe(false); // self cycle
        expect(host.insert(b, a, 0)).toBe(false); // would cycle
        expect(host.insert(a, 999, 0)).toBe(false);
        expect(host.remove(a, 999)).toBe(false);
        expect(host.destroy(b)).toBe(true);
        expect(host.describe(a)?.children.map((k) => k.id)).toEqual([c]);
        expect(host.describe(999)).toBeNull();
        expect(host.destroy(999)).toBe(false);
        // Scroll holds a single child.
        const scroll = host.create(7);
        const one = host.create(TEXT);
        const two = host.create(TEXT);
        expect(host.insert(scroll, one, 0)).toBe(true);
        expect(host.insert(scroll, two, 1)).toBe(false);
      } finally {
        host.reset();
        host.close?.();
      }
    });

    test("listen, setRoot and layout flow into describe and the op log", () => {
      const host = make();
      try {
        const root = host.create(VIEW);
        expect(host.setStyle(root, "direction", "column")).toBe(true);
        expect(host.setStyle(root, "gap", "8")).toBe(true);
        expect(host.setStyle(root, "padding", "16")).toBe(true);
        const button = host.create(BUTTON);
        expect(host.setString(button, 64, "press")).toBe(true);
        expect(host.listen(button, PRESS)).toBe(true);
        expect(host.listen(button, 999)).toBe(false);
        expect(host.insert(root, button, 0)).toBe(true);
        expect(host.setRoot(root)).toBe(true);
        expect(host.setRoot(999)).toBe(false);
        const changed = host.layout(root, 390, 844);
        expect(changed).toBeGreaterThan(0);
        const tree = host.describe(root);
        expect(tree?.frame).toEqual([0, 0, 390, 844]);
        const kids = tree?.children ?? [];
        expect(kids.length).toBe(1);
        expect(kids[0]?.listens).toEqual(["Press"]);
        // The button sits inside the padding, with a positive frame.
        const [x, y, w, h] = kids[0]?.frame ?? [0, 0, 0, 0];
        expect(x).toBe(16);
        expect(y).toBe(16);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
        const ops = host.ops();
        expect(ops[0]).toBe("Create 1 View");
        expect(ops).toContain("Listen 2 Press");
        expect(ops).toContain("SetRoot 1");
        expect(ops.some((line) => line.startsWith("SetFrame"))).toBe(true);
        expect(ops.some((line) => line.startsWith("Insert 1 2 @0"))).toBe(true);
      } finally {
        host.reset();
        host.close?.();
      }
    });
  });
};

checkSyncHost("MemoryHost", () => new MemoryHost());

if (existsSync(libPath)) {
  checkSyncHost("FfiHost", () => FfiHost.open(libPath));

  test("FFI and memory backends agree on the same script", () => {
    const script = (host: SyncHost): unknown => {
      const root = host.create(VIEW);
      host.setStyle(root, "direction", "column");
      host.setString(host.create(TEXT), 64, "hi");
      host.insert(root, 2, 0);
      host.listen(2, PRESS);
      const tree = host.describe(root);
      host.reset();
      return tree;
    };
    const ffi = FfiHost.open(libPath);
    try {
      // Frames come from different engines (Go flexbox vs the memory
      // approximation), so the agreement covers the protocol surface:
      // strip frames before comparing.
      const strip = (tree: AsukaTreeNode | null): unknown =>
        tree === null
          ? null
          : {
            ...tree,
            frame: [0, 0, 0, 0],
            children: tree.children.map((c) => strip(c)),
          };
      const fromFfi = strip(script(ffi) as AsukaTreeNode);
      const mem = new MemoryHost();
      expect(fromFfi).toEqual(strip(script(mem) as AsukaTreeNode));
    } finally {
      ffi.close();
    }
  });
} else {
  test.skip("FfiHost (go/libasuka.so not built)", () => {});
}

describe("IpcHost", () => {
  test("child-process transport shares Go semantics", async () => {
    if (!existsSync(ipcPath)) {
      console.warn("skipping: bin/asuka-ipc not built");
      return;
    }
    const host = IpcHost.launch(ipcPath);
    try {
      expect(await host.version()).toBe(2);
      const root = await host.create(VIEW);
      expect(await host.setStyle(root, "direction", "column")).toBe(true);
      const text = await host.create(TEXT);
      await host.setString(text, 64, "hello");
      expect(await host.insert(root, text, 0)).toBe(true);
      expect(await host.listen(text, 3)).toBe(true);
      expect(await host.count()).toBe(2);
      const tree = await host.describe(root);
      expect(tree.kind).toBe("View");
      expect(tree.children[0]?.props).toMatchObject({ Text: "hello" });
      expect(tree.children[0]?.listens).toEqual(["TextChanged"]);
      expect(await host.layout(root, 390, 844)).toBeGreaterThan(0);
      expect((await host.describe(root)).frame).toEqual([0, 0, 390, 844]);
      expect(await host.delProp(root, "direction")).toBe(true);
      expect(await host.remove(root, text)).toBe(true);
      expect(await host.destroy(text)).toBe(true);
      expect(await host.count()).toBe(1);
      await expect(host.describe(999)).rejects.toThrow("unknown node");
      await host.reset();
      expect(await host.count()).toBe(0);
      expect((await host.ops()).length).toBe(0);
    } finally {
      await host.close();
    }
  });
});
