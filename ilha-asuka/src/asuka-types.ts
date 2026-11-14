import type { AsukaEventPayload } from "./events.ts";

/** Handlers ilha routes to host event subscriptions (Asuka event names). */
export interface AsukaEventProps {
  onClick?: (event: AsukaEventPayload) => void;
  onLongPress?: (event: AsukaEventPayload) => void;
  onChange?: (event: AsukaEventPayload) => void;
  onToggle?: (event: AsukaEventPayload) => void;
  onValueChange?: (event: AsukaEventPayload) => void;
  onSubmit?: (event: AsukaEventPayload) => void;
  onFocus?: (event: AsukaEventPayload) => void;
  onBlur?: (event: AsukaEventPayload) => void;
}

/** Props every asuka JSX element accepts. */
export interface AsukaElementProps extends AsukaEventProps {
  /** Any other prop lands in the store (`width`, `gap`, …). */
  readonly [property: string]: unknown;
  /**
   * `dispose={null}` opts out of auto-dispose when the element unmounts.
   * Any other value (including omission) destroys on unmount.
   */
  dispose?: null | undefined;
  /** Layout inputs (direction, gap, padding, width, height, align, justify). */
  direction?: string;
  wrap?: string;
  gap?: string | number;
  padding?: string | number;
  width?: string | number;
  height?: string | number;
  align?: string;
  justify?: string;
  grow?: string | number;
  shrink?: string | number;
  /** Text content for `<asukaText value="…">` (children work too). */
  value?: string;
  children?: unknown;
  key?: string | number;
  ref?: unknown;
}

declare module "ilha/jsx-runtime" {
  // oxlint-disable-next-line typescript/no-namespace -- merges into ilha's JSX namespace
  namespace JSX {
    interface IntrinsicElements {
      box: AsukaElementProps;
      row: AsukaElementProps;
      column: AsukaElementProps;
      grid: AsukaElementProps;
      toggle: AsukaElementProps;
      slider: AsukaElementProps;
      // `text`, `button`, `input` and `label` collide with DOM/SVG
      // intrinsics — the `asuka` prefix pierces to the same kinds
      // (pixi `pixiText` precedent). `scroll`, `view` and `image`
      // do not collide.
      asukaText: AsukaElementProps;
      asukaButton: AsukaElementProps;
      asukaInput: AsukaElementProps;
      asukaImage: AsukaElementProps;
      image: AsukaElementProps;
      scroll: AsukaElementProps;
      view: AsukaElementProps;
    }
  }
}
