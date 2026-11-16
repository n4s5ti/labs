/**
 * Test entry: the same worker app, scripted drivers.
 *
 * Re-exports everything from `entry.ts` but binds `SessionDrivers` to an
 * in-memory sandbox and a scripted model transport, so miniflare tests
 * prove the real `agentLoop()` + pi-durable + DO storage path with no
 * network, no keys, and no sandbox service. Not deployed.
 */

import { scriptedStreamFn } from "../src/omp-loop.ts";
import { OmpSessionObject } from "./session-do.ts";
import { MemorySandboxApi } from "./test-sandbox.ts";
import entry, { dispatchQueueMessage, type QueueMessageBody, type WorkerEnv } from "./entry.ts";

const sandboxes = new Map<string, MemorySandboxApi>();

export function sandboxForTest(sessionId: string): MemorySandboxApi {
  let sandbox = sandboxes.get(sessionId);
  if (sandbox === undefined) {
    sandbox = new MemorySandboxApi();
    sandboxes.set(sessionId, sandbox);
  }
  return sandbox;
}

OmpSessionObject.drivers = {
  streamFnFor: () =>
    scriptedStreamFn([
      { toolCalls: [{ name: "write", args: { path: "hello.txt", content: "worker real loop" }, id: "w1" }] },
      { toolCalls: [{ name: "read", args: { path: "hello.txt" }, id: "r1" }] },
      { text: "confirmed from the isolate" },
    ]),
  sandboxFor: (sessionId) => sandboxForTest(sessionId),
};

export { OmpSessionObject, dispatchQueueMessage };
export type { QueueMessageBody, WorkerEnv };
export default entry;
