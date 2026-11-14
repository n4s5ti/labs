// Catalogue of Asuka native view kinds for the ilha renderer.
//
// Unlike pixi (constructors) the host only knows numeric Asuka kinds, so
// the catalogue maps JSX tags to kind IDs from Asuka's schema
// (github.com/egoist/asuka/ops): View=1, Text=2, Button=3, TextField=4,
// Toggle=5, Slider=6, Scroll=7, Image=15. `<Box>`, `<box>` and
// `<asukaBox>` all resolve to View; unknown tags fall back to View so a
// real host never sees a kind it cannot create (fake-host parity: an
// unknown kind panics there).
export const KIND_VIEW = 1;
export const KIND_TEXT = 2;
export const KIND_BUTTON = 3;
export const KIND_TEXTFIELD = 4;
export const KIND_TOGGLE = 5;
export const KIND_SLIDER = 6;
export const KIND_SCROLL = 7;
export const KIND_IMAGE = 15;

/** Asuka kind names, mirroring ops.Kind.String for the kinds ilha sends. */
const KIND_NAMES: Record<number, string> = {
  [KIND_VIEW]: "View",
  [KIND_TEXT]: "Text",
  [KIND_BUTTON]: "Button",
  [KIND_TEXTFIELD]: "TextField",
  [KIND_TOGGLE]: "Toggle",
  [KIND_SLIDER]: "Slider",
  [KIND_SCROLL]: "Scroll",
  [KIND_IMAGE]: "Image",
};

/** Global registry of JSX tag -> Asuka kind ID. */
export type Catalogue = Map<string, number>;

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
  Input: "Textinput",
  Textinput: "Textinput",
  Label: "Text",
  // NOTE: no `Span` override. ilha mounts every component hole (and the
  // context provider) in a `display:contents` span host, so `span` stays
  // a transparent grouping kind — mapping it to `Text` would corrupt every
  // hole into a text node (pixi's `Container` fallback precedent).
};

/** Built-in tags, in catalogue-name form. */
const BUILTINS = [
  "Box",
  "Row",
  "Column",
  "Grid",
  "Span",
  "Text",
  "Image",
  "Button",
  "Textinput",
  "Toggle",
  "Slider",
  "Scroll",
  "Label",
  "root",
] as const;

/** Built-in catalogue name -> Asuka kind ID. */
const BUILTIN_KINDS: Record<string, number> = {
  Box: KIND_VIEW,
  Row: KIND_VIEW,
  Column: KIND_VIEW,
  Grid: KIND_VIEW,
  Span: KIND_VIEW,
  root: KIND_VIEW,
  Text: KIND_TEXT,
  Label: KIND_TEXT,
  Button: KIND_BUTTON,
  Textinput: KIND_TEXTFIELD,
  Toggle: KIND_TOGGLE,
  Slider: KIND_SLIDER,
  Scroll: KIND_SCROLL,
  Image: KIND_IMAGE,
};

/** Layout style a tag implies (row/column default direction). */
const TAG_STYLES: Record<string, Record<string, string>> = {
  Row: { direction: "row" },
  Column: { direction: "column" },
};

const seed = (): void => {
  if (catalogue.size > 0) {
    return;
  }
  for (const name of BUILTINS) {
    catalogue.set(name, BUILTIN_KINDS[name] ?? KIND_VIEW);
  }
};

/**
 * Resolve a JSX tag to a catalogue name: `<asukaBox>` and `<box>` both
 * resolve to `Box`; dashed tags pierce to PascalCase
 * (`nine-slice` -> `NineSlice`).
 */
export const parseComponentType = (tag: string): string => {
  const stripped = /^asuka([A-Z])/u.test(tag) ? tag.slice(5) : tag;
  const pascal = toPascalCase(stripped);
  return NAME_OVERRIDES[pascal] ?? pascal;
};

/** Register tags under Asuka kind IDs (user kinds use `extend`). */
export const extend = (objects: Record<string, number>): void => {
  for (const [name, kind] of Object.entries(objects)) {
    catalogue.set(name, kind);
  }
};

/** Read-only view of the registered catalogue. */
export const getCatalogue = (): ReadonlyMap<string, number> => catalogue;

/** Resolve a JSX tag to an Asuka kind ID, seeding builtins on first use. */
export const resolveKind = (tag: string): number => {
  seed();
  const name = parseComponentType(tag);
  return catalogue.get(name) ?? BUILTIN_KINDS[name] ?? KIND_VIEW;
};

/** Resolve a JSX tag to the layout style it implies (row/column only). */
export const defaultStyleFor = (tag: string): Record<string, string> => {
  seed();
  return TAG_STYLES[parseComponentType(tag)] ?? {};
};

/** Asuka kind name for an ID (`Kind(99)` when unknown, ops parity). */
export const kindName = (kind: number): string =>
  KIND_NAMES[kind] ?? `Kind(${kind})`;

seed();
