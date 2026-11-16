// Tree (port of `@ui-sdk/solid`'s `tree`).
//
// Without children, a data tree renders its `items` (or `paths`). An item
// shares its value with its label, indicator, checkbox and group through
// item context; a group marks its item as a branch while it renders.
import {
  tree as treePrimitive,
  treeFromPaths,
  type TreeGroupProps,
  type TreeGroupState,
  type TreeItemData,
  type TreeItemPartProps,
  type TreeItemProps,
  type TreeItemState,
  type TreeMode,
  type TreeOptions,
} from "@ui-sdk/core/tree";
import { atom, context, createContext, untrack, watch } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { childOf, createParts, omit, usePart, type PartProps } from "./primitive.ts";

const parts = createParts(treePrimitive, { root: "div" });

// Whether the data tree shows checkboxes.
const CheckableContext = createContext(false);
// The item a label, indicator, checkbox or group sits in, or null outside one.
const ItemContext = createContext<{
  value: () => string;
  setGrouped: (grouped: boolean) => void;
} | null>(null);

function useItem() {
  const item = context(ItemContext)();
  if (!item) {
    throw new Error(
      `Tree labels, indicators, checkboxes and groups must be used inside <TreeItem>.`,
    );
  }
  return item;
}

type Clashing = "value" | "defaultValue" | "defaultChecked" | "onChange" | "onSelect";

/**
 * The props of `Tree`.
 * @stable
 */
type TreeProps<Mode extends TreeMode = "single"> = TreeOptions<Mode> & {
  children?: JSX.Element;
};

/**
 * Items in a hierarchy, expanded and checked from the data or by hand.
 * Without children, `items` (or `paths`) render the tree.
 * @stable
 */
function Tree<Mode extends TreeMode = "single">(props: TreeProps<Mode>) {
  // Without children, a data tree renders its items.
  const data = () =>
    (props as TreeOptions<"single">).items ??
    ((props as TreeOptions<"single">).paths &&
      treeFromPaths((props as TreeOptions<"single">).paths as string[]));
  const children = childOf(props);
  const { paths: _paths, ...rest } = props as Record<string, any>;
  return (
    <CheckableContext.Provider value={!!(props as TreeOptions<"single">).checkable}>
      <ItemContext.Provider value={null}>
        <parts.Root {...rest}>
          {children ?? (data() ? <TreeItems items={data() as readonly TreeItemData[]} /> : null)}
        </parts.Root>
      </ItemContext.Provider>
    </CheckableContext.Provider>
  );
}

/**
 * One item, with its label, indicator, checkbox or group inside. Branches
 * hold a group of their children.
 * @stable
 */
function TreeItem(
  props: Omit<PartProps<"div", TreeItemState>, Clashing> &
    Omit<TreeItemProps, "parent">,
) {
  const parent = context(ItemContext)();
  // Whether a group of children renders in the item. Written while the
  // children render, read on the next tick, like the combobox's content flag.
  const grouped = atom(false, { snapshot: false });
  const setGrouped = (next: boolean) => {
    if (grouped() !== next) {
      queueMicrotask(() => {
        try {
          grouped.set(next);
        } catch {
          // The tree unmounted before the tick ran: the atom is gone with it.
        }
      });
    }
  };
  const branch = () => props.branch ?? (grouped() || undefined);
  const item = () => ({
    value: props.value,
    parent: parent ? parent.value() : null,
    branch: branch(),
    disabled: props.disabled,
    label: props.label,
  });
  const rest = omit(props, "value", "branch", "disabled", "label");
  const value = () => props.value;
  return (
    <ItemContext.Provider value={{ value, setGrouped }}>
      {usePart(treePrimitive, "item", item, rest, "div")}
    </ItemContext.Provider>
  );
}

function useItemPart(
  slot: "label" | "indicator" | "checkbox",
  props: Record<string, any>,
) {
  const item = useItem();
  return usePart(
    treePrimitive,
    slot,
    () => ({ value: item.value() }),
    props,
    "span",
  );
}

/**
 * What the item shows, and what typeahead matches.
 * @stable
 */
function TreeItemLabel(props: TreeItemPartProps & PartProps<"span", TreeItemState>) {
  return useItemPart("label", props);
}

/**
 * Whether the item is open: a chevron that turns.
 * @stable
 */
function TreeItemIndicator(
  props: TreeItemPartProps & PartProps<"span", TreeItemState>,
) {
  return useItemPart("indicator", props);
}

/**
 * Whether the item is checked. Shows while the tree is checkable.
 * @stable
 */
function TreeItemCheckbox(
  props: TreeItemPartProps & PartProps<"span", TreeItemState>,
) {
  return useItemPart("checkbox", props);
}

/**
 * An item's children. Marks the item as a branch while it renders.
 * @stable
 */
function TreeGroup(props: TreeGroupProps & PartProps<"div", TreeGroupState>) {
  const item = useItem();
  untrack(() => item.value());
  const setGrouped = item.setGrouped;
  setGrouped(true);
  watch.once(() => () => setGrouped(false));
  const group = () => ({
    value: item.value(),
    keepMounted: props.keepMounted,
    hiddenUntilFound: props.hiddenUntilFound,
  });
  return usePart(
    treePrimitive,
    "group",
    group,
    omit(props, "keepMounted", "hiddenUntilFound"),
    "div",
  );
}

function TreeItems(props: { items: readonly TreeItemData[] }) {
  const checkable = context(CheckableContext)();
  return (
    <>
      {props.items.map((item) => (
        <TreeItem
          key={item.value}
          value={item.value}
          branch={item.children !== undefined}
          disabled={item.disabled}
        >
          {checkable ? <TreeItemCheckbox /> : null}
          <TreeItemLabel
            render={item.href ? (label: any) => <a {...label} href={item.href} /> : undefined}
          >
            {item.label}
          </TreeItemLabel>
          {item.children ? (
            <TreeGroup>
              <TreeItems items={item.children} />
            </TreeGroup>
          ) : null}
        </TreeItem>
      ))}
    </>
  );
}

export {
  createTreeController,
  toggleTreeChecked,
  treeCheckedStates,
  treeFromPaths,
  visibleTreeRows,
} from "@ui-sdk/core/tree";
export type {
  TreeActionDetails,
  TreeAnnouncement,
  TreeApi,
  TreeChangeOptions,
  TreeCheckStrategy,
  TreeCheckedChangeReason,
  TreeCheckedState,
  TreeCollection,
  TreeCollectionNode,
  TreeController,
  TreeExpandedChangeReason,
  TreeGroupProps,
  TreeGroupState,
  TreeItemData,
  TreeItemPartProps,
  TreeItemProps,
  TreeItemState,
  TreeMode,
  TreeOptions,
  TreePrimitive,
  TreeRow,
  TreeState,
  TreeValue,
  TreeValueChangeReason,
  ListHighlightDetails,
} from "@ui-sdk/core/tree";

export {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemCheckbox,
  TreeItemIndicator,
  TreeItemLabel,
  TreeItems,
  type TreeProps,
};
