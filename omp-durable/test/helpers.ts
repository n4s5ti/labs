/**
 * Shared test rig: faux-model sessions over memory storage and a jailed
 * local sandbox. No API keys, no network, no cloud.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels, fauxProvider, type FauxProviderHandle } from "@earendil-works/pi-ai";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { LocalSandboxApi } from "../src/local.ts";
import { sandboxEnvFor } from "../src/sandbox.ts";
import { OmpSession } from "../src/session.ts";

export const context = BACKGROUND_CONTEXT;

export type Rig = {
  readonly session: OmpSession;
  readonly faux: FauxProviderHandle;
  readonly models: ReturnType<typeof createModels>;
  readonly root: string;
  readonly cleanup: () => void;
};

/** Open a session whose tools run in a fresh temp-dir sandbox. */
export async function openTestSession(agent: Record<string, unknown> = {}): Promise<Rig> {
  const root = mkdtempSync(join(tmpdir(), "omp-durable-test-"));
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const sandbox = new LocalSandboxApi(root);
  const session = await OmpSession.open(new MemoryStorage(), {
    models,
    env: sandboxEnvFor(sandbox),
    agent: { model: { provider: "faux", modelId: "faux-1" }, cwd: "/", ...agent },
    context,
  });
  return {
    session,
    faux,
    models,
    root,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
