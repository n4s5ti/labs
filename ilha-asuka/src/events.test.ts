import { describe, expect, test } from "bun:test";

import { MemoryHost } from "./host.ts";
import { AsukaElement } from "./paint.ts";
import {
  adoptAsukaEvents,
  dispatchAsukaEvent,
  eventForProp,
  isAsukaEventProp,
  resetEventWarnings,
  warnOnLowercaseEventProp,
} from "./events.ts";
import type { AsukaEventPayload } from "./events.ts";

describe("events", () => {
  test("prop names resolve to Asuka event kinds", () => {
    expect(isAsukaEventProp("onClick")).toBe(true);
    expect(isAsukaEventProp("onChange")).toBe(true);
    expect(isAsukaEventProp("onToggle")).toBe(true);
    expect(isAsukaEventProp("onHover")).toBe(false);
    expect(eventForProp("onClick", 3)).toEqual({ id: 1, name: "Press" });
    // onChange follows the control kind.
    expect(eventForProp("onChange", 4)).toEqual({ id: 3, name: "TextChanged" });
    expect(eventForProp("onChange", 5)).toEqual({ id: 7, name: "Toggled" });
    expect(eventForProp("onChange", 6)).toEqual({ id: 8, name: "ValueChanged" });
    expect(eventForProp("onChange", 3)).toEqual({ id: 3, name: "TextChanged" });
    expect(eventForProp("onPointerDown", 3)).toBeUndefined();
  });

  test("lowercase handler props warn once", () => {
    resetEventWarnings();
    const messages: string[] = [];
    const orig = console.warn;
    console.warn = (message: string): void => {
      messages.push(message);
    };
    try {
      warnOnLowercaseEventProp("onclick");
      warnOnLowercaseEventProp("onclick");
      warnOnLowercaseEventProp("onClick");
    } finally {
      console.warn = orig;
    }
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain("onClick");
  });

  test("dispatch routes to the collected handler with a versioned payload", () => {
    const host = new MemoryHost();
    const el = new AsukaElement(host, 3);
    expect(dispatchAsukaEvent(el, "Press")).toBe(false);
    const seen: AsukaEventPayload[] = [];
    adoptAsukaEvents(el, { onClick: (payload: AsukaEventPayload) => void seen.push(payload) });
    expect(dispatchAsukaEvent(el, "Press", { x: 1 })).toBe(true);
    expect(seen.length).toBe(1);
    expect(seen[0]?.type).toBe("Press");
    expect(seen[0]?.target).toBe(el.nodeId);
    expect(seen[0]?.detail).toEqual({ x: 1 });
    expect(typeof seen[0]?.version).toBe("number");
    expect(dispatchAsukaEvent(el, "TextChanged")).toBe(false);
  });
});
