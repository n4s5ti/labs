import { describe, expect, test } from "bun:test";

import {
  defaultStyleFor,
  extend,
  getCatalogue,
  kindName,
  parseComponentType,
  resolveKind,
} from "./catalogue.ts";

describe("catalogue", () => {
  test("strips the asuka prefix and pierces dashes to PascalCase", () => {
    expect(parseComponentType("asukaBox")).toBe("Box");
    expect(parseComponentType("box")).toBe("Box");
    expect(parseComponentType("row")).toBe("Row");
    expect(parseComponentType("nine-slice")).toBe("NineSlice");
  });

  test("overrides map DOM-ish tags to Asuka kind IDs", () => {
    expect(resolveKind("div")).toBe(1);
    expect(resolveKind("view")).toBe(1);
    expect(resolveKind("asukaBox")).toBe(1);
    expect(resolveKind("button")).toBe(3);
    expect(resolveKind("input")).toBe(4);
    expect(resolveKind("image")).toBe(15);
    expect(resolveKind("toggle")).toBe(5);
    expect(resolveKind("slider")).toBe(6);
    expect(resolveKind("scroll")).toBe(7);
  });

  test("row and column imply their layout direction", () => {
    expect(defaultStyleFor("row")).toEqual({ direction: "row" });
    expect(defaultStyleFor("column")).toEqual({ direction: "column" });
    expect(defaultStyleFor("box")).toEqual({});
  });

  test("span stays a transparent hole-host group, not text", () => {
    // ilha mounts every component hole in a `display:contents` span host,
    // so `span` stays a transparent grouping kind — mapping it to `Text`
    // would corrupt every hole into a text node.
    expect(resolveKind("span")).toBe(1);
    expect(kindName(resolveKind("span"))).toBe("View");
  });

  test("unknown tags fall back to View so hosts never see bad kinds", () => {
    expect(resolveKind("FancyWidget")).toBe(1);
    expect(kindName(99)).toBe("Kind(99)");
  });

  test("extend registers tag aliases to kind IDs", () => {
    extend({ FancyButton: 3 });
    expect(getCatalogue().get("FancyButton")).toBe(3);
    expect(resolveKind("FancyButton")).toBe(3);
  });
});
