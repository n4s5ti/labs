// Timeline (port of `@ui-sdk/solid`'s `timeline`).
import { timeline as timelinePrimitive } from "@ui-sdk/core/timeline";
import { createParts } from "./primitive.ts";

const parts = createParts(timelinePrimitive, {
  root: "div",
  item: "div",
  marker: "div",
  connector: "div",
  time: "time",
  title: "div",
  description: "div",
});

/**
 * Events in order, each with a marker on the line through them.
 * @stable
 */
const Timeline = parts.Root;

/**
 * One event, with its marker, time, title and description.
 * @stable
 */
const TimelineItem = parts.Item;

/**
 * The dot on the line for its item.
 * @stable
 */
const TimelineMarker = parts.Marker;

/**
 * The line between two markers.
 * @stable
 */
const TimelineConnector = parts.Connector;

/**
 * When its item happened. A `time` element by default.
 * @stable
 */
const TimelineTime = parts.Time;

/**
 * What its item is. Named by the item's status.
 * @stable
 */
const TimelineTitle = parts.Title;

/**
 * More about its item.
 * @stable
 */
const TimelineDescription = parts.Description;

export { createTimelineController } from "@ui-sdk/core/timeline";
export type {
  TimelineApi,
  TimelineConnectorState,
  TimelineController,
  TimelineDescriptionState,
  TimelineItemProps,
  TimelineItemState,
  TimelineMarkerState,
  TimelineOptions,
  TimelineOrientation,
  TimelinePrimitive,
  TimelineState,
  TimelineStatus,
  TimelineTimeState,
  TimelineTitleState,
} from "@ui-sdk/core/timeline";

export {
  Timeline,
  TimelineConnector,
  TimelineDescription,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
};
