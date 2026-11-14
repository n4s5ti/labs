import { mount } from "ilha";
import type { View } from "ilha";

import { createAppClient } from "./state.ts";
import { App } from "./ui.tsx";

const root = document.getElementById("app");
if (root === null) {
  throw new Error("#app root is missing");
}

const fate = createAppClient();

const Main = (): View => <App fate={fate} />;

mount(root, Main);

// Readable overlay instead of a black page.
window.addEventListener("error", (event) => {
  showError(event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  showError(
    event.reason instanceof Error ? event.reason.message : String(event.reason),
  );
});

const showError = (message: string): void => {
  const overlay = document.getElementById("errors");
  if (overlay === null) {
    return;
  }
  overlay.hidden = false;
  const item = document.createElement("div");
  item.textContent = message;
  overlay.append(item);
};
