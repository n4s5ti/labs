/**
 * Model catalog for the worker isolate: deliberately empty.
 *
 * `Harness.open()` requires a `Models` object, but the DO never runs
 * pi-durable's own generation or compaction — every turn goes through
 * `askOmp()` (the real omp loop) with an explicitly injected `streamFn`.
 * Importing the real `createModels()` would drag earendil pi-ai's auth
 * chain (`auth/context.js` lazy-`import()`s `node:fs`), which workerd
 * cannot even link. So the worker passes an empty catalog, honestly typed
 * as "no providers": any code path that needs a provider fails fast with
 * a clear error instead of a missing-module crash at the edge.
 *
 * Lifting this boundary (pi generation / `compact()` in-DO) means porting
 * or stubbing the auth chain — tracked as a follow-up, not hidden.
 */

import type { Models } from "@earendil-works/pi-ai";

export function emptyModels(): Models {
  const fail = (): never => {
    throw new Error("no model providers in the worker runtime: turns run through askOmp() with an injected streamFn");
  };
  return {
    getProviders: () => [],
    getProvider: () => undefined,
    getModels: () => [],
    getModelsOfType: () => [],
    getAllModels: () => [],
    getAvailable: () => [],
    getAvailableOfType: () => [],
    getAllAvailable: () => [],
    getModel: fail,
    getModelOfType: fail,
    getAuth: fail,
    checkAuth: fail,
    login: fail,
    logout: fail,
    refresh: fail,
    stream: fail,
    complete: fail,
    streamSimple: fail,
    completeSimple: fail,
    streamDeferred: fail,
    fetchDeferred: fail,
    cancelDeferred: fail,
    generateImages: fail,
  } as unknown as Models;
}
