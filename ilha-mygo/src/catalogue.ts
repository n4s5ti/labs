// Catalogue of mygo retained-host element kinds.
//
// Unlike pixi (constructors) the mygo host only knows string kinds, so the
// catalogue maps JSX tags to canonical kind names. `<Box>`, `<box>` and
// `<mygoBox>` all resolve to `Box`; unknown tags pass through unchanged so
// custom layout kinds keep working without registration.
export type MygoKind = string;

/** Global registry of JSX tag -> canonical mygo kind. */
export type Catalogue = Map<string, MygoKind>;

const catalogue: Catalogue = new Map();

const toPascalCase = (tag: string): string =>
  tag
    .split(/[-_:]/u)
    .map((part) => (part.length === 0 ? "" : part[0].toUpperCase() + part.slice(1)))
    .join("");

/** Tags whose PascalCase form does not match the canonical kind. */
const NAME_OVERRIDES: Record<string, string> = {
  Div: "Box",
  View: "Box",
  P: "Text",
  Img: "Image",
  Button: "Button",
  Input: "Input",
  Textinput: "Input",
  // NOTE: no `Span` override. ilha mounts every component hole (and the
  // context provider) in a `display:contents` span host, so `span` stays a
  // transparent grouping kind — mapping it to `Text` would corrupt every
  // hole into a text node (pixi's `Container` fallback precedent).
};

/**
 * Built-in layout kinds (flexbox Row/Column/Box + Grid,
 * device-independent px). `Span` is ilha's transparent hole host
 * (`display:contents` grouping, never laid out itself).
 */
const BUILTINS = [
  "Box",
  "Row",
  "Column",
  "Grid",
  "Span",
  "Text",
  "#text",
  "Image",
  "Button",
  "Input",
  "Label",
  "Scroll",
  "root",
] as const;

const seed = (): void => {
  if (catalogue.size > 0) {
    return;
  }
  for (const kind of BUILTINS) {
    catalogue.set(kind, kind);
  }
};

/**
 * Resolve a JSX tag to a catalogue kind: `<mygoBox>` and `<box>` both
 * resolve to `Box`; dashed tags pierce to PascalCase
 * (`nine-slice` -> `NineSlice`).
 */
export const parseComponentType = (tag: string): string => {
  const stripped = /^mygo([A-Z])/u.test(tag) ? tag.slice(4) : tag;
  const pascal = toPascalCase(stripped);
  return NAME_OVERRIDES[pascal] ?? pascal;
};

/** Register tags under canonical kinds (user kinds use `extend`). */
export const extend = (objects: Record<string, MygoKind>): void => {
  for (const [name, kind] of Object.entries(objects)) {
    catalogue.set(name, kind);
  }
};

/** Read-only view of the registered catalogue. */
export const getCatalogue = (): ReadonlyMap<string, MygoKind> => catalogue;

/** Resolve a JSX tag to a kind, seeding builtins on first use. */
export const resolveKind = (tag: string): MygoKind => {
  seed();
  return catalogue.get(parseComponentType(tag)) ?? tag;
};

seed();
