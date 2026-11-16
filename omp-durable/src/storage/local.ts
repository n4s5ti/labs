/**
 * Local-dev SQLite storage. Node-only (`node:sqlite` via pi-durable's node
 * backend) — imported by tests and the example, never by the worker bundle
 * (workerd cannot even link a dynamic `import()` of it; miniflare rejects
 * the bundle at assembly).
 */

import type { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";

export async function openLocalSqlite(path: string): Promise<SqliteStorage> {
  const { openNodeSqliteStorage } = await import("@earendil-works/pi-durable/storage/sqlite/node");
  return openNodeSqliteStorage(path);
}
