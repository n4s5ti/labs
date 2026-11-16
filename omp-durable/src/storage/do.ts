/**
 * Cloudflare Durable Object storage for omp-durable sessions.
 *
 * Approved target (Q2a): sessions run on pi-durable's DO SQLite backend, so
 * the transcript, tasks, and documents live in the Object's SQLite and
 * survive restarts, evictions, and redeploys. The adapter adds two things on
 * top of `openDurableObjectSqliteStorage`:
 *
 * 1. `openOmpStorage()` — one call that opens the backend with the table
 *    prefix omp-durable owns (`omp`), so one Object can host sessions
 *    alongside other pi-durable users without table collisions.
 * 2. `armAlarms()` — wires `HarnessOptions.onWake` to the DO `alarm()`
 *    lifecycle: pi-durable calls `onWake` after open and whenever `wake()`
 *    changes; the host arms `state.storage.setAlarm()` for sleeping tasks
 *    and calls `harness.wake()` from `alarm()`. Without this, parked tools
 *    (approvals, sleeps, subagent waits) strand when the Object sleeps.
 *
 * Usage inside a Durable Object class:
 *
 * ```ts
 * import { openOmpStorage, armAlarms } from "omp-durable/storage/do";
 * import { OmpSession } from "omp-durable";
 *
 * async fetch(request: Request) {
 *   const storage = await openOmpStorage(this.ctx.storage);
 *   const session = await OmpSession.open(storage, {
 *     models, env: sandboxEnv, onWake: (wake) => armAlarms(this.ctx.storage, wake),
 *   });
 *   ...
 * }
 * async alarm() {
 *   const storage = await openOmpStorage(this.ctx.storage);
 *   const session = await OmpSession.attach(storage, { models, env: sandboxEnv });
 *   session.resume(); // wake() delivery: parked tasks re-run from commit
 *   await session.waitForIdle();
 * }
 * ```
 *
 * `DurableObjectSqliteStorage` and `Wake` are imported as types only, so
 * this module loads outside the workerd runtime (tests, Node dev).
 */

import { openDurableObjectSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/cloudflare";
import type {
  DurableObjectSqliteStorage as SqliteStorageBinding,
} from "@earendil-works/pi-durable/storage/sqlite/cloudflare";

/** Minimal surface this module needs from the DO `state.storage`. */
export type OmpAlarmStorage = {
  setAlarm(scheduledTime: number | Date): Promise<void>;
};

/** Table prefix owning every table omp-durable creates. */
export const OMP_TABLE_PREFIX = "omp";

/** Open DO SQLite storage namespaced to omp-durable tables. */
export async function openOmpStorage(binding: SqliteStorageBinding): Promise<Awaited<ReturnType<typeof openDurableObjectSqliteStorage>>> {
  return openDurableObjectSqliteStorage(binding, { prefix: OMP_TABLE_PREFIX });
}

/**
 * Translate a pi-durable `Wake` into a DO alarm. `wake.at` is the next
 * deadline epoch-ms (or undefined when nothing sleeps); pass the binding
 * from `openOmpStorage`'s Object. Safe to call on every `onWake`: arming
 * the same deadline twice is idempotent, and `undefined` arms nothing.
 */
export async function armAlarms(
  storage: OmpAlarmStorage,
  wake: { readonly at?: number },
): Promise<void> {
  if (wake.at !== undefined) await storage.setAlarm(wake.at);
}

/** Local-dev counterpart: SQLite file storage for one session. */
export async function openLocalSqlite(path: string): Promise<Awaited<ReturnType<typeof import("@earendil-works/pi-durable/storage/sqlite/node").openNodeSqliteStorage>>> {
  const { openNodeSqliteStorage } = await import("@earendil-works/pi-durable/storage/sqlite/node");
  return openNodeSqliteStorage(path);
}
