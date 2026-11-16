/**
 * Skills, custom tools, and the MCP boundary.
 *
 * omp discovers skills, slash-commands, custom tools, and MCP servers
 * (`extensibility/`, `mcp/manager.ts`) and injects them into the agent. On
 * pi-durable the registry is the same seam (`Registry.install`,
 * `wrapTool`, deferred `tool_search` loading):
 *
 * - `skillExtension()`: a skill (name + instructions + optional tools)
 *   becomes a pi-durable extension with an `instructions` prompt section,
 *   selected like any other extension.
 * - `unportableTool()`: local-only capabilities (browser, computer, voice,
 *   PTY) cannot run in a worker. They are registered as explicit errors
 *   naming the RPC-sidecar route — never as silent stubs — so a model that
 *   reaches for them gets a routable answer instead of a hallucinated one.
 *
 * MCP over stdio (`mcp/client.ts` children) likewise cannot spawn in a
 * worker: MCP servers run behind the sandbox service or the sidecar, and
 * their tools arrive here as ordinary `ToolRegistration`s via
 * `registerRemoteTools()`.
 */

import {
  defineExtension,
  defineTool,
  section,
  type Extension,
  type Registry,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";

export type SkillDefinition = {
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
  readonly tools?: readonly ToolRegistration[];
};

/** A skill as a pi-durable extension: instructions section + its tools. */
export function skillExtension(skill: SkillDefinition): Extension {
  return defineExtension({
    name: `skill/${skill.name}`,
    sections: [
      section(`skill-${skill.name}`, () => `${skill.description}\n\n${skill.instructions}`),
    ],
    ...(skill.tools === undefined ? {} : { tools: [...skill.tools] }),
  });
}

/** Install skills into a registry. */
export function installSkills(registry: Registry, skills: readonly SkillDefinition[]): void {
  for (const skill of skills) registry.install(skillExtension(skill) as Parameters<Registry["install"]>[0]);
}

/**
 * Placeholder for a local-only capability. Returns `isError` naming the
 * sidecar route — an explicit, model-readable redirect.
 */
export function unportableTool(name: string, description: string, route = "omp --mode rpc sidecar"): ToolRegistration {
  return defineTool({
    name,
    description: `${description} (requires local execution via ${route}; unavailable in this runtime)`,
    parameters: obj({ _: str() }),
    execute: async () => ({
      isError: true,
      output: [{ type: "text", text: `${name} needs local execution (${route}). Ask the host to run it and return the result.` }],
    }),
  });
}

/** Install tools provided by a remote MCP/sandbox service as-is. */
export function registerRemoteTools(registry: Registry, tools: readonly ToolRegistration[]): void {
  registry.install(defineExtension({ name: "remote", tools: [...tools] }) as Parameters<Registry["install"]>[0]);
}
