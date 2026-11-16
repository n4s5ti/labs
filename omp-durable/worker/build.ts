/**
 * Bundle the worker entries for workerd.
 * - `entry.ts` → `worker/dist/worker.js` (deploy this).
 * - `test-entry.ts` → `worker/dist/test-worker.js` (miniflare tests only).
 *
 * Shims (`worker/shims/`) substitute three packages by EXACT specifier only
 * (`@oh-my-pi/pi-ai` but not `@oh-my-pi/pi-ai/utils/...`): deep subpath
 * imports bypass the shim and bundle the real modules. See
 * `shims/README.md` for why each substitution exists.
 * - `.md` imports load as text (omp's `with { type: "text" }` prompts).
 * - `node:*` stays external: workerd's `nodejs_compat` provides `path`,
 *   `async_hooks`, `crypto`, … — anything else fails the bundle loudly
 *   here instead of in production.
 */

import { build, type BuildOptions, type Plugin } from "esbuild";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const SHIMS: Record<string, string> = {
  "@oh-my-pi/pi-utils": join(root, "worker/shims/pi-utils.ts"),
  "@oh-my-pi/pi-natives": join(root, "worker/shims/pi-natives.ts"),
  "@oh-my-pi/pi-ai": join(root, "worker/shims/pi-ai.ts"),
  "@oh-my-pi/pi-agent-core": join(root, "worker/shims/pi-agent-core.ts"),
};

const shimPlugin: Plugin = {
  name: "omp-shims",
  setup(b) {
    b.onResolve({ filter: /^@oh-my-pi\/(pi-utils|pi-natives|pi-ai|pi-agent-core)$/ }, (args) => ({
      path: SHIMS[args.path],
    }));
  },
};

/**
 * omp uses `import prompt from "./x.md" with { type: "text" }`, which esbuild
 * cannot parse. Bundle-time only: strip the attribute from omp sources and
 * serve the markdown as a JS text module. No upstream behavior changes.
 */
const textAttributePlugin: Plugin = {
  name: "omp-text-attributes",
  setup(b) {
    b.onResolve({ filter: /\.md$/ }, (args) => ({ path: join(args.resolveDir, args.path), namespace: "md-text" }));
    b.onLoad({ filter: /.*/, namespace: "md-text" }, async (args) => {
      const text = await readFile(args.path, "utf8");
      return { contents: `export default ${JSON.stringify(text)};`, loader: "js" };
    });
    b.onLoad({ filter: /node_modules\/@oh-my-pi\/.*\.ts$/ }, async (args) => {
      const contents = await readFile(args.path, "utf8");
      if (!contents.includes("with { type:")) return undefined;
      return { contents: contents.replace(/with\s*\{\s*type:\s*"text"\s*\}/g, ""), loader: "ts" };
    });
  },
};

const shared: BuildOptions = {
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  minify: false,
  sourcemap: false,
  plugins: [shimPlugin, textAttributePlugin],
  inject: [join(root, "worker/shims/bun-global.ts")],
  external: ["node:*"],
  logLevel: "info",
};

for (const [entry, outfile] of [
  ["worker/entry.ts", "worker/dist/worker.js"],
  ["worker/test-entry.ts", "worker/dist/test-worker.js"],
] as const) {
  await build({ ...shared, entryPoints: [join(root, entry)], outfile: join(root, outfile) });
  console.log(`wrote ${outfile}`);
}
