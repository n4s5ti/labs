import * as THREE from "three";

/** A constructor for a three.js value (objects, geometries, materials…). */
export type ThreeConstructor<T = unknown> = new (...args: never[]) => T;

/** Catalogue entry: the constructor plus its default attach target. */
export interface CatalogueEntry {
  constructor: ThreeConstructor;
}

/** Global registry of JSX-mapped three.js constructors (R3F `extend` parity). */
export type Catalogue = Map<string, ThreeConstructor>;

const catalogue: Catalogue = new Map();

const toPascalCase = (tag: string): string =>
  tag
    .split(/[-_:]/u)
    .map((part) => (part.length === 0 ? "" : part[0].toUpperCase() + part.slice(1)))
    .join("");

/** Register constructors under their PascalCase names. */
export const extend = (objects: Record<string, ThreeConstructor>): void => {
  for (const [name, constructor] of Object.entries(objects)) {
    catalogue.set(name, constructor);
  }
};

/** Read-only view of the registered catalogue. */
export const getCatalogue = (): ReadonlyMap<string, ThreeConstructor> =>
  catalogue;

/** Resolve a JSX tag to a constructor: `mesh` -> `Mesh`. */
export const resolveConstructor = (tag: string): ThreeConstructor | undefined =>
  catalogue.get(tag) ?? catalogue.get(toPascalCase(tag));

/**
 * Seed the catalogue with every exported three.js constructor.
 * Called once at module load so `<mesh>`, `<boxGeometry>` etc. resolve
 * without an explicit `extend()` call; user classes still use `extend()`.
 */
const seed = (): void => {
  if (catalogue.size > 0) {
    return;
  }
  for (const [name, value] of Object.entries(THREE)) {
    if (typeof value === "function" && /^[A-Z]/u.test(name)) {
      catalogue.set(name, value as ThreeConstructor);
    }
  }
};

seed();
