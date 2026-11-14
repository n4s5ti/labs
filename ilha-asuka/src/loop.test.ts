import { describe, expect, test } from "bun:test";

import { createLoop } from "./loop.ts";

describe("loop", () => {
  test("demand mode steps once per invalidation and tracks frames", () => {
    let renders = 0;
    const loop = createLoop(() => {
      renders += 1;
    });
    expect(loop.frameloop).toBe("demand");
    loop.invalidate(); // first commit
    expect(renders).toBe(1);
    loop.invalidate();
    expect(renders).toBe(2);
    loop.advance(1000, false); // no invalidation: skipped
    expect(renders).toBe(2);
  });

  test("subscribers run in priority order and take over rendering", () => {
    let renders = 0;
    const loop = createLoop(() => {
      renders += 1;
    });
    const order: string[] = [];
    loop.subscribe({ callback: () => void order.push("b"), priority: 1, ref: {} });
    loop.subscribe({ callback: () => void order.push("a"), priority: -1, ref: {} });
    loop.advance(2000);
    expect(order).toEqual(["a", "b"]);
    expect(renders).toBe(0); // positive priority takes over
  });

  test("effects run before subscribers, tails after render", () => {
    const order: string[] = [];
    const loop = createLoop(() => void order.push("render"));
    loop.addEffect(() => void order.push("effect"));
    loop.addAfterEffect(() => void order.push("after"));
    loop.addTail(() => void order.push("tail"));
    loop.subscribe({ callback: () => void order.push("sub"), priority: 0, ref: {} });
    loop.advance(3000);
    expect(order).toEqual(["effect", "sub", "render", "after", "tail"]);
  });

  test("never mode ignores automatic ticks but honors manual steps", () => {
    let renders = 0;
    const loop = createLoop(() => {
      renders += 1;
    });
    loop.setFrameloop("never");
    loop.advance(4000, false);
    expect(renders).toBe(0);
    loop.advance(4000, true);
    expect(renders).toBe(1);
  });

  test("unsubscribe removes the subscriber", () => {
    let calls = 0;
    const loop = createLoop(() => undefined);
    const off = loop.subscribe({
      callback: () => {
        calls += 1;
      },
      priority: 0,
      ref: {},
    });
    loop.advance(5000);
    off();
    loop.advance(5100);
    expect(calls).toBe(1);
  });
});
