// Collapsible (port of `@ui-sdk/solid`'s `collapsible`).
import { collapsible } from "@ui-sdk/core/collapsible";
import { createParts } from "./primitive.ts";

const parts = createParts(collapsible, {
  panel: "div",
  root: "div",
  trigger: "button",
});

/**
 * A panel of content that a button shows and hides. Put its trigger and panel inside.
 * @stable
 */
const Collapsible = parts.Root;

/**
 * The button that opens and closes the panel. It says whether the panel is open with `aria-expanded`.
 * @stable
 */
const CollapsibleTrigger = parts.Trigger;

/**
 * The content the trigger shows and hides. Closed, it leaves the page unless `keepMounted` or
 * `hiddenUntilFound` keeps it.
 * @stable
 */
const CollapsiblePanel = parts.Panel;

export { createCollapsibleController } from "@ui-sdk/core/collapsible";
export type {
  CollapsibleApi,
  CollapsibleChangeOptions,
  CollapsibleController,
  CollapsibleOpenChangeReason,
  CollapsibleOptions,
  CollapsiblePanelProps,
  CollapsiblePanelState,
  CollapsiblePrimitive,
  CollapsibleState,
  CollapsibleTriggerProps,
  CollapsibleTriggerState,
} from "@ui-sdk/core/collapsible";

export { Collapsible, CollapsiblePanel, CollapsibleTrigger };
