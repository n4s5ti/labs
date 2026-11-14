import * as PIXI from "pixi.js";
import * as PIXI3D from "@pixi/3d";

/** A constructor for a pixi.js value (containers, sprites, filters…). */
export type PixiConstructor<T = unknown> = new (...args: never[]) => T;

/** Global registry of JSX-mapped pixi.js constructors. */
export type Catalogue = Map<string, PixiConstructor>;

const catalogue: Catalogue = new Map();

const toPascalCase = (tag: string): string =>
  tag
    .split(/[-_:]/u)
    .map((part) => (part.length === 0 ? "" : part[0].toUpperCase() + part.slice(1)))
    .join("");

/** Tags whose PascalCase form does not match the pixi.js export name. */
const NAME_OVERRIDES: Record<string, string> = {
  htmlText: "HTMLText",
  iglUniformData: "IGLUniformData",
};

/**
 * Resolve a JSX tag to a catalogue name: `<pixiContainer>` and
 * `<container>` both resolve to `Container`; dashed tags pierce to
 * PascalCase (`nine-slice-sprite` -> `NineSliceSprite`).
 */
export const parseComponentType = (tag: string): string => {
  const stripped = /^pixi([A-Z])/u.test(tag) ? tag.slice(4) : tag;
  return NAME_OVERRIDES[stripped] ?? toPascalCase(stripped);
};

/** Register constructors under their catalogue names. */
export const extend = (objects: Record<string, PixiConstructor>): void => {
  for (const [name, constructor] of Object.entries(objects)) {
    catalogue.set(name, constructor);
  }
};

/** Read-only view of the registered catalogue. */
export const getCatalogue = (): ReadonlyMap<string, PixiConstructor> =>
  catalogue;

/** Resolve a JSX tag to a constructor: `sprite` -> `Sprite`. */
export const resolveConstructor = (tag: string): PixiConstructor | undefined =>
  catalogue.get(parseComponentType(tag));

/**
 * Seed the catalogue with every exported pixi.js constructor, then every
 * `@pixi/3d` one, so `<container>`, `<view3D>`, `<mesh3D>`,
 * `<directionalLight>` etc. resolve without an explicit `extend()` call;
 * user classes still use `extend()`. First registration wins: on the one
 * collision (`PlaneGeometry`) the 2D constructor keeps the tag and the 3D
 * one is reachable through `extend()` under another name.
 */
const seed = (): void => {
  if (catalogue.size > 0) {
    return;
  }
  for (const barrel of [PIXI, PIXI3D]) {
    for (const [name, value] of Object.entries(barrel)) {
      if (
        typeof value === "function" &&
        /^[A-Z]/u.test(name) &&
        !catalogue.has(name)
      ) {
        catalogue.set(name, value as PixiConstructor);
      }
    }
  }
};

seed();
