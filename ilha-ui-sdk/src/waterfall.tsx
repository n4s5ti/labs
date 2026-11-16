// Waterfall (port of `@ui-sdk/solid`'s `waterfall`).
//
// Without children, the root renders one row per item, with an indicator for
// branches. The axis renders one tick per `state.ticks` without children,
// and each tick shows its label.
import {
  waterfall as waterfallPrimitive,
  type WaterfallAxisState,
  type WaterfallDataItem,
  type WaterfallOptions,
  type WaterfallTimeProps,
  type WaterfallTimeState,
} from "@ui-sdk/core/waterfall";
import type { JSX } from "ilha/jsx-runtime";
import { childOf, createParts } from "./primitive.ts";

const parts = createParts(waterfallPrimitive, {
  root: "div",
  "header-row": "div",
  "column-header": "div",
  axis: "div",
  tick: "span",
  mark: "span",
  row: "div",
  "row-header": "div",
  indicator: "span",
  cell: "div",
  bar: "div",
});

/**
 * The props of `Waterfall`: its options, with rows it renders without
 * children.
 * @stable
 */
type WaterfallProps = WaterfallOptions & {
  children?: JSX.Element;
};

/**
 * Spans in rows, like a trace's waterfall. Without children it renders one
 * row per item.
 * @stable
 */
function Waterfall(props: WaterfallProps) {
  const children = childOf(props);
  return (
    <parts.Root {...omitOptions(props)}>
      {children ?? <WaterfallRows items={props.items} />}
    </parts.Root>
  );
}

function omitOptions(props: WaterfallProps) {
  const { children: _children, ...rest } = props;
  return rest;
}

const everySpan = (
  items: readonly WaterfallDataItem[],
): WaterfallDataItem[] =>
  items.flatMap((item) => [item, ...everySpan(item.children ?? [])]);

function WaterfallRows(props: { items: readonly WaterfallDataItem[] | undefined }) {
  return (
    <>
      {(props.items ? everySpan(props.items) : []).map((item) => (
        <WaterfallRow key={item.value} value={item.value}>
          <WaterfallRowHeader>
            {item.children ? <WaterfallIndicator /> : null}
            {item.label as JSX.Element}
          </WaterfallRowHeader>
          <WaterfallBar />
        </WaterfallRow>
      ))}
    </>
  );
}

/**
 * The row of column headings, with one `WaterfallColumnHeader` per column.
 * @stable
 */
const WaterfallHeaderRow = parts.HeaderRow;

/**
 * One column's heading.
 * @stable
 */
const WaterfallColumnHeader = parts.ColumnHeader;

/**
 * The time ruler above the rows. Without children it renders one tick per
 * `state.ticks`.
 * @stable
 */
function WaterfallAxis(props: Record<string, any>) {
  const children = childOf(props);
  return (
    <parts.Axis {...props}>
      {children ??
        ((state: WaterfallAxisState) => (
          <>
            {state.ticks.map((tick) => (
              <WaterfallTick key={tick.time} time={tick.time} />
            ))}
          </>
        ))}
    </parts.Axis>
  );
}

/**
 * One mark on the axis. Without children it shows its label.
 * @stable
 */
function WaterfallTick(
  props: WaterfallTimeProps & { children?: JSX.Element },
) {
  const children = childOf(props);
  return (
    <parts.Tick {...props}>
      {children ?? ((state: WaterfallTimeState) => state.label)}
    </parts.Tick>
  );
}

/**
 * A flag on the axis, like a crashed request's error.
 * @stable
 */
const WaterfallMark = parts.Mark;

/**
 * One span, expandable when it has children.
 * @stable
 */
const WaterfallRow = parts.Row;

/**
 * What a row shows besides its bar: its indicator and label.
 * @stable
 */
const WaterfallRowHeader = parts.RowHeader;

/**
 * Whether a row is open: a chevron that turns.
 * @stable
 */
const WaterfallIndicator = parts.Indicator;

/**
 * One cell of the row's grid.
 * @stable
 */
const WaterfallCell = parts.Cell;

/**
 * The bar that spans the row's time.
 * @stable
 */
const WaterfallBar = parts.Bar;

export { createWaterfallController, visibleWaterfallRows } from "@ui-sdk/core/waterfall";
export type {
  WaterfallApi,
  WaterfallAxisProps,
  WaterfallAxisState,
  WaterfallBarLabelDetails,
  WaterfallChangeOptions,
  WaterfallController,
  WaterfallData,
  WaterfallDataItem,
  WaterfallDataRow,
  WaterfallExpandedChangeReason,
  WaterfallOptions,
  WaterfallPrimitive,
  WaterfallRowPartProps,
  WaterfallRowProps,
  WaterfallRowState,
  WaterfallState,
  WaterfallTickData,
  WaterfallTimeProps,
  WaterfallTimeState,
  WaterfallValueChangeReason,
  ListHighlightDetails,
  NumberFormat,
} from "@ui-sdk/core/waterfall";

export {
  Waterfall,
  WaterfallAxis,
  WaterfallBar,
  WaterfallCell,
  WaterfallColumnHeader,
  WaterfallHeaderRow,
  WaterfallIndicator,
  WaterfallMark,
  type WaterfallProps,
  WaterfallRow,
  WaterfallRowHeader,
  WaterfallTick,
};
