import type { MygoEventPayload } from "./events.ts";

/** Pointer, change and submit handlers on mygo elements. */
export interface MygoEventProps {
  onClick?: (event: MygoEventPayload) => void;
  onPointerDown?: (event: MygoEventPayload) => void;
  onPointerUp?: (event: MygoEventPayload) => void;
  onPointerMove?: (event: MygoEventPayload) => void;
  onPointerOver?: (event: MygoEventPayload) => void;
  onPointerOut?: (event: MygoEventPayload) => void;
  onPointerEnter?: (event: MygoEventPayload) => void;
  onPointerLeave?: (event: MygoEventPayload) => void;
  onChange?: (event: MygoEventPayload) => void;
  onSubmitted?: (event: MygoEventPayload) => void;
  onSubmit?: (event: MygoEventPayload) => void;
  onFocus?: (event: MygoEventPayload) => void;
  onBlur?: (event: MygoEventPayload) => void;
}

/** Props every mygo JSX element accepts. */
export interface MygoElementProps extends MygoEventProps {
  /** Any other prop lands in the store as a string (`width`, `gap`, …). */
  readonly [property: string]: unknown;
  /**
   * `dispose={null}` opts out of auto-dispose when the element unmounts.
   * Any other value (including omission) removes on unmount.
   */
  dispose?: null | undefined;
  /** Layout: flexbox Row/Column/Box + Grid in device-independent px. */
  direction?: string;
  gap?: string | number;
  padding?: string | number;
  width?: string | number;
  height?: string | number;
  /** Text content for `<text value="…">` (children work too). */
  value?: string;
  children?: unknown;
  key?: string | number;
  ref?: unknown;
}

declare module "ilha/jsx-runtime" {
  // oxlint-disable-next-line typescript/no-namespace -- merges into ilha's JSX namespace
  namespace JSX {
    interface IntrinsicElements {
      box: MygoElementProps;
      row: MygoElementProps;
      column: MygoElementProps;
      grid: MygoElementProps;
      // `text`, `button`, `input` and `label` collide with DOM/SVG
      // intrinsics — the `mygo` prefix pierces to the same kinds (pixi
      // `pixiText` precedent). `view`/`image`/`scroll` do not collide.
      mygoText: MygoElementProps;
      image: MygoElementProps;
      mygoButton: MygoElementProps;
      mygoInput: MygoElementProps;
      mygoLabel: MygoElementProps;
      scroll: MygoElementProps;
      view: MygoElementProps;
    }
  }
}
