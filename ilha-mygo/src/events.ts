// Event props for the mygo retained host.
//
// ilha convention: every handler prop starts with `on` followed by an
// uppercase letter. `bindEvents` (paint.ts) collects the latest handler per
// prop onto the element; `dispatchMygoEvent` routes a native-side event to
// the handler for an element id. Native mygo is immediate-mode
// (per-frame `if Button.Clicked()`), so there is no persistent listener —
// the versioned payload struct below is what a real-mygo front-end would
// forward per frame.
import type { PropValue } from "ilha/renderer";

import type { MygoElement } from "./paint.ts";

/** `onX` prop name -> mygo event name. */
export const MYGO_EVENT_PROPS: Readonly<Record<string, string>> = {
  onClick: "click",
  onPointerDown: "pointerdown",
  onPointerUp: "pointerup",
  onPointerMove: "pointermove",
  onPointerOver: "pointerover",
  onPointerOut: "pointerout",
  onPointerEnter: "pointerenter",
  onPointerLeave: "pointerleave",
  onChange: "change",
  onSubmitted: "submitted",
  onSubmit: "submit",
  onFocus: "focus",
  onBlur: "blur",
};

/** True for `onX` handler prop names claimed by the mygo event system. */
export const isMygoEventProp = (key: string): boolean =>
  key in MYGO_EVENT_PROPS;

/**
 * `onX` prop name -> event type. Every key starts with `on` followed by an
 * uppercase letter (ilha convention); the type is the prop name with the
 * `on` prefix lowercased (`onClick` -> `click`).
 */
export const eventTypeFromProp = (key: string): string =>
  key.length > 2 ? key[2].toLowerCase() + key.slice(3) : key;

/** Single versioned payload forwarded per event (one handler per id). */
export interface MygoEventPayload {
  /** Monotonic dispatch sequence. */
  version: number;
  /** Event type (`click`, `change`, …). */
  type: string;
  /** Target element handle. */
  target: number;
  /** Unix milliseconds at dispatch. */
  timeStamp: number;
  /** Optional detail carried from the native side. */
  detail?: unknown;
}

let version = 0;

const warnedLowercase = new Set<string>();

/**
 * Warn once for lowercase `onclick`-style props, which ilha never routes
 * to `bindEvents` — the handler would silently never fire. Use `onClick`.
 */
export const warnOnLowercaseEventProp = (key: string): void => {
  if (!/^on[a-z]/u.test(key) || warnedLowercase.has(key)) {
    return;
  }
  warnedLowercase.add(key);
  console.warn(
    `[ilha-mygo] "${key}" looks like an event handler; use "${"on"}${key[2].toUpperCase()}${key.slice(3)}" instead.`,
  );
};

/** Reset the once-only lowercase warning (tests). */
export const resetEventWarnings = (): void => {
  warnedLowercase.clear();
};

/**
 * Dispatch an event to the handler collected on `el` for `type`.
 * Returns true when a handler ran. Throws (and rethrows) nothing — a
 * throwing handler propagates to the caller, mirroring ilha `Effect`
 * semantics where the fiber owns the error channel.
 */
export const dispatchMygoEvent = (
  el: MygoElement,
  type: string,
  detail?: unknown,
): boolean => {
  const prop = `on${type[0].toUpperCase()}${type.slice(1)}`;
  const handler = el.handlers[prop] as
    | ((payload: MygoEventPayload) => void)
    | undefined;
  if (typeof handler !== "function") {
    return false;
  }
  version += 1;
  handler({
    detail,
    target: el.nodeId,
    timeStamp: Date.now(),
    type,
    version,
  });
  return true;
};

/** Adopt the latest handlers from `props` onto `el` (morph parity). */
export const adoptMygoEvents = (
  el: MygoElement,
  props: Record<string, PropValue>,
): void => {
  for (const [key, value] of Object.entries(props)) {
    if (isMygoEventProp(key) || (/^on[A-Z]/u.test(key) && typeof value === "function")) {
      el.handlers[key] = value;
    }
  }
};
