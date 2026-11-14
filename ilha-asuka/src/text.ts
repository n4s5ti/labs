// Text nodes for the Asuka retained host.
//
// Text runs are Asuka Text views (kind 2) carrying their content in the
// `Text` schema prop — a bare string child is a real native text view,
// not a placeholder. The renderer self-sizes at layout time through the
// Go measure function; `estimateTextSize` is the TypeScript side of the
// same documented rule (0.6em monospace advance, explicit newlines
// only), so both sides of the FFI agree on content size.
import type { AsukaTreeNode, SyncHost } from "./host.ts";
import { AsukaElement } from "./paint.ts";
import { KIND_TEXT } from "./catalogue.ts";

/** Asuka kind ID for text runs. */
export const TEXT_KIND = KIND_TEXT;

/** Schema prop holding the string content on a text node. */
export const TEXT_PROP = "Text";

/** Allocate a text node carrying `text` (empty string stays a placeholder). */
export const createAsukaText = (host: SyncHost, text: string): AsukaElement => {
  const el = new AsukaElement(host, TEXT_KIND);
  el.setAttribute(TEXT_PROP, text);
  return el;
};

/** True when the element is a text node. */
export const isAsukaText = (el: AsukaElement): boolean => el.kind === TEXT_KIND;

/** Read the string content of a text node from the store (null if missing). */
export const getAsukaText = (host: SyncHost, id: number): string | null => {
  const tree: AsukaTreeNode | null = host.describe(id);
  if (tree === null || tree.kindId !== TEXT_KIND) {
    return null;
  }
  const text = tree.props[TEXT_PROP];
  return typeof text === "string" ? text : null;
};

/** Monospace stand-in metrics until the host reports glyph advances. */
export interface TextMetrics {
  width: number;
  height: number;
  lines: number;
}

/**
 * Estimate the laid-out size of `text` at `fontSize` px. Monospace advance
 * (`0.6em`) with explicit newlines only — the same rule the Go measure
 * function uses, so both sides agree. Not shaping.
 */
export const estimateTextSize = (text: string, fontSize = 16): TextMetrics => {
  const lines = text.split("\n");
  const advance = fontSize * 0.6;
  let width = 0;
  for (const line of lines) {
    width = Math.max(width, line.length * advance);
  }
  return { height: lines.length * fontSize * 1.2, lines: lines.length, width };
};
