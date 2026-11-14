import { mount } from "ilha";
import type { View } from "ilha";

import { Canvas } from "../../src/index.ts";
import { Scene } from "./scene.tsx";

/**
 * Port of the pixi.js v8 slots example, built only on `ilha-pixi`
 * bindings: `<Canvas>` owns the application/ticker/resize, the machine
 * is JSX, symbols suspend through `useLoader`, and SPIN is a pointerdown
 * handler away — with a `@pixi/3d` spinning-cube backdrop behind it.
 */
const App = (): View => (
  <>
    <Canvas background="#0e0e1a">
      <Scene />
    </Canvas>
    <header class="overlay">
      <h1>Pixi Monster Slots — ilha-pixi</h1>
      <p>Click SPIN (or the button) to play. Reels ease out with backout. Tap the cube to spin it faster.</p>
    </header>
  </>
);

const root = document.getElementById("app");
if (root === null) {
  throw new Error("#app root is missing");
}
mount(root, App);

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
