import { describe, expect, test } from "bun:test";

import {
  extend,
  getCatalogue,
  parseComponentType,
  resolveKind,
} from "./catalogue.ts";

describe("catalogue", () => {
  test("strips the mygo prefix and pierces dashes to PascalCase", () => {
    expect(parseComponentType("mygoBox")).toBe("Box");
    expect(parseComponentType("box")).toBe("Box");
    expect(parseComponentType("row")).toBe("Row");
    expect(parseComponentType("nine-slice")).toBe("NineSlice");
  });

  test("overrides map DOM-ish tags to canonical kinds", () => {
    expect(resolveKind("div")).toBe("Box");
    expect(resolveKind("view")).toBe("Box");
    expect(resolveKind("mygoBox")).toBe("Box");
  });

  test("span stays a transparent hole-host group, not text", () => {
    // ilha mounts component holes in `display:contents` spans; mapping
    // them to `Text` would corrupt every hole into a text node.
    expect(resolveKind("span")).toBe("Span");
    expect(parseComponentType("span")).toBe("Span");
  });

  test("builtins resolve and unknowns pass through", () => {
    for (const kind of ["Box", "Row", "Column", "Grid", "Text", "Image", "Button", "Input"]) {
      expect(resolveKind(kind)).toBe(kind);
    }
    expect(resolveKind("FancyWidget")).toBe("FancyWidget");
  });

  test("extend registers user kinds", () => {
    extend({ FancyWidget: "FancyWidget" });
    expect(getCatalogue().get("FancyWidget")).toBe("FancyWidget");
    expect(resolveKind("FancyWidget")).toBe("FancyWidget");
  });
});
