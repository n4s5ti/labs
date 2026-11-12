import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  extend,
  getCatalogue,
  resolveConstructor,
} from "./catalogue.ts";

describe("catalogue", () => {
  test("seeds every exported three constructor", () => {
    expect(resolveConstructor("mesh")).toBe(THREE.Mesh);
    expect(resolveConstructor("Mesh")).toBe(THREE.Mesh);
    expect(resolveConstructor("boxGeometry")).toBe(THREE.BoxGeometry);
    expect(resolveConstructor("color")).toBe(THREE.Color);
    expect(resolveConstructor("fog")).toBe(THREE.Fog);
    expect(resolveConstructor("perspectiveCamera")).toBe(
      THREE.PerspectiveCamera,
    );
  });

  test("unknown tags resolve to undefined", () => {
    expect(resolveConstructor("span")).toBeUndefined();
    expect(resolveConstructor("notAThreeThing")).toBeUndefined();
  });

  test("extend registers user constructors", () => {
    class CustomGizmo extends THREE.Object3D {}
    extend({ CustomGizmo: CustomGizmo as never });
    expect(resolveConstructor("CustomGizmo")).toBe(CustomGizmo);
    expect(getCatalogue().get("CustomGizmo")).toBe(CustomGizmo);
  });
});
