# omp-durable

oh-my-pi harness features on pi-durable: full `AgentSession`-parity runs with
durable execution on any pi-durable `Storage` — local SQLite for dev,
Cloudflare Durable Objects for cloud.

- **`OmpSession`** — omp's session lifecycle (`prompt`/`steer`/`abort`/
  `resume`/`waitForIdle`/`newSession`/`switchSession`/`fork`/`reset`/
  `compact`) over a pi-durable `Harness`. Crashes resume from the last commit
  (`OmpSession.attach()`).
- **Real omp loop** — `askOmp()` runs genuine `agentLoop()` from
  `@oh-my-pi/pi-agent-core` (a declared dependency) and commits its messages
  to the pi transcript. Turn-taking, tool dispatch, and the event lifecycle
  are omp's code; `sandboxAgentTools()` expresses the cloud-portable tools
  as real omp `AgentTool`s. `ask()` remains the fully-durable pi-generation
  engine.
- **Tools** — cloud-portable `bash`/`read`/`write`/`edit`/`list`/`glob` that
  run exclusively through the conversation's `ExecutionEnv`. Reads are
  replay-safe; mutations never rerun blindly after a restart.
- **Worker-side sandbox** — `SandboxApi` + `SandboxExecutionEnv`: every local
  assumption (`spawn`, `fs`, home dir) behind a sandbox-service contract.
  `LocalSandboxApi` covers dev/tests; bring your own service for cloud.
- **Parity pieces** — durable subagents (child conversations), doc-backed
  human approvals (`approvalGuard` + `approve`/`deny`), role routing
  (`RoleModelMap`), skills registry, compaction policy, omp transcript
  projection, and the full parity matrix (`PARITY`).
- **Cloud** — `omp-durable/storage/do`: DO SQLite storage (`openOmpStorage`)
  plus the `onWake` → `alarm()` recipe (`armAlarms`).

```ts
import { OmpSession } from "omp-durable";
import { openOmpStorage, armAlarms } from "omp-durable/storage/do";

// inside a Durable Object (or locally, with openLocalSqlite + LocalSandboxApi)
const storage = await openOmpStorage(ctx.storage);
const session = await OmpSession.open(storage, {
  models, // host pi-ai Models: catalog + credentials + transport
  env: sandboxEnvFor(sandboxService),
  onWake: (wake) => armAlarms(ctx.storage, wake),
});
await session.ask("hello");
```

No API keys needed for dev: tests and `bun run example` use pi-ai's `faux`
provider. See [PROPOSAL.md](./PROPOSAL.md) for the design and
`src/parity.ts` for the per-feature parity status.
