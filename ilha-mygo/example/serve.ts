// Demo server: builds the Go transports on demand, paints the shared demo
// tree through the real ilha renderer into the FFI host, and serves it as
// JSON (`/api/tree`) alongside observable loop/event proof (`/api/proof`).
// Run with `bun run example` → http://localhost:8139/
import { existsSync } from "node:fs";
import { $ } from "bun";

import { FfiHost, MemoryHost } from "../src/index.ts";
import type { SyncHost } from "../src/index.ts";
import { runDemo } from "./demo.tsx";

const rootDir = new URL("..", import.meta.url).pathname;
const libPath = `${rootDir}go/libmygo.so`;
const ipcBin = `${rootDir}bin/mygo-ipc`;

if (!existsSync(libPath)) {
  await $`bun run build:lib`.cwd(rootDir);
}
if (!existsSync(ipcBin)) {
  await $`bun run build:ipc`.cwd(rootDir);
}

let host: SyncHost;
try {
  host = FfiHost.open(libPath);
} catch {
  host = new MemoryHost();
}
const { tree, proof } = await runDemo(host);

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="data:," />
<title>ilha-mygo example</title>
<style>body{font-family:monospace;background:#0e0e1a;color:#d8d8f0;padding:2rem}pre{background:#16162a;padding:1rem}</style>
</head>
<body>
<h1>ilha-mygo (${proof.backend} backend)</h1>
<p>Layout + text + cached image + dispatched click + 5 loop frames, all in the Go retained host.</p>
<h2>proof</h2>
<pre id="proof">loading…</pre>
<h2>tree</h2>
<pre id="tree">loading…</pre>
<script type="module">
const show = (id, value) => { document.getElementById(id).textContent = JSON.stringify(value, null, 2); };
fetch("/api/proof").then((r) => r.json()).then((p) => show("proof", p));
fetch("/api/tree").then((r) => r.json()).then((t) => show("tree", t));
</script>
</body>
</html>
`;

const server = Bun.serve({
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/api/tree") {
      return Response.json(tree);
    }
    if (path === "/api/proof") {
      return Response.json(proof);
    }
    return new Response(page, { headers: { "content-type": "text/html" } });
  },
  port: Number(process.env.PORT ?? 8139),
});

// eslint-disable-next-line no-console
console.log(`ilha-mygo example (${proof.backend} backend): http://localhost:${server.port}/`);
