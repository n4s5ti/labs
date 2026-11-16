// Number utilities (port of `@ui-sdk/solid`'s `number`: a pure re-export of
// `@ui-sdk/core/number`, with no reactivity to bind).
export {
  clamp,
  decimalsOf,
  formatNumber,
  formatNumberRange,
  formatNumberToParts,
  fractionOf,
  isPartialNumber,
  maxOnGrid,
  numberFormatter,
  parseNumber,
  roundTo,
  scrubTo,
  stepBy,
  stepFromKey,
  stepValue,
  valueAt,
  wrap,
} from "@ui-sdk/core/number";
export type {
  NumberFormat,
  NumberKeyOptions,
  NumberMove,
  NumberRange,
  NumberScale,
  NumberScrub,
  NumberSnap,
  StepRange,
} from "@ui-sdk/core/number";
