import { describe, expect, test } from "bun:test";

import { createLoop } from "./loop.ts";

describe("loop", () => {
  test("runs subscribers in priority order", () => {
    const order: string[] = [];
    const loop = createLoop(() => {
      order.push("render");
    });
    loop.subscribe({
      callback: () => {
        order.push("low");
      },
      priority: 5,
      ref: {},
    });
    loop.subscribe({
      callback: () => {
        order.push("high");
      },
      priority: -5,
      ref: {},
    });
    // A positive-priority subscriber takes over rendering.
    loop.subscribe({
      callback: () => {
        order.push("takeover");
      },
      priority: 1,
      ref: {},
    });
    loop.advance(1000);
    expect(order).toEqual(["high", "takeover", "low"]);
  });

  test("automatic render runs without takeover subscribers", () => {
    let renders = 0;
    const loop = createLoop(() => {
      renders += 1;
    });
    loop.subscribe({ callback: () => {}, priority: 0, ref: {} });
    loop.advance(1000);
    loop.advance(1016);
    expect(renders).toBe(2);
  });

  test("unsubscribe stops callbacks", () => {
    let calls = 0;
    const loop = createLoop(() => {});
    const unsubscribe = loop.subscribe({
      callback: () => {
        calls += 1;
      },
      priority: 0,
      ref: {},
    });
    loop.advance(1000);
    unsubscribe();
    loop.advance(1016);
    expect(calls).toBe(1);
  });

  test("frameloop never blocks manual advance", () => {
    let renders = 0;
    const loop = createLoop(() => {
      renders += 1;
    });
    loop.setFrameloop("never");
    // Explicit steps still run; only the automatic tick stops.
    loop.advance(1000);
    expect(renders).toBe(1);
    loop.advance(1016, false);
    expect(renders).toBe(1);
    expect(loop.frameloop).toBe("never");
  });

  test("demand renders only after invalidate", () => {
    let renders = 0;
    const calls: number[] = [];
    const loop = createLoop(() => {
      renders += 1;
    });
    loop.setFrameloop("demand");
    loop.subscribe({
      callback: (_frame, _delta) => {
        calls.push(renders);
      },
      priority: -1,
      ref: {},
    });
    loop.advance(1000, false);
    loop.advance(1016, false);
    expect(calls).toEqual([]);
    loop.invalidate();
    loop.advance(1032, false);
    expect(calls.length).toBe(1);
    expect(renders).toBe(1);
  });

  test("effects run before subscribers, tails after render", () => {
    const order: string[] = [];
    const loop = createLoop(() => {
      order.push("render");
    });
    loop.addEffect(() => {
      order.push("effect");
    });
    loop.addAfterEffect(() => {
      order.push("after");
    });
    loop.addTail(() => {
      order.push("tail");
    });
    loop.subscribe({
      callback: () => {
        order.push("frame");
      },
      priority: 0,
      ref: {},
    });
    loop.advance(1000);
    expect(order).toEqual(["effect", "frame", "render", "after", "tail"]);
  });
});
