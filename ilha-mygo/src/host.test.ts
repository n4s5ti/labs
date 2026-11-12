import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { FfiHost, IpcHost, MemoryHost } from "./host.ts";
import type { SyncHost } from "./host.ts";

const libPath = join(import.meta.dir, "..", "go", "libmygo.so");
const ipcPath = join(import.meta.dir, "..", "bin", "mygo-ipc");

const checkSyncHost = (name: string, make: () => SyncHost & { close?: () => void }): void => {
  describe(name, () => {
    test("crud round-trips through describe", () => {
      const host = make();
      try {
        expect(host.version()).toBe(1);
        const root = host.create("div");
        expect(root).toBe(1);
        expect(host.setProp(root, "x", "1")).toBe(true);
        expect(host.setProp(999, "x", "1")).toBe(false);
        const text = host.create("#text");
        host.setProp(text, "text", "hello");
        expect(host.attach(root, text)).toBe(true);
        expect(host.attach(root, text)).toBe(true); // idempotent
        expect(host.count()).toBe(2);
        expect(host.describe(root)).toEqual({
          id: root,
          kind: "div",
          props: { x: "1" },
          children: [{ id: text, kind: "#text", props: { text: "hello" }, children: [] }],
        });
        expect(host.delProp(root, "x")).toBe(true);
        expect(host.describe(root)?.props).toEqual({});
        expect(host.detach(root, text)).toBe(true);
        expect(host.describe(root)?.children).toEqual([]);
        expect(host.count()).toBe(2); // detach keeps nodes alive
        expect(host.remove(text)).toBe(true);
        expect(host.count()).toBe(1);
        host.reset();
        expect(host.count()).toBe(0);
        expect(host.create("span")).toBe(1); // handles restart
      } finally {
        host.reset();
        host.close?.();
      }
    });

    test("cycles are refused and removals cascade", () => {
      const host = make();
      try {
        const a = host.create("a");
        const b = host.create("b");
        const c = host.create("c");
        expect(host.attach(a, b)).toBe(true);
        expect(host.attach(b, c)).toBe(true);
        expect(host.attach(c, a)).toBe(false); // would cycle
        expect(host.attach(a, a)).toBe(false); // self cycle
        expect(host.attach(a, 999)).toBe(false); // unknown child
        expect(host.attach(999, b)).toBe(false); // unknown parent
        expect(host.remove(b)).toBe(true);
        expect(host.describe(a)?.children).toEqual([]);
        expect(host.describe(c)).toBeNull(); // subtree cascaded
        expect(host.describe(999)).toBeNull();
        expect(host.remove(999)).toBe(false);
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

  test("FfiHost exercises the raw FFI boundary", () => {
    const host = FfiHost.open(libPath);
    try {
      expect(host.backend).toBe("ffi");
      expect(host.add(8, 42)).toBe(50);
      expect(host.version()).toBe(1);
    } finally {
      host.close();
    }
  });

  test("FFI and memory backends agree on the same script", () => {
    const script = (host: SyncHost): unknown => {
      const root = host.create("root");
      host.setProp(root, "k", "v");
      const kid = host.create("kid");
      host.attach(root, kid);
      const tree = host.describe(root);
      host.reset();
      return tree;
    };
    const ffi = FfiHost.open(libPath);
    try {
      expect(script(ffi)).toEqual(script(new MemoryHost()));
    } finally {
      ffi.close();
    }
  });
} else {
  test.skip("FfiHost (go/libmygo.so not built)", () => {});
}

describe("IpcHost", () => {
  test("child-process transport shares Go semantics", async () => {
    if (!existsSync(ipcPath)) {
      console.warn("skipping: bin/mygo-ipc not built");
      return;
    }
    const host = IpcHost.launch(ipcPath);
    try {
      expect(await host.version()).toBe(1);
      const root = await host.create("div");
      expect(await host.setProp(root, "x", "1")).toBe(true);
      const text = await host.create("#text");
      await host.setProp(text, "text", "hello");
      expect(await host.attach(root, text)).toBe(true);
      expect(await host.count()).toBe(2);
      expect(await host.describe(root)).toEqual({
        id: root,
        kind: "div",
        props: { x: "1" },
        children: [{ id: text, kind: "#text", props: { text: "hello" }, children: [] }],
      });
      expect(await host.delProp(root, "x")).toBe(true);
      expect(await host.detach(root, text)).toBe(true);
      expect(await host.remove(text)).toBe(true);
      expect(await host.count()).toBe(1);
      await expect(host.describe(999)).rejects.toThrow("unknown node");
      await host.reset();
      expect(await host.count()).toBe(0);
    } finally {
      await host.close();
    }
  });
});
