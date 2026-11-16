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
  const template = await readFile(join(root, "example", "index.html"), "utf8");
  const script = `<script type="module">${bundle}</script>`;
  const next = template.includes("<!--app-->")
    ? template.replace("<!--app-->", () => script)
    : template.replace(/<script type="module">[\s\S]*<\/script>/u, () => script);
  await writeFile(join(root, "example", "index.html"), next);
};

if (import.meta.main) {
  await buildExample();
}
