import * as THREE from "three";

/**
 * Dispose a three.js subtree, mirroring R3F auto-dispose: geometries and
 * materials (including material arrays and their textures) are released.
 * Nodes carrying `dispose={null}` semantics opt out via `userData.ilhaDispose = false`.
 */
export const disposeObject = (root: THREE.Object3D): void => {
  const value = root as unknown as {
    traverse?: unknown;
    dispose?: unknown;
  };
  if (typeof value.traverse !== "function") {
    // Standalone geometries, materials and textures dispose directly.
    if (typeof value.dispose === "function") {
      (value.dispose as () => void)();
    }
    return;
  }
  (root as THREE.Object3D).traverse((node) => {
    if (node.userData["ilhaDispose"] === false) {
      return;
    }
    const withGeometry = node as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
    };
    withGeometry.geometry?.dispose?.();
    const withMaterial = node as THREE.Object3D & {
      material?: THREE.Material | THREE.Material[];
    };
    const material = withMaterial.material;
    if (Array.isArray(material)) {
      for (const entry of material) {
        disposeMaterial(entry);
      }
    } else if (material !== undefined) {
      disposeMaterial(material);
    }
  });
};

const disposeMaterial = (material: THREE.Material): void => {
  const record = material as unknown as Record<string, unknown>;
  for (const value of Object.values(record)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
};

/** Mark a node as excluded from auto-dispose (`dispose={null}` parity). */
export const markNoDispose = (node: THREE.Object3D): void => {
  node.userData["ilhaDispose"] = false;
};
