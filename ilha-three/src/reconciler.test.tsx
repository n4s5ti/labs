import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { atom } from "ilha";
import type { AtomHandle } from "ilha";

import "./three-types.ts";
import { adoptScene, createThreeRenderer } from "./reconciler-three.ts";

const waitFor = async (
  condition: () => boolean,
  label: string,
): Promise<void> => {
  for (let i = 0; i < 200; i += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
};

describe("reconciler", () => {
  test("mounts meshes with geometry and material children", async () => {
    const scene = new THREE.Scene();
    const renderer = createThreeRenderer();
    const handle = renderer.mount(adoptScene(scene) as never, () => (
      <mesh position={[1, 2, 3]}>
        <boxGeometry args={[2, 3, 4]} />
        <meshStandardMaterial color="red" />
      </mesh>
    ));
    await handle.ready;
    expect(scene.children.length).toBe(1);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.isMesh).toBe(true);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
    expect((mesh.geometry as THREE.BoxGeometry).parameters.width).toBe(2);
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(
      ((mesh.material as THREE.MeshStandardMaterial).color.getHexString()),
    ).toBe("ff0000");
    handle.unmount();
  });

  test("attaches background color and fog to the scene", async () => {
    const scene = new THREE.Scene();
    const renderer = createThreeRenderer();
    const handle = renderer.mount(adoptScene(scene) as never, () => (
      <>
        <color attach="background" args={["#123456"]} />
        <fog attach="fog" args={["#000000", 1, 100]} />
      </>
    ));
    await handle.ready;
    expect(scene.background).toBeInstanceOf(THREE.Color);
    expect((scene.background as THREE.Color).getHexString()).toBe("123456");
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    handle.unmount();
  });

  test("primitive renders the object with handlers and ref", async () => {
    const scene = new THREE.Scene();
    const renderer = createThreeRenderer();
    const robot = new THREE.Group();
    robot.name = "robot";
    let clicks = 0;
    let refTarget: unknown = null;
    const handle = renderer.mount(adoptScene(scene) as never, () => (
      <primitive
        object={robot}
        onClick={() => {
          clicks += 1;
        }}
        ref={(target: unknown) => {
          refTarget = target;
        }}
      />
    ));
    await handle.ready;
    expect(clicks).toBe(0);
    const holder = scene.children[0] as THREE.Object3D & {
      handlers: Map<string, unknown>;
    };
    expect(holder.children[0]).toBe(robot);
    expect(holder.handlers.has("click")).toBe(true);
    expect(refTarget).toBe(robot);
    handle.unmount();
  });

  test("attach climbs through components to the scene", async () => {
    const scene = new THREE.Scene();
    const renderer = createThreeRenderer();
    const Stage = () => (
      <>
        <color attach="background" args={["#112233"]} />
      </>
    );
    const handle = renderer.mount(adoptScene(scene) as never, () => (
      <>
        <Stage />
        <mesh />
      </>
    ));
    await handle.ready;
    expect(scene.background).toBeInstanceOf(THREE.Color);
    expect((scene.background as THREE.Color).getHexString()).toBe("112233");
    handle.unmount();
  });

  test("reactive replacement disposes the old subtree", async () => {
    const scene = new THREE.Scene();
    const renderer = createThreeRenderer();
    let toggle!: AtomHandle<boolean>;
    const handle = renderer.mount(adoptScene(scene) as never, () => {
      toggle = atom(false, { snapshot: false });
      return toggle() ? (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ) : (
        <group />
      );
    });
    await handle.ready;
    expect(scene.children.length).toBe(1);
    toggle.set(true);
    await waitFor(
      () => (scene.children[0] as THREE.Mesh)?.isMesh === true,
      "mesh to mount",
    );
    const mesh = scene.children[0] as THREE.Mesh;
    let disposed = 0;
    mesh.geometry.dispose = () => {
      disposed += 1;
    };
    toggle.set(false);
    await waitFor(() => scene.children.length === 1, "mesh to unmount");
    expect((scene.children[0] as THREE.Object3D).type).toBe("Group");
    expect(disposed).toBe(1);
    handle.unmount();
  });
});
