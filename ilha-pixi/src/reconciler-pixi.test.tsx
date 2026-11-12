import { describe, expect, test } from "bun:test";
import {
  BlurFilter,
  Container,
  EventBoundary,
  Graphics,
  Sprite,
  Texture,
} from "pixi.js";

import "./pixi-types.ts";
import {
  adoptStage,
  bindPixiEvents,
  createPixiElement,
  createPixiRenderer,
  setPixiProp,
  syncEventMode,
} from "./reconciler-pixi.ts";

describe("reconciler-pixi", () => {
  test("mounts containers with sprite and graphics children", async () => {
    const stage = new Container();
    const renderer = createPixiRenderer();
    let drawn: unknown = null;
    const handle = renderer.mount(adoptStage(stage) as never, () => (
      <container position={[10, 20]} alpha={0.5}>
        <sprite texture={Texture.EMPTY} />
        <graphics
          draw={(g: unknown) => {
            drawn = g;
            (g as Graphics).rect(0, 0, 10, 10).fill(0xff_00_00);
          }}
        />
      </container>
    ));
    await handle.ready;
    expect(stage.children.length).toBe(1);
    const root = stage.children[0] as Container;
    expect(root.position.x).toBe(10);
    expect(root.position.y).toBe(20);
    expect(root.alpha).toBe(0.5);
    expect(root.children.length).toBe(2);
    expect(root.children[0]).toBeInstanceOf(Sprite);
    expect(drawn).toBeInstanceOf(Graphics);
    handle.unmount();
    expect(root.destroyed).toBe(true);
  });

  test("filter children attach to parent.filters", async () => {
    const stage = new Container();
    const renderer = createPixiRenderer();
    const handle = renderer.mount(adoptStage(stage) as never, () => (
      <container>
        <blurFilter />
      </container>
    ));
    await handle.ready;
    const root = stage.children[0] as Container & {
      filters: unknown[] | null;
    };
    expect(root.filters?.length).toBe(1);
    expect(root.filters?.[0]).toBeInstanceOf(BlurFilter);
    handle.unmount();
  });

  test("pixi-prefixed tags resolve", () => {
    expect(createPixiElement("pixiContainer")).toBeInstanceOf(Container);
    expect(createPixiElement("sprite")).toBeInstanceOf(Sprite);
  });

  test("unextended tags throw a namespace error", () => {
    expect(() => createPixiElement("notAPixiThing")).toThrow(
      "is not part of the PIXI namespace",
    );
  });

  test("dashed props pierce with .set detection", () => {
    const el = createPixiElement("container");
    setPixiProp(el, "position-x", 7);
    expect(el.position.x).toBe(7);
    setPixiProp(el, "scale", [2, 3]);
    expect(el.scale.x).toBe(2);
    expect(el.scale.y).toBe(3);
  });

  test("removed props reset to fresh-constructed defaults", () => {
    const el = createPixiElement("container");
    setPixiProp(el, "alpha", 0.25);
    expect(el.alpha).toBe(0.25);
    setPixiProp(el, "alpha", undefined);
    expect(el.alpha).toBe(1);
  });

  test("read-only and reserved props are claimed, never written", () => {
    const el = createPixiElement("container");
    Object.defineProperty(el, "frozen", { get: () => 1 });
    expect(setPixiProp(el, "frozen", 2)).toBe(true);
    expect((el as unknown as Record<string, unknown>)["frozen"]).toBe(1);
    expect(setPixiProp(el, "children", [])).toBe(true);
  });

  test("bindPixiEvents assigns, deletes and drives eventMode", () => {
    const el = createPixiElement("sprite");
    const record = el as unknown as Record<string, unknown>;
    const onClick = (): void => {};
    bindPixiEvents(el, { onClick } as never);
    expect(record["onclick"]).toBe(onClick);
    expect(el.eventMode).toBe("static");
    expect(el.cursor).toBe("pointer");
    bindPixiEvents(el, {} as never);
    // The FederatedContainer mixin keeps a null prototype slot, so the
    // removed handler reads back nullish and never fires.
    expect(record["onclick"] ?? null).toBeNull();
    // Removing handlers never forces "none": that prunes the subtree
    // from hit testing and strands handler-bearing descendants.
    expect(el.eventMode).toBe("static");
  });

  test("args rebuild transplants children and props", () => {
    const parent = createPixiElement("container");
    const el = createPixiElement("container");
    const child = createPixiElement("sprite");
    el.addChild(child);
    parent.addChild(el);
    setPixiProp(el, "alpha", 0.3);
    setPixiProp(el, "args", []);
    const fresh = parent.children[0] as Container;
    expect(fresh).not.toBe(el);
    expect(fresh.alpha).toBe(0.3);
    expect(child.parent).toBe(fresh);
  });

  test("handler-bearing descendants stay hittable under handler-less ancestors", () => {
    const machine = createPixiElement("container");
    bindPixiEvents(machine, {} as never);
    const button = createPixiElement("container");
    const fired: unknown[] = [];
    bindPixiEvents(button, {
      onPointerDown: () => {
        fired.push(1);
      },
    } as never);
    machine.addChild(button);
    const graphics = createPixiElement("graphics");
    setPixiProp(graphics, "draw", (g: unknown) => {
      (g as Graphics).roundRect(0, 0, 160, 60, 14).fill({ color: "#22aa44" });
    });
    button.addChild(graphics);
    bindPixiEvents(graphics, {} as never);
    const boundary = new EventBoundary(machine as unknown as Container);
    // The static button container is the target (its graphics child is
    // hit geometry, not an interactive target itself).
    const hit = boundary.hitTest(80, 30);
    expect(hit).toBe(button as unknown as Container);
    // Dispatch the way EventBoundary.notifyTarget does (`on${type}`).
    const target = hit as unknown as Record<
      string,
      ((event: unknown) => void) | undefined
    >;
    target["onpointerdown"]?.({});
    expect(fired.length).toBe(1);
  });

  test("eventMode respects explicit user props", () => {
    const el = createPixiElement("container");
    setPixiProp(el, "eventMode", "auto");
    bindPixiEvents(el, { onClick: () => {} } as never);
    expect(el.eventMode).toBe("auto");
    syncEventMode(el);
    expect(el.eventMode).toBe("auto");
  });
});
