import { defineConfig } from "tsdown";

export default defineConfig({
  dts: { tsconfig: "./tsconfig.lib.json" },
  entry: ["src/index.ts", "src/storage/do.ts"],
  external: [/^@earendil-works\//u],
  minify: false,
  platform: "neutral",
});
