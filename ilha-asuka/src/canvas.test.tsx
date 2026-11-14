import { describe, expect, test } from "bun:test";

import "./asuka-types.ts";
import { MemoryHost } from "./host.ts";
import type { AsukaTreeNode } from "./host.ts";
import { dispatchAsukaEvent } from "./events.ts";
import type { AsukaEventPayload } from "./events.ts";
import { useFrame, useHost, useAsuka } from "./hooks.ts";
import type { RootState } from "./atoms.ts";
import { bootRoot, createRoot } from "./canvas.tsx";
import { createAsukaRenderer, elementFor, AsukaElement } from "./paint.ts";

/**
 * Collect every node of `kind` under `tree`. ilha mounts components in
 * transparent `View` hole hosts, so assertions look through holes instead
 * of assuming a fixed depth (pixi `Container`-fallback precedent).
 */
const findAll = (tree: AsukaTreeNode | null, kind: string): AsukaTreeNode[] => {
  if (tree === null) {
    return [];
  }
  const self = tree.kind === kind ? [tree] : [];
  return [...self, ...tree.children.flatMap((child) => findAll(child, kind))];
};

describe("bootRoot", () => {
  test("mounts layout with text, frames it, and clears it on dispose", async () => {
    const host = new MemoryHost();
    const created: { current: RootState | null } = { current: null };
    const state = bootRoot(
      host,
      <column direction="column" gap="8" padding="16">
        <asukaText value="hello layout">hello layout</asukaText>
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
    // The root marks itself for hosts and logs the mount op.
    expect(host.ops()).toContain(`SetRoot ${state.root.nodeId}`);
    host.layout(state.root.nodeId, state.size.width, state.size.height);
    const tree = host.describe(state.root.nodeId);
    expect(tree?.kind).toBe("View");
    expect(tree?.frame).toEqual([0, 0, 1280, 720]);
    const views = findAll(tree, "View");
    const columns = views.filter((v) => v.props["direction"] === "column");
    expect(columns.length).toBe(1);
    expect(columns[0]?.props).toMatchObject({
      direction: "column",
      gap: "8",
      padding: "16",
    });
    const columnText =
      findAll(tree, "Text")[0]?.props["Text"] ?? "";
    expect(String(columnText)).toContain("hello layout");
    // The text sits inside the padding with a laid-out frame.
    const textFrame = findAll(tree, "Text")[0]?.frame ?? [0, 0, 0, 0];
    expect(textFrame[0]).toBe(16);
    expect(textFrame[1]).toBe(16);
    expect(textFrame[2]).toBeGreaterThan(0);
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
      throw new Error("useAsuka did not populate inside the root");
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

  test("useAsuka outside a provider reports through onError", async () => {
    const host = new MemoryHost();
    const renderer = createAsukaRenderer(host);
    const root = new AsukaElement(host, 1);
    const errors: unknown[] = [];
    const handle = renderer.mount(root as never, Orphan as never, {
      onError: (error) => void errors.push(error),
    });
    await handle.ready;
    expect(String(errors[0])).toContain("useAsuka must be used inside");
    handle.unmount();
  });

  test("Press handlers dispatch through the live element", async () => {
    const host = new MemoryHost();
    const clicks: AsukaEventPayload[] = [];
    const state = bootRoot(
      host,
      <asukaButton onClick={(payload) => void clicks.push(payload)}>
        press
      </asukaButton>,
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
    expect(el.kind).toBe(3);
    expect(buttons[0]?.listens).toEqual(["Press"]);
    expect(dispatchAsukaEvent(el, "Press")).toBe(true);
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
  props.seen.current = useAsuka();
  const fromHost = useHost();
  if (fromHost !== useAsuka().host) {
    throw new Error("useHost returned a foreign host");
  }
  useFrame(() => {
    props.onFrame();
  });
  return "tick";
};

const Orphan = (): string => {
  useAsuka();
  return "orphan";
};
