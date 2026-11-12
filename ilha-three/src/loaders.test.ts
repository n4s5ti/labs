import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";

import { cachedLoad, clearLoader, preload, useLoader } from "./loaders.ts";
import type { AsyncLoader } from "./loaders.ts";

const makeLoader = (
  value: number,
  counter: { calls: number },
): AsyncLoader<number> => ({
  loadAsync: async (_url: string): Promise<number> => {
    counter.calls += 1;
    return value;
  },
});

describe("loaders", () => {
  test("cachedLoad dedupes concurrent loads", async () => {
    const counter = { calls: 0 };
    const loader = makeLoader(7, counter);
    const [a, b] = await Promise.all([
      cachedLoad(loader, "model.glb"),
      cachedLoad(loader, "model.glb"),
    ]);
    expect(a).toBe(7);
    expect(b).toBe(7);
    expect(counter.calls).toBe(1);
  });

  test("clearLoader evicts entries", async () => {
    const counter = { calls: 0 };
    const loader = makeLoader(1, counter);
    await cachedLoad(loader, "a.glb");
    expect(counter.calls).toBe(1);
    clearLoader(loader, "a.glb");
    await cachedLoad(loader, "a.glb");
    expect(counter.calls).toBe(2);
  });

  test("useLoader effect resolves the cached value", async () => {
    const counter = { calls: 0 };
    const loader = makeLoader(42, counter);
    const effect = useLoader(loader, "b.glb");
    const value = Effect.runPromise(effect);
    await expect(value).resolves.toBe(42);
    // Second call hits the cache populated above.
    await preload(loader, "b.glb");
    expect(counter.calls).toBe(1);
  });

  test("failures evict so a later call retries", async () => {
    let failures = 0;
    const loader: AsyncLoader<number> = {
      loadAsync: async (_url: string): Promise<number> => {
        failures += 1;
        if (failures === 1) {
          throw new Error("boom");
        }
        return 9;
      },
    } as AsyncLoader<number>;
    await expect(cachedLoad(loader, "flaky.glb")).rejects.toThrow("boom");
    await expect(cachedLoad(loader, "flaky.glb")).resolves.toBe(9);
  });
});
