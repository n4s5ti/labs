// Separator (port of `@ui-sdk/solid`'s `separator`).
import { separator } from "@ui-sdk/core/separator";
import { createParts } from "./primitive.ts";

const parts = createParts(separator, { root: "div" });

/**
 * A line between groups of content, announced as a separator unless it's `decorative`.
 * @stable
 */
const Separator = parts.Root;

export { Separator };
export type {
  SeparatorOptions,
  SeparatorOrientation,
  SeparatorPrimitive,
  SeparatorState,
} from "@ui-sdk/core/separator";
