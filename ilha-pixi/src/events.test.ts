import { describe, expect, test } from "bun:test";

import {
  isPixiEventProp,
  PIXI_EVENT_PROPS,
  resetEventWarnings,
  warnOnLowercaseEventProp,
} from "./events.ts";

describe("events", () => {
  test("exposes 33 onX props mapped to lowercase pixi names", () => {
    expect(Object.keys(PIXI_EVENT_PROPS).length).toBe(33);
    expect(PIXI_EVENT_PROPS["onClick"]).toBe("click");
    expect(PIXI_EVENT_PROPS["onPointerDown"]).toBe("pointerdown");
    expect(PIXI_EVENT_PROPS["onWheel"]).toBe("wheel");
    expect(PIXI_EVENT_PROPS["onGlobalPointerMove"]).toBe(
      "globalpointermove",
    );
    for (const [prop, name] of Object.entries(PIXI_EVENT_PROPS)) {
      expect(prop.startsWith("on")).toBe(true);
      expect(name).toBe(name.toLowerCase());
    }
  });

  test("isPixiEventProp accepts onX and rejects the rest", () => {
    expect(isPixiEventProp("onClick")).toBe(true);
    expect(isPixiEventProp("onUpdate")).toBe(false);
    expect(isPixiEventProp("onclick")).toBe(false);
    expect(isPixiEventProp("position")).toBe(false);
  });

  test("lowercase handlers warn once", () => {
    resetEventWarnings();
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]): void => {
      warnings.push(args);
    };
    try {
      warnOnLowercaseEventProp("onclick");
      warnOnLowercaseEventProp("onclick");
      warnOnLowercaseEventProp("position");
      expect(warnings.length).toBe(1);
      expect(String(warnings[0][0])).toContain("onClick");
    } finally {
      console.warn = original;
    }
  });
});
