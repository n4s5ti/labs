import { describe, expect, test } from "bun:test";

import { MemoryHost } from "./host.ts";
import { MygoElement } from "./paint.ts";
import {
  adoptMygoEvents,
  dispatchMygoEvent,
  eventTypeFromProp,
  isMygoEventProp,
  resetEventWarnings,
  warnOnLowercaseEventProp,
} from "./events.ts";
import type { MygoEventPayload } from "./events.ts";

describe("events", () => {
  test("prop names map to event types", () => {
    expect(isMygoEventProp("onClick")).toBe(true);
    expect(isMygoEventProp("onChange")).toBe(true);
    expect(isMygoEventProp("onSubmitted")).toBe(true);
    expect(isMygoEventProp("onHover")).toBe(false);
    expect(eventTypeFromProp("onClick")).toBe("click");
    expect(eventTypeFromProp("onPointerDown")).toBe("pointerDown");
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
    const el = new MygoElement(host, "Button");
    expect(dispatchMygoEvent(el, "click")).toBe(false);
    const seen: MygoEventPayload[] = [];
    adoptMygoEvents(el, { onClick: (payload: MygoEventPayload) => void seen.push(payload) });
    expect(dispatchMygoEvent(el, "click", { x: 1 })).toBe(true);
    expect(seen.length).toBe(1);
    expect(seen[0]?.type).toBe("click");
    expect(seen[0]?.target).toBe(el.nodeId);
    expect(seen[0]?.detail).toEqual({ x: 1 });
    expect(typeof seen[0]?.version).toBe("number");
    expect(dispatchMygoEvent(el, "change")).toBe(false);
  });
});
