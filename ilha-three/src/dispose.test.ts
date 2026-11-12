import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { disposeObject, markNoDispose } from "./dispose.ts";

describe("dispose", () => {
  test("disposes geometry, materials and textures", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const map = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const material = new THREE.MeshStandardMaterial({ map });
    const mesh = new THREE.Mesh(geometry, material);
    let disposedGeometry = 0;
    let disposedMaterial = 0;
    let disposedTexture = 0;
    geometry.dispose = () => {
      disposedGeometry += 1;
    };
    material.dispose = () => {
      disposedMaterial += 1;
    };
    map.dispose = () => {
      disposedTexture += 1;
    };
    disposeObject(mesh);
    expect(disposedGeometry).toBe(1);
    expect(disposedMaterial).toBe(1);
    expect(disposedTexture).toBe(1);
  });

  test("disposes material arrays", () => {
    const materials = [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
    ];
    const counts = [0, 0];
    materials.forEach((material, index) => {
      material.dispose = () => {
        counts[index] += 1;
      };
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials);
    disposeObject(mesh);
    expect(counts).toEqual([1, 1]);
  });

  test("dispose=null opts out via markNoDispose", () => {
    const keeper = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    let disposed = 0;
    keeper.geometry.dispose = () => {
      disposed += 1;
    };
    markNoDispose(keeper);
    const group = new THREE.Group();
    group.add(keeper);
    disposeObject(group);
    expect(disposed).toBe(0);
  });

  test("traverses into children", () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    let disposed = 0;
    geometry.dispose = () => {
      disposed += 1;
    };
    group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    disposeObject(group);
    expect(disposed).toBe(1);
  });
});
