import { Container, EventSystem, extensions, FederatedContainer } from "pixi.js";
import type { FederatedEvent } from "pixi.js";

/**
 * Guarantee the pixi events extension exists. Tree-shaking bundlers drop
 * pixi's own `events/init` module (the `pixi.js` barrel never imports it),
 * which leaves renderers without an `EventSystem` — and then no pointer
 * event is ever delivered, silently. The bindings own event delivery, so
 * they register it here, mirroring that init module. Registration dedupes
 * by extension name (`"events"`), and the mixin re-applies identical
 * descriptors, so this is a no-op when the host bundler kept pixi's own.
 */
extensions.add(EventSystem);
extensions.mixin(Container, FederatedContainer);

/** Pointer event delivered to pixi handlers (native `FederatedEvent`). */
export type PixiEvent = FederatedEvent;

/**
 * `onX` prop name -> pixi event name. Every key starts with `on` followed
 * by an uppercase letter (ilha convention); values are the lowercase
 * pixi.js event names assigned directly onto the instance
 * (`sprite.onclick = handler`, per `FederatedEventTarget`).
 */
export const PIXI_EVENT_PROPS: Readonly<Record<string, string>> = {
  onClick: "click",
  onPointerDown: "pointerdown",
  onPointerUp: "pointerup",
  onPointerMove: "pointermove",
  onPointerOver: "pointerover",
  onPointerOut: "pointerout",
  onPointerEnter: "pointerenter",
  onPointerLeave: "pointerleave",
  onPointerCancel: "pointercancel",
  onPointerTap: "pointertap",
  onPointerUpOutside: "pointerupoutside",
  onMouseDown: "mousedown",
  onMouseUp: "mouseup",
  onMouseMove: "mousemove",
  onMouseOver: "mouseover",
  onMouseOut: "mouseout",
  onMouseEnter: "mouseenter",
  onMouseLeave: "mouseleave",
  onMouseUpOutside: "mouseupoutside",
  onTouchStart: "touchstart",
  onTouchEnd: "touchend",
  onTouchMove: "touchmove",
  onTouchCancel: "touchcancel",
  onTouchEndOutside: "touchendoutside",
  onRightClick: "rightclick",
  onRightDown: "rightdown",
  onRightUp: "rightup",
  onRightUpOutside: "rightupoutside",
  onTap: "tap",
  onWheel: "wheel",
  onGlobalPointerMove: "globalpointermove",
  onGlobalMouseMove: "globalmousemove",
  onGlobalTouchMove: "globaltouchmove",
};

/** True for `onX` handler prop names claimed by the pixi event system. */
export const isPixiEventProp = (key: string): boolean =>
  key in PIXI_EVENT_PROPS;

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
    `[ilha-pixi] "${key}" looks like an event handler; use "${"on"}${key[2].toUpperCase()}${key.slice(3)}" instead.`,
  );
};

/** Reset the once-only lowercase warning (tests). */
export const resetEventWarnings = (): void => {
  warnedLowercase.clear();
};
