// Text nodes for the mygo retained host.
//
// The store holds the string content (`#text` kind, `text` prop); the
// renderer self-sizes at paint time (glyph-atlas/SDF equivalent on a real
// mygo front-end). Empty strings are real placeholders so dispatch keeps
// working; there is no core measurement hook — `estimateTextSize` is the
// documented stand-in until host metrics land.
import type { MygoTreeNode, SyncHost } from "./host.ts";
import { MygoElement } from "./paint.ts";

/** Kind used for text nodes in the store. */
export const TEXT_KIND = "#text";

/** Prop holding the string content on a text node. */
export const TEXT_PROP = "text";

/** Allocate a text node carrying `text` (empty string stays a placeholder). */
export const createMygoText = (host: SyncHost, text: string): MygoElement => {
  const el = new MygoElement(host, TEXT_KIND);
  el.setAttribute(TEXT_PROP, text);
  return el;
};

/** True when the element is a text node. */
export const isMygoText = (el: MygoElement): boolean =>
  el.tagName === TEXT_KIND;

/** Read the string content of a text node from the store (null if missing). */
export const getMygoText = (
  host: SyncHost,
  id: number,
): string | null => {
  const tree: MygoTreeNode | null = host.describe(id);
  if (tree === null || tree.kind !== TEXT_KIND) {
    return null;
  }
  return tree.props[TEXT_PROP] ?? null;
};

/** Monospace stand-in metrics until the host reports glyph advances. */
export interface TextMetrics {
  width: number;
  height: number;
  lines: number;
}

/**
 * Estimate the laid-out size of `text` at `fontSize` px. Monospace advance
 * (`0.6em`) with explicit newlines only — a placeholder, not shaping.
 */
export const estimateTextSize = (
  text: string,
  fontSize = 16,
): TextMetrics => {
  const lines = text.split("\n");
  const advance = fontSize * 0.6;
  let width = 0;
  for (const line of lines) {
    width = Math.max(width, line.length * advance);
  }
  return { height: lines.length * fontSize * 1.2, lines: lines.length, width };
};
