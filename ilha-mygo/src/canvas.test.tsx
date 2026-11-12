import { describe, expect, test } from "bun:test";

import "./mygo-types.ts";
import { MemoryHost } from "./host.ts";
import type { MygoTreeNode } from "./host.ts";
import { dispatchMygoEvent } from "./events.ts";
import type { MygoEventPayload } from "./events.ts";
import { useFrame, useHost, useMygo } from "./hooks.ts";
import type { RootState } from "./atoms.ts";
import { bootRoot, createRoot } from "./canvas.tsx";
import { createMygoRenderer, elementFor, MygoElement } from "./paint.ts";

/**
 * Collect every node of `kind` under `tree`. ilha mounts components in
 * transparent `Span` hole hosts, so assertions look through holes instead
 * of assuming a fixed depth (pixi `Container`-fallback precedent).
 */
const findAll = (tree: MygoTreeNode | null, kind: string): MygoTreeNode[] => {
  if (tree === null) {
    return [];
  }
  const self = tree.kind === kind ? [tree] : [];
  return [...self, ...tree.children.flatMap((child) => findAll(child, kind))];
};

describe("bootRoot", () => {
  test("mounts layout with text and clears it on dispose", async () => {
    const host = new MemoryHost();
    const created: { current: RootState | null } = { current: null };
    const state = bootRoot(
      host,
      <column direction="column" gap="8" padding="16">
        <mygoText value="hello layout">hello layout</mygoText>
      </column>,
      {
        onCreated: (root) => {
          created.current = root;
        },
      },
    );
    expect(state.status).toBe("open");
    expect(state.size).toEqual({ height: 720, width: 1280 });
    await state.ready;
    expect(created.current).toBe(state);
    const tree = host.describe(state.root.nodeId);
    expect(tree?.kind).toBe("root");
    const columns = findAll(tree, "Column");
    expect(columns.length).toBe(1);
    expect(columns[0]?.props).toMatchObject({
      direction: "column",
      gap: "8",
      padding: "16",
    });
    // The text survives, either as a `value` prop or a text child.
    const columnText =
      columns[0]?.props["value"] ??
      findAll(tree, "Text")[0]?.props["value"] ??
      findAll(tree, "#text")[0]?.props["text"] ??
      "";
    expect(String(columnText)).toContain("hello layout");
    state.dispose();
    expect(state.status).toBe("disposed");
    expect(host.describe(state.root.nodeId)?.children).toEqual([]);
    // Double dispose is safe.
    state.dispose();
  });

  test("hooks read state and frames advance on invalidate", async () => {
    const host = new MemoryHost();
    const seen: { current: RootState | null } = { current: null };
    let frames = 0;
    const state = bootRoot(
      host,
      <Probe
        seen={seen}
        onFrame={() => {
          frames += 1;
        }}
      />,
    );
    await state.ready;
    // Component evaluation commits async (holes mount first).
    if (seen.current === null) {
      throw new Error("useMygo did not populate inside the root");
    }
    expect(seen.current).toBe(state);
    const before = state.frames;
    state.invalidate();
    expect(state.frames).toBeGreaterThan(before);
    expect(frames).toBeGreaterThan(0);
    state.advance(9999);
    state.setSize(800, 600);
    expect(state.size).toEqual({ height: 600, width: 800 });
    state.setFrameloop("never");
    expect(state.frameloop).toBe("never");
    state.dispose();
  });

  test("useMygo outside a provider reports through onError", async () => {
    const host = new MemoryHost();
    const renderer = createMygoRenderer(host);
    const root = new MygoElement(host, "root");
    const errors: unknown[] = [];
    const handle = renderer.mount(root as never, Orphan as never, {
      onError: (error) => void errors.push(error),
    });
    await handle.ready;
    expect(String(errors[0])).toContain("useMygo must be used inside");
    handle.unmount();
  });

  test("click handlers dispatch through the live element", async () => {
    const host = new MemoryHost();
    const clicks: MygoEventPayload[] = [];
    const state = bootRoot(
      host,
      <mygoButton onClick={(payload) => void clicks.push(payload)}>
        press
      </mygoButton>,
    );
    await state.ready;
    const buttons = findAll(host.describe(state.root.nodeId), "Button");
    expect(buttons.length).toBe(1);
    const buttonId = buttons[0]?.id;
    if (typeof buttonId !== "number") {
      throw new Error("button did not mount");
    }
    const el = elementFor(host, buttonId);
    if (el === undefined) {
      throw new Error("live element missing for mounted button");
    }
    expect(el.tagName).toBe("Button");
    expect(dispatchMygoEvent(el, "click")).toBe(true);
    expect(clicks.length).toBe(1);
    expect(clicks[0]?.target).toBe(buttonId);
    state.dispose();
  });
});

describe("createRoot", () => {
  test("render replaces the tree and unmount clears it", () => {
    const host = new MemoryHost();
    const root = createRoot(host);
    root.render("first");
    expect(host.count()).toBeGreaterThan(0);
    root.configure({ frameloop: "never" });
    root.render("second");
    expect(host.count()).toBeGreaterThan(0);
    root.unmount();
    root.unmount(); // safe twice
  });
});

const Probe = (props: {
  seen: { current: RootState | null };
  onFrame: () => void;
}): string => {
  props.seen.current = useMygo();
  const fromHost = useHost();
  if (fromHost !== useMygo().host) {
    throw new Error("useHost returned a foreign host");
  }
  useFrame(() => {
    props.onFrame();
  });
  return "tick";
};

const Orphan = (): string => {
  useMygo();
  return "orphan";
};
