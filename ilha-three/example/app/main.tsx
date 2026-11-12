import { mount } from "ilha";
import type { View } from "ilha";

import { Canvas } from "../../src/index.ts";
import { Overlay } from "./panel.tsx";
import { Scene } from "./scene.tsx";

/**
 * Port of three.js r187 `webgl_animation_skinning_morph`, built only on
 * `ilha-tree` bindings: `<Canvas>` owns the renderer/camera/loop/events,
 * the scene is JSX (`attach`/`args`/dash props), the GLB suspends through
 * `useLoader`, the mixer runs in `useFrame`, and the lil-gui folders become
 * a plain ilha DOM overlay writing the same controller.
 */
const App = (): View => (
  <>
    <Canvas
      camera={{
        fov: 45,
        far: 100,
        near: 0.25,
        position: [-5, 3, 10],
        lookAt: [0, 2, 0],
      }}
    >
      <Scene />
    </Canvas>
    <Overlay />
  </>
);

const root = document.getElementById("app");
if (root === null) {
  throw new Error("#app root is missing");
}
mount(root, App);

// Readable overlay instead of a black page (web3d gate B).
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
