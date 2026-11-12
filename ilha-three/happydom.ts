import { afterEach } from "bun:test";

import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

afterEach(() => {
  // Per-test DOM reset; ilha render tracking resets inside ilha/test.
});
