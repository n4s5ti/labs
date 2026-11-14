import { describe, expect, test } from "bun:test";

import type { AsyncLoader } from "./loaders.ts";
import { cachedLoad, clearLoader, preload } from "./loaders.ts";

class DictLoader implements AsyncLoader<string> {
  loads = 0;
  failures = new Set<string>();
  async loadAsync(url: string): Promise<string> {
    this.loads += 1;
    if (this.failures.has(url)) {
      throw new Error(`no such asset: ${url}`);
    }
    return `bytes:${url}`;
  }
}

describe("loaders", () => {
  test("concurrent callers share one in-flight load", async () => {
    const loader = new DictLoader();
    const [a, b] = await Promise.all([
      cachedLoad(loader, "logo.png"),
      cachedLoad(loader, "logo.png"),
    ]);
    expect(a).toBe("bytes:logo.png");
    expect(b).toBe("bytes:logo.png");
    expect(loader.loads).toBe(1);
  });

  test("failures evict so a later call retries", async () => {
    const loader = new DictLoader();
    loader.failures.add("bad.png");
    await expect(cachedLoad(loader, "bad.png")).rejects.toThrow("no such asset");
    loader.failures.delete("bad.png");
    await expect(cachedLoad(loader, "bad.png")).resolves.toBe("bytes:bad.png");
  });

  test("preload warms and clear drops entries", async () => {
    const loader = new DictLoader();
    await preload(loader, "warm.png");
    expect(loader.loads).toBe(1);
    await cachedLoad(loader, "warm.png");
    expect(loader.loads).toBe(1); // cache hit
    clearLoader(loader, "warm.png");
    await cachedLoad(loader, "warm.png");
    expect(loader.loads).toBe(2);
    clearLoader(loader);
    await cachedLoad(loader, "warm.png");
    expect(loader.loads).toBe(3);
  });
});
