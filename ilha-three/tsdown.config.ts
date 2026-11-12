import { defineConfig } from "tsdown";

export default defineConfig({
  dts: true,
  entry: [
    "src/index.ts",
    "src/canvas.tsx",
    "src/hooks.ts",
    "src/events.ts",
    "src/catalogue.ts",
  ],
  external: ["effect", /^effect\//u, "ilha", /^ilha\//u, "three", /^three\//u],
  minify: false,
  platform: "neutral",
});
