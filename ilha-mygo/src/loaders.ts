// Minimal async-loader surface for mygo image nodes.
//
// Same suspense-cache shape as the pixi bindings (`loadAsync` covers any
// promise source): one in-flight load per URL, failures evict so a later
// call retries, `preload` warms without suspending, `clearLoader` drops
// entries. Image bytes stay host-side; the cache only dedupes the fetch.
import * as Effect from "effect/Effect";

/**
 * Minimal loader surface (covers any `loadAsync(url)` source — wrap
 * `fetch`/`Bun.file`/texture decoders: `{ loadAsync: (url) => ... }`).
 */
export interface AsyncLoader<T = unknown> {
  loadAsync: (url: string) => Promise<T>;
}

/** Options accepted after the input, mirroring R3F `useLoader` extensions. */
export interface LoaderOptions {
  /** Extra work keyed into the cache entry (e.g. decoder setup). */
  extensions?: (loader: unknown) => void;
}

/** Module-level suspense cache: one in-flight load per URL. */
const cache = new Map<string, Promise<unknown>>();

const keyOf = (loaderName: string, url: string): string =>
  `${loaderName}::${url}`;

/**
 * Cached load shared by `useLoader` and `preload`. Concurrent callers share
 * one promise; failures evict the entry so a later call retries.
 */
export const cachedLoad = <T>(
  loader: AsyncLoader<T>,
  url: string,
  options?: LoaderOptions,
): Promise<T> => {
  const key = keyOf(loader.constructor.name, url);
  const hit = cache.get(key);
  if (hit !== undefined) {
    return hit as Promise<T>;
  }
  options?.extensions?.(loader);
  const pending = loader.loadAsync(url);
  cache.set(key, pending);
  pending.catch(() => {
    if (cache.get(key) === pending) {
      cache.delete(key);
    }
  });
  return pending;
};

/** Warm the cache without suspending; resolves when the load settles. */
export const preload = async <T>(
  loader: AsyncLoader<T>,
  url: string,
  options?: LoaderOptions,
): Promise<void> => {
  await cachedLoad(loader, url, options);
};

/** Drop cached entries; with no `url`, clears every entry for the loader. */
export const clearLoader = <T>(
  loader: AsyncLoader<T>,
  url?: string,
): void => {
  if (url === undefined) {
    const prefix = `${loader.constructor.name}::`;
    for (const key of [...cache.keys()]) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    }
    return;
  }
  cache.delete(keyOf(loader.constructor.name, url));
};

/**
 * Suspend on a cached load until it resolves.
 *
 * Yield the returned effect from a generator component —
 * `const bytes = (yield useLoader(loader, url)) as Uint8Array` — or await
 * `cachedLoad` directly in an async component. ilha keeps the previous
 * view painted until the load settles.
 * `useLoader.preload` and `useLoader.clear` manage the cache.
 */
export const useLoader = <T>(
  loader: AsyncLoader<T>,
  url: string | string[],
  options?: LoaderOptions,
): Effect.Effect<T | T[], never, never> => {
  const task = (): Promise<T | T[]> =>
    Array.isArray(url)
      ? Promise.all(url.map((entry) => cachedLoad(loader, entry, options)))
      : cachedLoad(loader, url, options);
  return Effect.promise(task);
};

useLoader.preload = preload;
useLoader.clear = clearLoader;
