import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "example", "app");

/** Bundle the example app and inline it into a single `example/index.html`. */
export const buildExample = async (): Promise<void> => {
  const result = await Bun.build({
    entrypoints: [join(appDir, "main.tsx")],
    external: [],
    minify: true,
    sourcemap: "none",
    target: "browser",
  });
  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    throw new Error("example bundle failed");
  }
  const bundle = await result.outputs[0].text();
  const css = await readFile(join(appDir, "style.css"), "utf8");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="data:," />
<title>Skinning + Morph — ilha-tree</title>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<div id="errors" hidden></div>
<script type="module">${bundle}</script>
</body>
</html>
`;
  await writeFile(join(root, "example", "index.html"), html);
  console.log(`example/index.html (${html.length} bytes)`);
};

if (import.meta.main) {
  await buildExample();
}
