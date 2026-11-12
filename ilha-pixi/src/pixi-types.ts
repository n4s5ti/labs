import type { FederatedEvent } from "pixi.js";

import type { PixiEvent } from "./events.ts";

/** Pointer and wheel handlers on pixi elements. */
export interface PixiEventProps {
  onClick?: (event: PixiEvent) => void;
  onPointerDown?: (event: FederatedEvent) => void;
  onPointerUp?: (event: FederatedEvent) => void;
  onPointerMove?: (event: FederatedEvent) => void;
  onPointerOver?: (event: FederatedEvent) => void;
  onPointerOut?: (event: FederatedEvent) => void;
  onPointerEnter?: (event: FederatedEvent) => void;
  onPointerLeave?: (event: FederatedEvent) => void;
  onPointerCancel?: (event: FederatedEvent) => void;
  onPointerTap?: (event: FederatedEvent) => void;
  onPointerUpOutside?: (event: FederatedEvent) => void;
  onMouseDown?: (event: FederatedEvent) => void;
  onMouseUp?: (event: FederatedEvent) => void;
  onMouseMove?: (event: FederatedEvent) => void;
  onMouseOver?: (event: FederatedEvent) => void;
  onMouseOut?: (event: FederatedEvent) => void;
  onMouseEnter?: (event: FederatedEvent) => void;
  onMouseLeave?: (event: FederatedEvent) => void;
  onMouseUpOutside?: (event: FederatedEvent) => void;
  onTouchStart?: (event: FederatedEvent) => void;
  onTouchEnd?: (event: FederatedEvent) => void;
  onTouchMove?: (event: FederatedEvent) => void;
  onTouchCancel?: (event: FederatedEvent) => void;
  onTouchEndOutside?: (event: FederatedEvent) => void;
  onRightClick?: (event: FederatedEvent) => void;
  onRightDown?: (event: FederatedEvent) => void;
  onRightUp?: (event: FederatedEvent) => void;
  onRightUpOutside?: (event: FederatedEvent) => void;
  onTap?: (event: FederatedEvent) => void;
  onWheel?: (event: FederatedEvent) => void;
  onGlobalPointerMove?: (event: FederatedEvent) => void;
  onGlobalMouseMove?: (event: FederatedEvent) => void;
  onGlobalTouchMove?: (event: FederatedEvent) => void;
}

/** Props every pixi.js JSX element accepts. */
export interface PixiElementProps extends PixiEventProps {
  /** Any other pixi.js property (`alpha`, `tint`, `texture`, …). */
  readonly [property: string]: unknown;
  /** Constructor arguments; changing them reconstructs the object. */
  args?: readonly unknown[];
  /**
   * Target on the parent to attach to (`"filters"`, or a
   * `(parent, child)` function). `Filter` children auto-attach to
   * `filters`.
   */
  attach?: string | ((parent: unknown, child: unknown) => void);
  /** Passed-through object for `<primitive object={...} />`. */
  object?: unknown;
  /**
   * `dispose={null}` opts out of auto-dispose when the element unmounts.
   * Any other value (including omission) destroys on unmount.
   */
  dispose?: null | undefined;
  /** Called with the live object after props apply and on updates. */
  onUpdate?: (object: unknown) => void;
  /**
   * Redraw callback for `<graphics>` (`draw={(g) => g.rect(…).fill(…)}`),
   * re-run after every prop application.
   */
  draw?: (graphics: unknown) => void;
  eventMode?: unknown;
  cursor?: unknown;
  position?: unknown;
  rotation?: unknown;
  scale?: unknown;
  pivot?: unknown;
  skew?: unknown;
  anchor?: unknown;
  children?: unknown;
  key?: string | number;
  ref?: unknown;
}

/** `<primitive object={...} />` escape hatch. */
export interface PrimitiveProps extends PixiElementProps {
  object: unknown;
}

declare module "ilha/jsx-runtime" {
  // oxlint-disable-next-line typescript/no-namespace -- merges into ilha's JSX namespace
  namespace JSX {
    interface IntrinsicElements {
      primitive: PixiElementProps & { object: unknown };
      container: PixiElementProps;
      sprite: PixiElementProps;
      graphics: PixiElementProps;
      // No `text`: it collides with SVG's <text>. Use <pixiText>, which
      // resolves to the same `Text` constructor (like three's `line`
      // precedent in ilha-tree).
      pixiText: PixiElementProps;
      htmlText: PixiElementProps;
      bitmapText: PixiElementProps;
      tilingSprite: PixiElementProps;
      animatedSprite: PixiElementProps;
      mesh: PixiElementProps;
      meshPlane: PixiElementProps;
      meshRope: PixiElementProps;
      nineSliceSprite: PixiElementProps;
      particleContainer: PixiElementProps;
      blurFilter: PixiElementProps;
      colorMatrixFilter: PixiElementProps;
      displacementFilter: PixiElementProps;
      noiseFilter: PixiElementProps;
      alphaFilter: PixiElementProps;
    }
  }
}
