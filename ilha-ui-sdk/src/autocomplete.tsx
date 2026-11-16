// Autocomplete (port of `@ui-sdk/solid`'s `autocomplete`).
//
// The popup renders inline, in place, while its slot is present: Ilha has no
// portal, so a second island (and its broken context/atoms) is out. Ancestor
// overflow or stacking contexts clip it; that is the documented tradeoff.
import {
  autocomplete as autocompletePrimitive,
  type AutocompleteContentProps,
  type AutocompleteContentState,
  type AutocompleteEmptyState,
  type AutocompleteInputState,
  type AutocompleteItemTextState,
  type AutocompleteOptions,
  type ListData,
} from "@ui-sdk/core/autocomplete";
import { atom, context, createContext, watch } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { joinField, useFieldControl } from "./field-context.ts";
import { ListItems, markSegments, textToMark, type ListParts } from "./list-text.tsx";
import { useControllerEntry } from "./controller-target.ts";
import {
  childOf,
  createParts,
  omit,
  providePrimitive,
  useAround,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

const parts = createParts(autocompletePrimitive, {
  arrow: "div",
  clear: "button",
  empty: "div",
  group: "div",
  "group-label": "div",
  "item-icon": "span",
  item: "div",
  label: "label",
  list: "div",
  separator: "div",
  status: "div",
  trigger: "button",
});

const AutocompleteContext = createContext<PrimitiveHandle<
  typeof autocompletePrimitive
> | null>(null);
// Where an AutocompleteContent among the autocomplete's children says it's
// there, so a data autocomplete renders its own list only when there's none.
const OwnContentContext = createContext<((present: boolean) => void) | null>(
  null,
);

function useAutocomplete() {
  const autocomplete = context(AutocompleteContext)();
  if (!autocomplete) {
    throw new Error("Autocomplete parts must be used inside <Autocomplete>.");
  }
  return autocomplete;
}

/**
 * The props of `Autocomplete`.
 * @stable
 */
type AutocompleteProps = AutocompleteOptions & {
  children?: JSX.Element;
};

/**
 * A text field that suggests as you type. The text is the value. Renders no element of its own.
 * @stable
 */
function Autocomplete(props: AutocompleteProps) {
  const field = useFieldControl();
  const autocomplete = usePrimitive(autocompletePrimitive, () => ({
    ...(omit(props, "children", "container") as AutocompleteOptions),
    disabled: props.disabled || field?.disabled(),
    name: props.name ?? field?.name(),
  }));
  useControllerEntry(() => props.controller, autocomplete);
  // Written by an AutocompleteContent among the children, while the children render.
  const hasContent = atom(false, { snapshot: false });
  const setHasContent = (present: boolean) => {
    if (hasContent() !== present) {
      queueMicrotask(() => {
        hasContent.set(present);
      });
    }
  };
  const children = childOf(props);
  const items = props.items;
  return (
    <AutocompleteContext.Provider value={autocomplete}>
      {providePrimitive(autocomplete, () => (
        <>
          <OwnContentContext.Provider value={setHasContent}>
            {children as JSX.Element}
          </OwnContentContext.Provider>
          {items && !hasContent() ? (
            <OwnContentContext.Provider value={null}>
              <AutocompleteContent />
            </OwnContentContext.Provider>
          ) : null}
        </>
      ))}
    </AutocompleteContext.Provider>
  );
}

/**
 * A visible label for the field.
 * @stable
 */
const AutocompleteLabel = parts.Label;

/**
 * The text field. It's the form control, so the text submits under the autocomplete's `name`.
 * @stable
 */
function AutocompleteInput(
  props: Omit<
    PartProps<"input", AutocompleteInputState>,
    "value" | "defaultValue" | "children" | "readonly"
  >,
) {
  const autocomplete = useAutocomplete();
  const input = joinField(useFieldControl(props), props, "input");
  return usePart(autocomplete, "input", undefined, input, "input");
}

/**
 * A button that opens and closes the suggestions, out of the tab order.
 * @stable
 */
const AutocompleteTrigger = parts.Trigger;

/**
 * A button that empties the field. Shown while there's text to clear. Name it with `aria-label`.
 * @stable
 */
const AutocompleteClear = parts.Clear;

/**
 * The popup that holds the suggestions, positioned against the field.
 * Renders inline, in place, while present (no portal).
 * @stable
 */
function AutocompleteContent(
  props: PartProps<"div", AutocompleteContentState> & AutocompleteContentProps,
) {
  const autocomplete = useAutocomplete();
  const register = context(OwnContentContext)();
  watch.once(() => {
    if (register) {
      queueMicrotask(() => register(true));
      return () => register(false);
    }
    return () => {};
  });
  const content = () => ({
    align: props.align,
    alignOffset: props.alignOffset,
    anchor: props.anchor,
    arrowPadding: props.arrowPadding,
    collisionPadding: props.collisionPadding,
    keepMounted: props.keepMounted,
    side: props.side,
    sideOffset: props.sideOffset,
  });
  const children = childOf(props);
  const rest = omit(
    props,
    "side",
    "align",
    "sideOffset",
    "alignOffset",
    "collisionPadding",
    "arrowPadding",
    "anchor",
    "keepMounted",
    "container",
  );
  const body = {
    ...rest,
    get children() {
      return (state: AutocompleteContentState) => (
        <>
          {autocomplete.present("header")
            ? (
              <div {...autocomplete.slot("header") } />
            )
            : null}
          {typeof children === "function" && children.length > 0
            ? (children as (state: AutocompleteContentState) => JSX.Element)(state)
            : (children ?? (state.items ? <AutocompleteList /> : null))}
        </>
      );
    },
  };
  const open = autocomplete.present("content", content);
  const element = usePart(autocomplete, "content", content, body, "div");
  return open ? element : null;
}

/**
 * The listbox. Without children, it renders the autocomplete's `items`, filtered.
 * @stable
 */
function AutocompleteList(props: Record<string, any>) {
  // From the part's state, so new items render the list again. Without items it's empty.
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return (
        children ??
        ((state: AutocompleteContentState) =>
          state.items ? <AutocompleteItems items={state.items} /> : null)
      );
    },
  };
  return <parts.List {...rest} />;
}

/**
 * A suggestion. Choosing it fills the field in with its text.
 * @stable
 */
const AutocompleteItem = parts.Item;

/**
 * The suggestion's text, with the part the field's text matched in `<mark>`. Without string content, it shows the suggestion's label.
 * @stable
 */
function AutocompleteItemText(
  props: PartProps<"span", AutocompleteItemTextState>,
) {
  const item = useAround(autocompletePrimitive, "item");
  if (!item) {
    throw new Error(
      "<AutocompleteItemText> must be used inside <AutocompleteItem>.",
    );
  }
  const key = () => item().value as string;
  const part = () => ({
    id: key(),
    text: textToMark(childOf(props), (item().label as string) ?? key()),
  });
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return typeof children === "function"
        ? children
        : (state: AutocompleteItemTextState) => markSegments(state.segments);
    },
  };
  return usePart(useAutocomplete(), "item-text", part, rest, "span");
}

/**
 * An icon inside a suggestion. Screen readers, typeahead and filtering skip it, and `mirror` flips
 * it in right-to-left text.
 * @stable
 */
const AutocompleteItemIcon = parts.ItemIcon;

/**
 * A group of items, named by its `AutocompleteGroupLabel`, and hidden while none of its items shows.
 * @stable
 */
const AutocompleteGroup = parts.Group;

/**
 * The group's heading, which names the group.
 * @stable
 */
const AutocompleteGroupLabel = parts.GroupLabel;

/**
 * A line between items or groups, hidden from screen readers.
 * @stable
 */
const AutocompleteSeparator = parts.Separator;

/**
 * Shown while no suggestion matches. Its message is announced when it appears.
 * @stable
 */
function AutocompleteEmpty(props: Record<string, any>) {
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return typeof children === "function"
        ? children
        : (state: AutocompleteEmptyState) => (state.empty ? children : null);
    },
  };
  return <parts.Empty {...rest} />;
}

/**
 * A polite live region for loading and result counts. Its content is yours, usually a function of its state.
 * @stable
 */
const AutocompleteStatus = parts.Status;

/**
 * An arrow on the popup's edge that points at the field.
 * @stable
 */
const AutocompleteArrow = parts.Arrow;

/**
 * Renders data suggestions. Used by data autocompletes, and available for custom layouts.
 * @stable
 */
function AutocompleteItems(props: { items: ListData<string> }) {
  return (
    <ListItems
      items={props.items as unknown as { type?: string }[]}
      parts={listParts}
    />
  );
}

const listParts: ListParts = {
  Group: AutocompleteGroup,
  GroupLabel: AutocompleteGroupLabel,
  Item: AutocompleteItem,
  Separator: AutocompleteSeparator,
};

export { createAutocompleteController } from "@ui-sdk/core/autocomplete";
export type {
  AutocompleteApi,
  AutocompleteArrowState,
  AutocompleteChangeOptions,
  AutocompleteClearProps,
  AutocompleteClearState,
  AutocompleteContentProps,
  AutocompleteContentState,
  AutocompleteController,
  AutocompleteDismissReason,
  AutocompleteEmptyState,
  AutocompleteInputState,
  AutocompleteItemIconProps,
  AutocompleteItemIconState,
  AutocompleteItemProps,
  AutocompleteItemState,
  AutocompleteItemTextState,
  AutocompleteOpenChangeReason,
  AutocompleteOptions,
  AutocompletePrimitive,
  AutocompleteStatusState,
  AutocompleteSubmitDetails,
  AutocompleteTriggerState,
  AutocompleteValueChangeReason,
  ListAnnouncement,
  ListData,
  ListFilter,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
  MatchSegment,
  SearchFilter,
} from "@ui-sdk/core/autocomplete";

export {
  Autocomplete,
  AutocompleteArrow,
  AutocompleteClear,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteItemIcon,
  AutocompleteItems,
  AutocompleteItemText,
  AutocompleteLabel,
  AutocompleteList,
  type AutocompleteProps,
  AutocompleteSeparator,
  AutocompleteStatus,
  AutocompleteTrigger,
};
