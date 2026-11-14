// One-shot demo bundle: snapshot the shared demo tree into
// `example/index.html`.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { $ } from "bun";

import { FfiHost, MemoryHost } from "../src/index.ts";
import type { SyncHost } from "../src/index.ts";
import { runDemo } from "./demo.tsx";

const exampleDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(exampleDir, "..");

if (!existsSync(join(rootDir, "go", "libasuka.so"))) {
  await $`bun run build:lib`.cwd(rootDir);
}

let host: SyncHost;
try {
  host = FfiHost.open(join(rootDir, "go", "libasuka.so"));
} catch {
  host = new MemoryHost();
}

const { tree, proof, state } = await runDemo(host);
const ops = host.ops();
state.dispose();
if (host instanceof FfiHost) {
  host.close();
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="data:," />
<title>ilha-asuka example (${proof.backend})</title>
<style>body{font-family:monospace;background:#0e0e1a;color:#d8d8f0;padding:2rem}pre{background:#16162a;padding:1rem}</style>
</head>
<body>
<h1>ilha-asuka (${proof.backend} backend)</h1>
<h2>proof</h2>
<pre>${JSON.stringify(proof, null, 2)}</pre>
<h2>ops</h2>
<pre>${JSON.stringify(ops, null, 2)}</pre>
<h2>tree</h2>
<pre>${JSON.stringify(tree, null, 2)}</pre>
</body>
</html>
`;
await writeFile(join(exampleDir, "index.html"), html);
// eslint-disable-next-line no-console
console.log(`wrote example/index.html (${proof.backend} backend)`);
