import * as THREE from "three";

import { atom, context } from "ilha";
import { getFiber } from "ilha/renderer";
import type { FiberLocal } from "ilha/renderer";

import { RootContext } from "./atoms.ts";
import type { RootState } from "./atoms.ts";
import type { FrameState } from "./loop.ts";
import { useLoader } from "./loaders.ts";

/** Read the active Canvas root state (throws outside `<Canvas>`). */
export const useThree = (): RootState => {
  const state = context(RootContext)();
  if (state === null) {
    throw new Error("useThree must be used inside a <Canvas> component.");
  }
  return state;
};

/**
 * Subscribe to the render loop. `priority > 0` takes over rendering
 * (the automatic `gl.render` is skipped while such a subscriber exists).
 * Stable across re-renders; unsubscribes itself once the fiber closes.
 */
export const useFrame = (
  callback: (state: RootState, delta: number) => void,
  priority = 0,
): void => {
  const store = useThree();
  const fiber: FiberLocal = getFiber();
  const latest = { callback };
  const slot = atom.lazy(
    () => {
      const subscription = {
        callback: (frame: FrameState, delta: number): void => {
          if (fiber.closed) {
            unsubscribe();
            return;
          }
          latest.callback(store, delta);
          void frame;
        },
        priority,
        ref: {},
      };
      const unsubscribe = store.loop.subscribe(subscription);
      return subscription;
    },
    { snapshot: false },
  );
  const subscription = slot();
  subscription.priority = priority;
  latest.callback = callback;
};

/** Linked-list object map built from a loaded scene (R3F `useGraph`). */
export interface ObjectMap {
  nodes: Record<string, THREE.Object3D>;
  materials: Record<string, THREE.Material>;
  meshes: Record<string, THREE.Mesh>;
}

/** Walk `object`, indexing named children by name. Pure (no fiber). */
export const useGraph = (object: THREE.Object3D): ObjectMap => {
  const nodes: Record<string, THREE.Object3D> = {};
  const materials: Record<string, THREE.Material> = {};
  const meshes: Record<string, THREE.Mesh> = {};
  object.traverse((child) => {
    if (child.name !== "") {
      nodes[child.name] = child;
    }
    if ((child as THREE.Mesh).isMesh === true) {
      const mesh = child as THREE.Mesh;
      if (mesh.name !== "") {
        meshes[mesh.name] = mesh;
      }
      const material = mesh.material;
      const list = Array.isArray(material) ? material : [material];
      for (const entry of list) {
        if (entry.name !== "" && materials[entry.name] === undefined) {
          materials[entry.name] = entry;
        }
      }
    }
  });
  return { materials, meshes, nodes };
};

/** Stable mutable ref container (escape hatch for imperative handles). */
export const useInstanceHandle = <T>(): { current: T | null } =>
  atom.lazy<{ current: T | null }>(() => ({ current: null }), {
    snapshot: false,
  })();

export { useLoader };
