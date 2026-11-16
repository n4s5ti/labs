/**
 * omp-style tool surface on pi-durable.
 *
 * omp's 31 built-ins assume a local machine; this module ports the
 * cloud-portable core — `bash`, `read`, `write`, `edit`, `list` — as
 * pi-durable `ToolRegistration`s that run exclusively through
 * `api.env` (the conversation's `ExecutionEnv`). Against
 * `SandboxExecutionEnv` that is the worker-side sandbox; against
 * `NodeExecutionEnv` it is local dev. The tool code never touches the
 * machine itself, which is what makes the same transcript replayable
 * anywhere.
 *
 * Replay policy (see `ToolRegistration.replay`):
 * - `read`, `list`: `safe` — reruns after a restart simply re-read.
 * - `write`, `edit`, `bash`: `unsafe` — never rerun blindly after a crash;
 *   recovery resumes from the last commit instead.
 *
 * Local-only tools (browser, computer, LSP/DAP, voice, PTY shells) are
 * intentionally absent: they ride the RPC sidecar (`docs`: escape hatch),
 * not the durable transcript.
 */

import type { Context } from "@earendil-works/chord/context";
import { obj, opt, str, num } from "@earendil-works/pi-schema";
import {
  createRegistry,
  defineExtension,
  defineTool,
  type Extension,
  type Registry,
  type ToolExecutionApi,
  type ToolExecutionResult,
} from "@earendil-works/pi-durable";

function noEnv(): ToolExecutionResult {
  return { isError: true, output: [{ type: "text", text: "no execution environment: configure HarnessOptions.env" }] };
}

function textOutput(text: string): ToolExecutionResult {
  return { output: [{ type: "text", text }] };
}

function errorOutput(text: string): ToolExecutionResult {
  return { isError: true, output: [{ type: "text", text }] };
}

const outputSchema = { type: "object", properties: { text: { type: "string" } }, required: ["text"] };

const bashTool = defineTool({
  name: "bash",
  description: "Run a shell command in the conversation's sandbox (cwd, not the host). Returns combined output and exit code.",
  parameters: obj({
    command: str({ description: "Shell command to run." }),
    cwd: opt(str({ description: "Working directory inside the sandbox." })),
    timeoutMs: opt(num({ description: "Kill the command after this many milliseconds." })),
  }),
  structuredOutputSchema: outputSchema,
  execute: async (args, api: ToolExecutionApi, context: Context) => {
    const env = api.env;
    if (env === undefined) return noEnv();
    const collected: string[] = [];
    const result = await env.exec(
      args.command,
      {
        cwd: args.cwd,
        timeout: args.timeoutMs,
        onOutput: (text) => {
          collected.push(text);
          api.output(text);
        },
      },
      context,
    );
    if (!result.ok) return errorOutput(`exec failed: ${result.error.message}`);
    const text = `exit=${result.value.exitCode}\n${collected.join("")}`;
    return { ...textOutput(text), structuredOutput: { text } };
  },
});

const readTool = defineTool({
  name: "read",
  description: "Read a text file from the sandbox. Fails when the path is missing or not a file.",
  parameters: obj({
    path: str({ description: "Sandbox-absolute or cwd-relative file path." }),
    maxLines: opt(num({ description: "Read at most this many lines." })),
  }),
  replay: "safe",
  structuredOutputSchema: outputSchema,
  execute: async (args, api: ToolExecutionApi, context: Context) => {
    const env = api.env;
    if (env === undefined) return noEnv();
    const result = await env.readTextLines(args.path, { maxLines: args.maxLines }, context);
    if (!result.ok) return errorOutput(`read ${args.path}: ${result.error.message}`);
    const text = result.value.join("\n");
    return { ...textOutput(text), structuredOutput: { text } };
  },
});

const writeTool = defineTool({
  name: "write",
  description: "Create or overwrite a text file in the sandbox, creating parent directories as needed.",
  parameters: obj({
    path: str({ description: "Sandbox-absolute or cwd-relative file path." }),
    content: str({ description: "Full file content." }),
  }),
  structuredOutputSchema: outputSchema,
  execute: async (args, api: ToolExecutionApi, context: Context) => {
    const env = api.env;
    if (env === undefined) return noEnv();
    const slash = args.path.lastIndexOf("/");
    if (slash > 0) {
      const dir = await env.createDir(args.path.slice(0, slash), { recursive: true }, context);
      if (!dir.ok) return errorOutput(`write ${args.path}: ${dir.error.message}`);
    }
    const result = await env.writeFile(args.path, args.content, context);
    if (!result.ok) return errorOutput(`write ${args.path}: ${result.error.message}`);
    const text = `wrote ${args.content.length} chars to ${args.path}`;
    return { ...textOutput(text), structuredOutput: { text } };
  },
});

const editTool = defineTool({
  name: "edit",
  description: "Replace exactly one occurrence of old_string with new_string in a sandbox text file.",
  parameters: obj({
    path: str({ description: "Sandbox-absolute or cwd-relative file path." }),
    old_string: str({ description: "Exact text to replace (must occur exactly once)." }),
    new_string: str({ description: "Replacement text." }),
  }),
  structuredOutputSchema: outputSchema,
  execute: async (args, api: ToolExecutionApi, context: Context) => {
    const env = api.env;
    if (env === undefined) return noEnv();
    const loaded = await env.readTextFile(args.path, context);
    if (!loaded.ok) return errorOutput(`edit ${args.path}: ${loaded.error.message}`);
    const occurrences = loaded.value.split(args.old_string).length - 1;
    if (occurrences === 0) return errorOutput(`edit ${args.path}: old_string not found`);
    if (occurrences > 1) return errorOutput(`edit ${args.path}: old_string occurs ${occurrences} times, must be unique`);
    const next = loaded.value.replace(args.old_string, args.new_string);
    const written = await env.writeFile(args.path, next, context);
    if (!written.ok) return errorOutput(`edit ${args.path}: ${written.error.message}`);
    const text = `edited ${args.path}`;
    return { ...textOutput(text), structuredOutput: { text } };
  },
});

const listTool = defineTool({
  name: "list",
  description: "List directory entries in the sandbox (names only, non-recursive).",
  parameters: obj({
    path: opt(str({ description: "Directory to list; defaults to the conversation cwd." })),
  }),
  replay: "safe",
  structuredOutputSchema: { type: "object", properties: { entries: { type: "array", items: { type: "string" } } }, required: ["entries"] },
  execute: async (args, api: ToolExecutionApi, context: Context) => {
    const env = api.env;
    if (env === undefined) return noEnv();
    const result = await env.listDir(args.path ?? env.cwd, context);
    if (!result.ok) return errorOutput(`list ${args.path ?? env.cwd}: ${result.error.message}`);
    const entries = result.value.map((info) => (info.kind === "directory" ? `${info.name}/` : info.name));
    const text = entries.join("\n");
    return { ...textOutput(text), structuredOutput: { entries } };
  },
});

const globTool = defineTool({
  name: "glob",
  description: "List files under a directory whose relative paths match a simple glob (* and ** supported).",
  parameters: obj({
    pattern: str({ description: "Glob like 'src/**/*.ts', relative to path." }),
    path: opt(str({ description: "Directory to search; defaults to the conversation cwd." })),
  }),
  replay: "safe",
  structuredOutputSchema: { type: "object", properties: { entries: { type: "array", items: { type: "string" } } }, required: ["entries"] },
  execute: async (args, api: ToolExecutionApi, context: Context) => {
    const env = api.env;
    if (env === undefined) return noEnv();
    const root = args.path ?? env.cwd;
    const regex = globToRegExp(args.pattern);
    const matches: string[] = [];
    const walk = async (dir: string, relative: string): Promise<boolean> => {
      const listed = await env.listDir(dir, context);
      if (!listed.ok) return true;
      for (const info of listed.value) {
        const rel = relative === "" ? info.name : `${relative}/${info.name}`;
        if (info.kind === "directory") {
          if (info.name === ".git" || info.name === "node_modules") continue;
          if (!(await walk(`${dir}/${info.name}`, rel))) return false;
        } else if (regex.test(rel)) {
          matches.push(rel);
          if (matches.length >= 500) return false;
        }
      }
      return true;
    };
    await walk(root, "");
    const text = matches.join("\n");
    return { ...textOutput(text), structuredOutput: { entries: matches } };
  },
});

function globToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i++;
      } else {
        out += "[^/]*";
      }
    } else if ("\\.+^${}()|[]".includes(char)) {
      out += `\\${char}`;
    } else {
      out += char;
    }
  }
  return new RegExp(`^${out}$`);
}

/** The cloud-portable omp tool surface. */
export function createOmpTools(): ReturnType<typeof defineTool>[] {
  return [bashTool, readTool, writeTool, editTool, listTool, globTool];
}

/** Install the omp tool surface as the `omp` extension. */
export function ompExtension(wraps?: Extension["wraps"]): Extension {
  return defineExtension({ name: "omp", tools: createOmpTools(), ...(wraps === undefined ? {} : { wraps }) });
}

/** Install the omp tool surface into an existing registry. */
export function installOmpTools(registry: Registry, wraps?: Extension["wraps"]): void {
  registry.install(ompExtension(wraps) as Parameters<Registry["install"]>[0]);
}
