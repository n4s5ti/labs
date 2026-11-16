import { watch } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { buildExample } from "./build.ts";

const exampleDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(exampleDir, "..", "src");
const appDir = join(exampleDir, "app");
const PORT = Number(process.env.PORT ?? 8151);

/** Rebuild the bundle; debounced so a save burst triggers one build. */
let pending: ReturnType<typeof setTimeout> | null = null;
const rebuild = (): void => {
  if (pending !== null) {
    clearTimeout(pending);
  }
  pending = setTimeout(() => {
    pending = null;
    buildExample().catch((error: unknown) => {
      console.error(error);
    });
  }, 200);
};

await buildExample();

for (const dir of [appDir, srcDir]) {
  watch(dir, { recursive: true }, (_event, filename) => {
    if (filename !== null && filename.endsWith("~")) {
      return;
    }
    rebuild();
  });
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    let path = decodeURIComponent(new URL(request.url).pathname);
    if (path === "/") {
      path = "/index.html";
    }
    const safe = normalize(path).replace(/^(\\.\\.[\\/\\\\])+/u, "").replace(/^[/\\\\]+/, "");
    const file = Bun.file(join(exampleDir, ...safe.split("/")));
    if (!(await file.exists()) || safe === "" || safe.endsWith(sep)) {
      return new Response("not found", { status: 404 });
    }
    return new Response(file);
  },
});

// eslint-disable-next-line no-console
console.log(`ilha-ui-sdk example: http://localhost:${server.port}/`);
