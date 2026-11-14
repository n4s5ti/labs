// Event props for the Asuka retained host.
//
// ilha convention: every handler prop starts with `on` followed by an
// uppercase letter. `bindEvents` (paint.ts) resolves the latest handler
// per prop to an Asuka event kind, subscribes it host-side with `listen`
// and keeps the handler on the element for dispatch. `dispatchAsukaEvent`
// routes a host-side event to the handler for an element id.
//
// Asuka's schema is the authority on which events exist: Press,
// LongPress, TextChanged, Submit, Focus, Blur, Toggled, ValueChanged.
// `onChange` resolves per kind (a TextField reports TextChanged, a Toggle
// Toggled, a Slider ValueChanged). Pointer handlers have no Asuka
// primitive (gestures are Pan/Pinch/Rotate/Swipe) and are not collected.
import type { PropValue } from "ilha/renderer";

import type { AsukaElement } from "./paint.ts";

/** Asuka event name -> schema event kind ID. */
export const ASUKA_EVENTS: Readonly<Record<string, number>> = {
  Press: 1,
  LongPress: 2,
  TextChanged: 3,
  Submit: 4,
  Focus: 5,
  Blur: 6,
  Toggled: 7,
  ValueChanged: 8,
};

/** `onX` prop name -> Asuka event name (kind-independent entries). */
const PROP_TO_EVENT: Readonly<Record<string, string>> = {
  onClick: "Press",
  onLongPress: "LongPress",
  onSubmit: "Submit",
  onFocus: "Focus",
  onBlur: "Blur",
  onToggle: "Toggled",
  onValueChange: "ValueChanged",
};

/**
 * Resolve an `onX` handler prop to its Asuka event for an element kind.
 * `onChange` follows the control: TextField -> TextChanged,
 * Toggle -> Toggled, Slider -> ValueChanged.
 */
export const eventForProp = (
  key: string,
  kind: number,
): { name: string; id: number } | undefined => {
  let name = PROP_TO_EVENT[key];
  if (name === undefined) {
    if (key !== "onChange") {
      return undefined;
    }
    name = kind === 4 ? "TextChanged" : kind === 5 ? "Toggled" : kind === 6 ? "ValueChanged" : "TextChanged";
  }
  const id = ASUKA_EVENTS[name];
  return id === undefined ? undefined : { name, id };
};

/** True for `onX` handler prop names claimed by the asuka event system. */
export const isAsukaEventProp = (key: string): boolean =>
  key in PROP_TO_EVENT || key === "onChange";

/**
 * `onX` prop name -> Asuka event name. Every key starts with `on`
 * followed by an uppercase letter (ilha convention).
 */
export const eventTypeFromProp = (key: string, kind = 1): string | undefined =>
  eventForProp(key, kind)?.name;

/** Single versioned payload forwarded per event (one handler per id). */
export interface AsukaEventPayload {
  /** Monotonic dispatch sequence. */
  version: number;
  /** Event name (`Press`, `TextChanged`, …). */
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
    `[ilha-asuka] "${key}" looks like an event handler; use "${"on"}${key[2].toUpperCase()}${key.slice(3)}" instead.`,
  );
};

/** Reset the once-only lowercase warning (tests). */
export const resetEventWarnings = (): void => {
  warnedLowercase.clear();
};

/**
 * Dispatch an event to the handler collected on `el` for `name`.
 * Returns true when a handler ran. Throws (and rethrows) nothing — a
 * throwing handler propagates to the caller, mirroring ilha `Effect`
 * semantics where the fiber owns the error channel.
 */
export const dispatchAsukaEvent = (
  el: AsukaElement,
  name: string,
  detail?: unknown,
): boolean => {
  const handler = el.handlers[name] as
    | ((payload: AsukaEventPayload) => void)
    | undefined;
  if (typeof handler !== "function") {
    return false;
  }
  version += 1;
  handler({
    detail,
    target: el.nodeId,
    timeStamp: Date.now(),
    type: name,
    version,
  });
  return true;
};

/** Adopt the latest handlers from `props` onto `el` for its kind. */
export const adoptAsukaEvents = (
  el: AsukaElement,
  props: Record<string, PropValue>,
): void => {
  for (const [key, value] of Object.entries(props)) {
    const event = eventForProp(key, el.kind);
    if (event !== undefined && typeof value === "function") {
      el.handlers[event.name] = value;
    }
  }
};
