import { defineConfig } from "tsdown";

export default defineConfig({
  dts: true,
  entry: [
    "src/index.ts",
    "src/host.ts",
    "src/paint.ts",
    "src/canvas.tsx",
    "src/hooks.ts",
    "src/events.ts",
    "src/catalogue.ts",
    "src/loop.ts",
    "src/loaders.ts",
    "src/text.ts",
    "src/atoms.ts",
    "src/dispose.ts",
  ],
  external: ["effect", /^effect\//u, "ilha", /^ilha\//u, "bun:ffi"],
  minify: false,
  platform: "neutral",
});
