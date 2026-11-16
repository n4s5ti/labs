// Calendar (port of `@ui-sdk/solid`'s `calendar`).
import {
  calendar as calendarPrimitive,
  type CalendarDayState,
  type CalendarGridCell,
  type CalendarGridState,
  type CalendarHeadingState,
  type CalendarOptions,
  type CalendarSelectState,
  type CalendarState,
  type CalendarStepState,
  type CalendarWeekdayState,
} from "@ui-sdk/core/calendar";
import { context, createContext } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { CalendarContext, monthCount } from "./calendar-context.ts";
import { childOf, usePart, usePrimitive, type PartProps } from "./primitive.ts";

// A grid's offset and state, for the rows and days inside it.
type GridContextValue = { readonly offset: number; state: CalendarGridState };

const GridContext = createContext<GridContextValue | null>(null);

function useCalendar(part: string) {
  const calendar = context(CalendarContext)();
  if (!calendar) {
    throw new Error(
      `${part} must be used inside <Calendar> or <DatePickerContent>.`,
    );
  }
  return calendar;
}

function useGrid(part: string) {
  const grid = context(GridContext)();
  if (!grid) {
    throw new Error(`${part} must be used inside <CalendarGrid>.`);
  }
  return grid;
}

// The part's props with `children` defaulting to `fallback` when it has none:
// content, or a function of the part's state that returns it.
function withFallback<State>(
  props: Record<string, any>,
  fallback: (state: State) => JSX.Element,
) {
  return {
    ...props,
    get children() {
      return childOf(props) ?? fallback;
    },
  };
}

// Children that take the part's state are called with it, as `usePart` does.
const ofState = (children: unknown, state: unknown) =>
  typeof children === "function" && (children as (...args: unknown[]) => unknown).length > 0
    ? (children as (state: unknown) => JSX.Element)(state)
    : (children as JSX.Element);

/**
 * Months of days with one tab stop. Without children it renders a heading,
 * Previous and Next, and a grid for each month.
 * @stable
 */
function Calendar(props: CalendarOptions & PartProps<"div", CalendarState>) {
  const calendar = usePrimitive(calendarPrimitive, () => ({
    allowUnavailable: props.allowUnavailable,
    controller: props.controller,
    debug: props.debug,
    defaultMonth: props.defaultMonth,
    defaultValue: props.defaultValue,
    deselectable: props.deselectable,
    disabled: props.disabled,
    fixedWeeks: props.fixedWeeks,
    locale: props.locale,
    max: props.max,
    maxDays: props.maxDays,
    min: props.min,
    minDays: props.minDays,
    mode: props.mode,
    month: props.month,
    monthFormat: props.monthFormat,
    months: props.months,
    onAnchorChange: props.onAnchorChange,
    onFocusedChange: props.onFocusedChange,
    onMonthChange: props.onMonthChange,
    onValueChange: props.onValueChange,
    pageBy: props.pageBy,
    readOnly: props.readOnly,
    showOutsideDays: props.showOutsideDays,
    timeZone: props.timeZone,
    today: props.today,
    unavailable: props.unavailable,
    value: props.value,
    weekStartsOn: props.weekStartsOn,
    weekdayFormat: props.weekdayFormat,
  }));
  const rest = { ...props };
  for (const key of [
    "mode",
    "value",
    "defaultValue",
    "onValueChange",
    "month",
    "defaultMonth",
    "onMonthChange",
    "min",
    "max",
    "unavailable",
    "disabled",
    "readOnly",
    "deselectable",
    "onFocusedChange",
    "onAnchorChange",
    "months",
    "pageBy",
    "locale",
    "weekStartsOn",
    "weekdayFormat",
    "monthFormat",
    "fixedWeeks",
    "showOutsideDays",
    "today",
    "timeZone",
    "minDays",
    "maxDays",
    "allowUnavailable",
    "controller",
    "debug",
  ]) {
    delete rest[key as keyof typeof rest];
  }
  const count = monthCount(props.months);
  const fallback = () => (
    <>
      <div>
        <CalendarPrevious />
        <CalendarHeading />
        <CalendarNext />
      </div>
      {Array.from({ length: count }, (_, offset) => (
        <CalendarGrid key={offset} offset={offset} />
      ))}
    </>
  );
  return (
    <CalendarContext.Provider value={calendar}>
      {usePart(
        calendar,
        "root",
        undefined,
        withFallback(rest, fallback),
        "div",
      )}
    </CalendarContext.Provider>
  );
}

/**
 * The months shown, like "October 2026". Screen readers hear it change.
 * @stable
 */
function CalendarHeading(props: PartProps<"h2", CalendarHeadingState>) {
  const calendar = useCalendar("CalendarHeading");
  const label = (state: CalendarHeadingState) => state.label;
  return usePart(
    calendar,
    "heading",
    undefined,
    withFallback(props, label),
    "h2",
  );
}

type SelectProps = Omit<PartProps<"select", CalendarSelectState>, "value">;

function selectPart(
  name: "month-select" | "year-select",
  part: string,
  props: SelectProps,
) {
  const calendar = useCalendar(part);
  const options = (state: CalendarSelectState) => (
    <>
      {state.options.map((option) => (
        <option
          key={String(option.value)}
          value={String(option.value)}
          disabled={option.disabled}
          selected={option.value === state.value}
        >
          {option.label}
        </option>
      ))}
    </>
  );
  return usePart(
    calendar,
    name,
    undefined,
    withFallback(props, options),
    "select",
  );
}

/**
 * A native select of the months, in the locale, that turns the first month shown.
 * @stable
 */
function CalendarMonthSelect(props: SelectProps) {
  return selectPart("month-select", "CalendarMonthSelect", props);
}

/**
 * A native select of the years from `min` to `max`, or 10 either side of the year shown.
 * @stable
 */
function CalendarYearSelect(props: SelectProps) {
  return selectPart("year-select", "CalendarYearSelect", props);
}

type StepProps = PartProps<"button", CalendarStepState>;

function stepPart(name: "previous" | "next", part: string, props: StepProps) {
  const calendar = useCalendar(part);
  const glyph = name === "previous" ? "‹" : "›";
  return usePart(
    calendar,
    name,
    undefined,
    withFallback(props, () => glyph),
    "button",
  );
}

/**
 * Shows the month before. Named "Previous month"; pass `aria-label` in another language.
 * @stable
 */
function CalendarPrevious(props: StepProps) {
  return stepPart("previous", "CalendarPrevious", props);
}

/**
 * Shows the month after. Named "Next month"; pass `aria-label` in another language.
 * @stable
 */
function CalendarNext(props: StepProps) {
  return stepPart("next", "CalendarNext", props);
}

/**
 * One month's grid, a table. `offset` picks which of the months shown, from 0.
 * Without children it renders its weekdays and weeks.
 * @stable
 */
function CalendarGrid(
  props: PartProps<"table", CalendarGridState> & { offset?: number },
) {
  const calendar = useCalendar("CalendarGrid");
  const offset = props.offset ?? 0;
  const part = () => ({
    id: String(offset),
    offset,
  });
  const rest = { ...props };
  delete rest.offset;
  // The grid's state reaches its rows and days through context, so the
  // children render inside it, as a function of the state.
  const content = (state: CalendarGridState) => {
    const grid: GridContextValue = { offset, state };
    return (
      <GridContext.Provider value={grid}>
        {ofState(childOf(props), state) ?? (
          <>
            <CalendarWeekdays />
            <CalendarWeeks />
          </>
        )}
      </GridContext.Provider>
    );
  };
  return usePart(calendar, "grid", part, { ...rest, children: content }, "table");
}

/**
 * The header row of weekday names, a weekday in each column. Its children can
 * be a function of the column's index that renders it, like
 * `(index) => <CalendarWeekday index={index} class="…" />`.
 * @stable
 */
function CalendarWeekdays(
  props: Omit<JSX.IntrinsicElements["thead"], "children"> & {
    children?: (index: number) => JSX.Element;
  },
) {
  const calendar = useCalendar("CalendarWeekdays");
  const grid = useGrid("CalendarWeekdays");
  const rest = { ...props };
  delete rest.children;
  const row = calendar.slot("weekdays", () => ({ id: String(grid.offset) }));
  // By column: a column's header stays when the week starts on another day.
  return (
    <thead {...rest}>
      <tr {...row}>
        {grid.state.weekdays.map((_, index) => {
          const render = childOf(props) as unknown as
            | ((index: number) => JSX.Element)
            | undefined;
          return render ? (
            render(index)
          ) : (
            <CalendarWeekday key={index} index={index} />
          );
        })}
      </tr>
    </thead>
  );
}

/**
 * A weekday's column header. Shows its name in `weekdayFormat` unless it has children.
 * @stable
 */
function CalendarWeekday(
  props: PartProps<"th", CalendarWeekdayState> & { index: number },
) {
  const calendar = useCalendar("CalendarWeekday");
  const grid = useGrid("CalendarWeekday");
  const part = () => ({
    id: `${grid.offset}-${props.index}`,
    index: props.index,
  });
  const rest = { scope: "col", ...props };
  delete (rest as { index?: unknown }).index;
  const label = (state: CalendarWeekdayState) => state.label;
  return usePart(calendar, "weekday", part, withFallback(rest, label), "th");
}

/**
 * The weeks of the grid's month, a row each, with a day in each cell. Its
 * children can be a function of a cell that renders its day, like
 * `(cell) => <CalendarDay value={cell.date} class="…" />`. A cell that shows
 * nothing stays an empty cell.
 * @stable
 */
function CalendarWeeks(
  props: Omit<JSX.IntrinsicElements["tbody"], "children"> & {
    children?: (cell: CalendarGridCell) => JSX.Element;
  },
) {
  const calendar = useCalendar("CalendarWeeks");
  const grid = useGrid("CalendarWeeks");
  const rest = { ...props };
  delete rest.children;
  const render = childOf(props) as unknown as
    | ((cell: CalendarGridCell) => JSX.Element)
    | undefined;
  const day = (cell: CalendarGridCell) =>
    render ? render(cell) : <CalendarDay value={cell.date} />;
  // Keyed by date, so a week and a day that show in the next month too stay.
  return (
    <tbody {...rest}>
      {grid.state.weeks.map((week, index) => {
        // Before the row's element, as on the server, so hydration keys line up.
        const row = calendar.slot("week", () => ({
          id: `${grid.offset}-${index}`,
        }));
        return (
          <tr key={week[0]!.date} {...row}>
            {week.map((cell) => (
              <>{cell.hidden ? <td /> : day(cell)}</>
            ))}
          </tr>
        );
      })}
    </tbody>
  );
}

/**
 * A day. Shows the day of the month unless it has children; arrow keys move between days.
 * @stable
 */
function CalendarDay(
  props: PartProps<"td", CalendarDayState> & { value: string },
) {
  const calendar = useCalendar("CalendarDay");
  const grid = context(GridContext)();
  const part = () => ({ offset: grid?.offset ?? 0, value: props.value });
  const rest = { ...props };
  delete (rest as Record<string, unknown>).value;
  const label = (state: CalendarDayState) => state.label;
  return usePart(calendar, "day", part, withFallback(rest, label), "td");
}

export { createCalendarController } from "@ui-sdk/core/calendar";
export type {
  CalendarAnchorChangeReason,
  CalendarApi,
  CalendarChangeOptions,
  CalendarController,
  CalendarDayProps,
  CalendarDayState,
  CalendarFocusedChangeReason,
  CalendarGridCell,
  CalendarGridProps,
  CalendarGridState,
  CalendarHeadingState,
  CalendarMode,
  CalendarMonthChangeReason,
  CalendarOptions,
  CalendarPrimitive,
  CalendarSelectOption,
  CalendarSelectState,
  CalendarState,
  CalendarStepState,
  CalendarValue,
  CalendarValueChangeReason,
  CalendarWeekdayProps,
  CalendarWeekdayState,
  DateMatcher,
  DateMatchers,
  ISOMonth,
} from "@ui-sdk/core/calendar";

export {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarMonthSelect,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  CalendarYearSelect,
};
