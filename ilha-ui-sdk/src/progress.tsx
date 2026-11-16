// Progress (port of `@ui-sdk/solid`'s `progress`).
import { progress, type ProgressValueState } from "@ui-sdk/core/progress";
import { createParts } from "./primitive.ts";

const parts = createParts(progress, {
  indicator: "div",
  label: "span",
  root: "div",
  track: "div",
  value: "span",
});

/**
 * The root, which is the progressbar.
 * @stable
 */
const Progress = parts.Root;

/**
 * The rail the indicator fills.
 * @stable
 */
const ProgressTrack = parts.Track;

/**
 * The filled part of the track, as wide as the value.
 * @stable
 */
const ProgressIndicator = parts.Indicator;

/**
 * Names the progress bar.
 * @stable
 */
const ProgressLabel = parts.Label;

/**
 * The formatted value, like "40%". Children replace it.
 * @stable
 */
function ProgressValue(props: Parameters<typeof parts.Value>[0]) {
  return (
    <parts.Value {...props}>
      {props.children ?? ((state: ProgressValueState) => state.text)}
    </parts.Value>
  );
}

export type {
  GaugeLabelDetails,
  NumberFormat,
  ProgressOptions,
  ProgressPrimitive,
  ProgressState,
  ProgressStatus,
  ProgressValueState,
} from "@ui-sdk/core/progress";

export {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
};
