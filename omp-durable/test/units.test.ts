/** Unit coverage: entries projection, role routing, parity matrix. */

import { describe, expect, it } from "bun:test";
import type { EntryRecord } from "@earendil-works/pi-durable";
import { projectTranscript, renderTranscript } from "../src/index.ts";
import { isOmpRole, roleAgentChange, withRoleFallback, OMP_ROLES } from "../src/index.ts";
import { PARITY, parityCoverage } from "../src/index.ts";

function entry(kind: string, text?: string, data?: unknown): EntryRecord {
  return {
    id: `e-${kind}` as never,
    conversationId: "c" as never,
    kind,
    ...(text === undefined ? {} : { model: [{ role: "user", content: text, timestamp: 1 }] as never }),
    ...(data === undefined ? {} : { data: data as never }),
  };
}

describe("entries", () => {
  it("projects messages and custom kinds", () => {
    const projected = projectTranscript([
      entry("pi.user", "hello"),
      entry("pi.assistant", "world"),
      entry("pi.reset", undefined, { handoff: "fresh" }),
      entry("myapp.note", undefined, { text: "x" }),
    ]);
    expect(projected[0]).toMatchObject({ kind: "message" });
    expect(projected[2]).toMatchObject({ kind: "reset-boundary", handoff: "fresh" });
    expect(projected[3]).toMatchObject({ kind: "custom", entryKind: "myapp.note" });
    expect(renderTranscript(projected)).toContain("[user] hello");
  });
});

describe("models", () => {
  it("resolves roles with default fallback", () => {
    expect(OMP_ROLES).toContain("advisor");
    expect(isOmpRole("smol")).toBe(true);
    expect(isOmpRole("nope")).toBe(false);
    const map = { default: { provider: "a", modelId: "1" }, smol: { provider: "b", modelId: "2" } };
    expect(roleAgentChange(map, "smol")).toEqual({ model: { provider: "b", modelId: "2" } });
    expect(roleAgentChange(map, "task")).toEqual({ model: { provider: "a", modelId: "1" } });
    expect(roleAgentChange({}, "task")).toEqual({});
    expect(withRoleFallback([{ provider: "x", modelId: "1" }], new Set(["y"]))).toBeUndefined();
    expect(withRoleFallback([{ provider: "x", modelId: "1" }], new Set(["x"]))).toEqual({
      provider: "x",
      modelId: "1",
    });
  });
});

describe("parity", () => {
  it("accounts for every row", () => {
    const coverage = parityCoverage();
    expect(coverage.total).toBe(PARITY.length);
    expect(coverage.durable + coverage.projected + coverage.sidecar + coverage.absent).toBe(PARITY.length);
    expect(coverage.absent).toBeGreaterThan(0);
  });
});
