import { describe, expect, test } from "bun:test";

import {
  registerRootState,
  rootStateOf,
  unregisterRootState,
} from "./atoms.ts";
import type { RootState } from "./atoms.ts";

const stubState = { status: "open" } as unknown as RootState;

describe("atoms", () => {
  test("register/rootStateOf/unregister round-trips per runtime", () => {
    const runtimeA = {};
    const runtimeB = {};
    expect(rootStateOf(runtimeA)).toBeUndefined();
    registerRootState(runtimeA, stubState);
    expect(rootStateOf(runtimeA)).toBe(stubState);
    expect(rootStateOf(runtimeB)).toBeUndefined();
    unregisterRootState(runtimeA);
    expect(rootStateOf(runtimeA)).toBeUndefined();
  });
});
