// Command (port of `@ui-sdk/solid`'s `command`).
import {
  command as commandPrimitive,
  type CommandData,
  type CommandEmptyState,
  type CommandItemProps,
  type CommandItemState,
  type CommandItemTextState,
  type CommandListState,
  type CommandOptions,
  type CommandPageProps,
  type CommandShortcutState,
  type CommandState,
} from "@ui-sdk/core/command";
import { atom, context, createContext, watch } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { useControllerEntry } from "./controller-target.ts";
import { markSegments, textToMark } from "./list-text.tsx";
import {
  childOf,
  createParts,
  omit,
  useAround,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

const parts = createParts(commandPrimitive, {
  empty: "div",
  group: "div",
  "group-label": "div",
  input: "input",
  "item-icon": "span",
  separator: "div",
  shortcut: "span",
  status: "div",
});

const CommandContext = createContext<PrimitiveHandle<
  typeof commandPrimitive
> | null>(null);
// The page parts sit on: `null` for the first page. Not provided outside any page.
const PageContext = createContext<{ page: string | null } | null>(null);
// Set while rendering data commands, whose shortcuts the root binds.
const DataContext = createContext<boolean>(false);
// Where a CommandList among the command's children says it's there, so a
// data command renders its own list only when there's none.
const OwnListContext = createContext<((present: boolean) => void) | null>(null);

function useCommand() {
  const command = context(CommandContext)();
  if (!command) {
    throw new Error("Command parts must be used inside <Command>.");
  }
  return command;
}

// Element props that mean something else on a command part.
type Clashing = "value" | "defaultValue" | "onChange" | "onSelect";

/**
 * The props of `Command`.
 * @stable
 */
type CommandProps = CommandOptions &
  Omit<PartProps<"div", CommandState>, Clashing> & {};

const optionKeys = [
  "value",
  "defaultValue",
  "onValueChange",
  "query",
  "defaultQuery",
  "onQueryChange",
  "pages",
  "defaultPages",
  "onPagesChange",
  "onAction",
  "pendingAnnouncement",
  "items",
  "emptyItems",
  "filter",
  "autoHighlight",
  "loop",
  "status",
  "onLoadMore",
  "announcement",
  "controller",
  "debug",
] as const;

let nextCommandId = 0;

/**
 * A search field over an always-open list of commands. Renders a `div` around them.
 * @stable
 */
function Command(props: CommandProps) {
  const command = usePrimitive(commandPrimitive, () => ({
    announcement: props.announcement,
    autoHighlight: props.autoHighlight,
    controller: props.controller,
    debug: props.debug,
    defaultPages: props.defaultPages,
    defaultQuery: props.defaultQuery,
    defaultValue: props.defaultValue,
    emptyItems: props.emptyItems,
    filter: props.filter,
    items: props.items,
    loop: props.loop,
    onAction: props.onAction,
    onLoadMore: props.onLoadMore,
    onPagesChange: props.onPagesChange,
    onQueryChange: props.onQueryChange,
    onValueChange: props.onValueChange,
    pages: props.pages,
    pendingAnnouncement: props.pendingAnnouncement,
    query: props.query,
    status: props.status,
    value: props.value,
  }));
  useControllerEntry(() => props.controller, command);
  // Written by a CommandList among the children, while the children render.
  const hasList = atom(false, { snapshot: false });
  const setHasList = (present: boolean) => {
    if (hasList() !== present) {
      queueMicrotask(() => {
        hasList.set(present);
      });
    }
  };
  const rest = omit(props, ...optionKeys as unknown as string[]);
  const children = childOf(props);
  const items = props.items;
  const body = {
    ...rest,
    get children() {
      return (state: CommandState) => (
        <OwnListContext.Provider value={setHasList}>
          {(() => {
            if (typeof children === "function" && children.length > 0) {
              return (children as (state: CommandState) => JSX.Element)(state);
            }
            return (
              <>
                {children as JSX.Element}
                {items && !hasList() ? (
                  <OwnListContext.Provider value={null}>
                    <CommandList />
                  </OwnListContext.Provider>
                ) : null}
              </>
            );
          })()}
        </OwnListContext.Provider>
      );
    },
  };
  return (
    <CommandContext.Provider value={command}>
      {usePart(command, "root", undefined, body, "div")}
    </CommandContext.Provider>
  );
}

/**
 * The search field. It keeps focus while arrow keys move the highlight. Name it with `aria-label`.
 * @stable
 */
const CommandInput = parts.Input;

/**
 * The listbox. Without children, it renders the command's `items`, ranked as the user types.
 * @stable
 */
function CommandList(props: PartProps<"div", CommandListState>) {
  const command = useCommand();
  const register = context(OwnListContext)();
  watch.once(() => {
    if (register) {
      queueMicrotask(() => register(true));
      return () => register(false);
    }
    return () => {};
  });
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return (
        children ??
        ((state: CommandListState) =>
          command.state.items ? <CommandItems items={state.items} /> : null)
      );
    },
  };
  return usePart(command, "list", undefined, rest, "div");
}

/**
 * A command. Pressing it, or Enter while it's highlighted, runs it, with its `value` passed to the command's
 * `onAction`.
 * @stable
 */
function CommandItem(
  props: Omit<PartProps<"div", CommandItemState>, Clashing> & CommandItemProps,
) {
  // Made once: a new id each render would make a new item part each render
  // (core keys parts by id), resubscribing forever.
  const generatedBox = atom.lazy(() => `ilha-ui-sdk-${(nextCommandId += 1)}`, {
    snapshot: false,
  });
  const generated = generatedBox();
  const group = useAround(commandPrimitive, "group")?.().id as
    | string
    | undefined;
  const inPage = context(PageContext)();
  const data = context(DataContext)();
  const key = () => props.value ?? generated;
  const item = () => ({
    data,
    disabled: props.disabled,
    group,
    inPage: inPage?.page,
    index: props.index,
    keywords: props.keywords,
    label: props.label,
    onSelect: props.onSelect,
    page: props.page,
    shortcut: props.shortcut,
    value: key(),
  });
  const rest = omit(
    props,
    "value",
    "label",
    "keywords",
    "disabled",
    "shortcut",
    "page",
    "index",
    "onSelect",
  );
  return usePart(useCommand(), "item", item, rest, "div");
}

/**
 * The command's text, with the part the search matched in `<mark>`. Without string content, it shows the command's label.
 * @stable
 */
function CommandItemText(props: PartProps<"span", CommandItemTextState>) {
  const item = useAround(commandPrimitive, "item");
  if (!item) {
    throw new Error("<CommandItemText> must be used inside <CommandItem>.");
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
        : (state: CommandItemTextState) => markSegments(state.segments);
    },
  };
  return usePart(useCommand(), "item-text", part, rest, "span");
}

/**
 * An icon inside a command. Screen readers, typeahead and filtering skip it, and `mirror` flips it
 * in right-to-left text.
 * @stable
 */
const CommandItemIcon = parts.ItemIcon;

/**
 * The keys of a command's shortcut, formatted for the platform. Inside a command, its `shortcut`.
 * @stable
 */
function CommandShortcut(props: Record<string, any>) {
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return children ?? ((state: CommandShortcutState) => state.text);
    },
  };
  return <parts.Shortcut {...rest} />;
}

/**
 * Commands shown while this page is on top. Without `value`, it's the first page. Renders no element.
 * @stable
 */
function CommandPage(props: CommandPageProps & { children?: JSX.Element }) {
  const command = useCommand();
  const open = command.present("page", () => ({ value: props.value }));
  return open ? (
    <PageContext.Provider value={{ page: props.value ?? null }}>
      {props.children}
    </PageContext.Provider>
  ) : null;
}

/**
 * A group of commands. It hides while none of its commands matches the search.
 * @stable
 */
const CommandGroup = parts.Group;

/**
 * A group's heading, which names it.
 * @stable
 */
const CommandGroupLabel = parts.GroupLabel;

/**
 * A line between groups. Composed separators hide while the list is filtered.
 * @stable
 */
const CommandSeparator = parts.Separator;

/**
 * Shown while no command matches. Its message is announced when it appears. Place it outside the list.
 * @stable
 */
function CommandEmpty(props: Record<string, any>) {
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return typeof children === "function"
        ? children
        : (state: CommandEmptyState) => (state.empty ? children : null);
    },
  };
  return <parts.Empty {...rest} />;
}

/**
 * A polite live region for loading and result counts. Its content is yours, usually a function of its state.
 * @stable
 */
const CommandStatus = parts.Status;

/**
 * Renders data commands. Used by data command lists, and available for custom layouts.
 * @stable
 */
function CommandItems(props: { items: CommandData }) {
  return (
    <DataContext.Provider value={true}>
      <>
        {(props.items as unknown[]).map((entry, index) => {
          if (typeof entry === "string") {
            return (
              <CommandItem key={entry} value={entry}>
                {entry}
              </CommandItem>
            );
          }
          if (typeof entry === "object" && entry !== null && "type" in entry) {
            const typed = entry as { type: string };
            if (typed.type === "separator") {
              return <CommandSeparator key={`separator-${index}`} />;
            }
            if (typed.type === "group") {
              const group = entry as unknown as {
                label?: string;
                items: CommandData;
              };
              return (
                <CommandGroup key={`group-${index}`}>
                  {group.label ? (
                    <CommandGroupLabel>{group.label}</CommandGroupLabel>
                  ) : null}
                  <CommandItems items={group.items} />
                </CommandGroup>
              );
            }
          }
          const item = entry as {
            value: string;
            label?: string;
            keywords?: string[];
            disabled?: boolean;
            shortcut?: string;
          };
          return (
            <CommandItem
              key={item.value}
              value={item.value}
              label={item.label}
              keywords={item.keywords}
              disabled={item.disabled}
              shortcut={item.shortcut}
            >
              {item.label}
            </CommandItem>
          );
        })}
      </>
    </DataContext.Provider>
  );
}

export { createCommandController } from "@ui-sdk/core/command";
export type {
  CommandActionDetails,
  CommandApi,
  CommandChangeOptions,
  CommandController,
  CommandData,
  CommandDataGroup,
  CommandDataItem,
  CommandEmptyState,
  CommandInputState,
  CommandItemIconProps,
  CommandItemIconState,
  CommandItemProps,
  CommandItemState,
  CommandItemTextState,
  CommandListState,
  CommandOptions,
  CommandPageProps,
  CommandPagesChangeReason,
  CommandPrimitive,
  CommandQueryChangeReason,
  CommandState,
  CommandShortcutProps,
  CommandShortcutState,
  CommandStatusState,
  CommandValueChangeDetails,
  CommandValueChangeReason,
  ListAnnouncement,
  ListFilter,
  ListSeparator,
  MatchSegment,
  SearchFilter,
} from "@ui-sdk/core/command";

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemIcon,
  CommandItems,
  CommandItemText,
  CommandList,
  CommandPage,
  type CommandProps,
  CommandSeparator,
  CommandShortcut,
  CommandStatus,
};
