import { describe, expect, test } from "bun:test";
import { Container } from "pixi.js";

import {
  extend,
  getCatalogue,
  parseComponentType,
  resolveConstructor,
} from "./catalogue.ts";

describe("catalogue", () => {
  test("seeds pixi constructors", () => {
    expect(resolveConstructor("container")).toBe(Container);
  });

  test("resolves unprefixed and pixi-prefixed tags alike", () => {
    expect(parseComponentType("container")).toBe("Container");
    expect(parseComponentType("pixiContainer")).toBe("Container");
    expect(parseComponentType("sprite")).toBe("Sprite");
    expect(parseComponentType("pixiSprite")).toBe("Sprite");
    expect(parseComponentType("nine-slice-sprite")).toBe("NineSliceSprite");
  });

  test("resolves NameOverrides", () => {
    expect(parseComponentType("htmlText")).toBe("HTMLText");
    expect(parseComponentType("iglUniformData")).toBe("IGLUniformData");
  });

  test("unknown tags resolve to undefined", () => {
    expect(resolveConstructor("span")).toBeUndefined();
    expect(resolveConstructor("notAPixiThing")).toBeUndefined();
  });

  test("extend registers user constructors", () => {
    class CustomGizmo extends Container {}
    extend({ CustomGizmo: CustomGizmo as never });
    expect(resolveConstructor("CustomGizmo")).toBe(CustomGizmo);
    expect(resolveConstructor("customGizmo")).toBe(CustomGizmo);
    expect(getCatalogue().get("CustomGizmo")).toBe(CustomGizmo);
  });
});
