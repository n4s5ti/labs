// List text and data helpers shared by the list components (port of
// `@ui-sdk/solid`'s `list-text` plus `list-items`, minus Solid's `For`:
// rows are plain maps, since entries are plain data).
import type { JSX } from "ilha/jsx-runtime";

type Part = (props: any) => JSX.Element;

// The parts a list renders its data with, which every list component has.
type ListParts = {
  Item: Part;
  Group: Part;
  GroupLabel: Part;
  Separator: Part;
};

type ListEntry =
  | string
  | { type?: string; value?: unknown; label?: unknown; disabled?: unknown; keywords?: unknown }
  & { label?: unknown; items?: ListEntry[] };

// An item's text with the parts that matched in `<mark>`, for the list
// components' item text parts.
function markSegments(segments: { text: string; match: boolean }[]) {
  return segments.map((segment, index) =>
    segment.match ? <mark key={index}>{segment.text}</mark> : segment.text,
  );
}

// The text an item text part marks: its own string content, or else its item's label.
function textToMark(children: unknown, label: string | undefined) {
  return typeof children === "string" ? children : (label ?? "");
}

// Renders a list's data with its parts: an option per item, groups with their
// labels, and separators.
function ListItems(props: {
  items: readonly ListEntry[];
  parts: ListParts;
}) {
  const { Item, Group, GroupLabel, Separator } = props.parts;
  return (
    <>
      {props.items.map((entry, index) => {
        if (typeof entry === "string") {
          return (
            <Item key={entry} value={entry}>
              {entry}
            </Item>
          );
        }
        const kind = "type" in entry ? (entry as { type?: unknown }).type : undefined;
        if (kind === "separator") {
          return <Separator key={`separator-${index}`} />;
        }
        if (kind === "group") {
          const group = entry as { label?: unknown; items?: ListEntry[] };
          return (
            <Group key={`group-${index}`}>
              {group.label ? <GroupLabel>{group.label as JSX.Element}</GroupLabel> : null}
              <ListItems items={group.items ?? []} parts={props.parts} />
            </Group>
          );
        }
        const item = entry as {
          value?: unknown;
          label?: unknown;
          disabled?: unknown;
          keywords?: unknown;
        };
        return (
          <Item
            key={String(item.value ?? index)}
            value={item.value}
            label={item.label}
            disabled={item.disabled}
            keywords={item.keywords}
          >
            {item.label as JSX.Element}
          </Item>
        );
      })}
    </>
  );
}

export { ListItems, type ListEntry, type ListParts, markSegments, textToMark };
