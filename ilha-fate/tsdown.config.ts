import { defineConfig } from "tsdown";

export default defineConfig({
  // dts runs on the published surface only (src without tests): app
  // code keeps guide-idiomatic inferred fate types, which declaration
  // emit cannot name.
  dts: { tsconfig: "./tsconfig.lib.json" },
  entry: ["src/index.ts", "src/hooks.ts", "src/atoms.ts"],
  external: ["effect", /^effect\//u, "ilha", /^ilha\//u, "@nkzw/fate"],
  minify: false,
  platform: "neutral",
});
