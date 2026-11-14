import { describe, expect, test } from "bun:test";

import { MemoryHost } from "./host.ts";
import {
  createAsukaText,
  estimateTextSize,
  getAsukaText,
  isAsukaText,
  TEXT_KIND,
  TEXT_PROP,
} from "./text.ts";

describe("text", () => {
  test("text nodes store content and empty strings stay placeholders", () => {
    const host = new MemoryHost();
    const el = createAsukaText(host, "hello");
    expect(el.kind).toBe(TEXT_KIND);
    expect(isAsukaText(el)).toBe(true);
    expect(getAsukaText(host, el.nodeId)).toBe("hello");
    const empty = createAsukaText(host, "");
    expect(host.describe(empty.nodeId)?.props[TEXT_PROP]).toBe("");
    expect(getAsukaText(host, 999)).toBeNull();
    const box = host.create(1);
    expect(getAsukaText(host, box)).toBeNull();
    expect(isAsukaText({ kind: 1 } as never)).toBe(false);
  });

  test("estimateTextSize matches the Go measure rule", () => {
    const one = estimateTextSize("hello", 10);
    expect(one.lines).toBe(1);
    expect(one.width).toBe(5 * 10 * 0.6);
    const two = estimateTextSize("a\nbcd", 10);
    expect(two.lines).toBe(2);
    expect(two.width).toBe(3 * 10 * 0.6);
    expect(two.height).toBeGreaterThan(one.height);
  });
});
