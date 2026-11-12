import { describe, expect, test } from "bun:test";

import { MemoryHost } from "./host.ts";
import {
  createMygoText,
  estimateTextSize,
  getMygoText,
  isMygoText,
  TEXT_KIND,
  TEXT_PROP,
} from "./text.ts";

describe("text", () => {
  test("text nodes store content and empty strings stay placeholders", () => {
    const host = new MemoryHost();
    const el = createMygoText(host, "hello");
    expect(el.tagName).toBe(TEXT_KIND);
    expect(isMygoText(el)).toBe(true);
    expect(getMygoText(host, el.nodeId)).toBe("hello");
    const empty = createMygoText(host, "");
    expect(host.describe(empty.nodeId)?.props[TEXT_PROP]).toBe("");
    expect(getMygoText(host, 999)).toBeNull();
    const box = host.create("Box");
    expect(getMygoText(host, box)).toBeNull();
    expect(isMygoText({ tagName: "Box" } as never)).toBe(false);
  });

  test("estimateTextSize scales with content and newlines", () => {
    const one = estimateTextSize("hello", 10);
    expect(one.lines).toBe(1);
    expect(one.width).toBe(5 * 10 * 0.6);
    const two = estimateTextSize("a\nbcd", 10);
    expect(two.lines).toBe(2);
    expect(two.width).toBe(3 * 10 * 0.6);
    expect(two.height).toBeGreaterThan(one.height);
  });
});
