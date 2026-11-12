import * as Effect from "effect/Effect";
import type * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { ErrorBoundary } from "ilha";
import type { View } from "ilha";

import { useFrame, useLoader, useThree } from "../../src/index.ts";
import type { RootState } from "../../src/index.ts";
import { controller } from "./controller.ts";

/** Ground plane, ported 1:1 from the original scene setup. */
export const Ground = (): View => (
  <>
    <mesh rotation-x={-Math.PI / 2}>
      <planeGeometry args={[2000, 2000]} />
      <meshPhongMaterial color={0xcb_cb_cb} depthWrite={false} />
    </mesh>
    <gridHelper
      args={[200, 40, 0x00_00_00, 0x00_00_00]}
      ref={(grid: unknown) => {
        const material = (grid as THREE.LineSegments)
          .material as THREE.Material;
        material.transparent = true;
        material.opacity = 0.2;
      }}
    />
  </>
);

/** Lights, background and fog, ported 1:1 from the original. */
export const Stage = (): View => (
  <>
    <color attach="background" args={["#e0e0e0"]} />
    <fog attach="fog" args={["#e0e0e0", 20, 100]} />
    <hemisphereLight args={[0xff_ff_ff, 0x8d_8d_8d, 3]} position={[0, 20, 0]} />
    <directionalLight args={[0xff_ff_ff, 3]} position={[0, 20, 10]} />
  </>
);

const MODEL_URL = "assets/RobotExpressive.glb";

interface RobotGltf {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

/**
 * The robot. Suspends on the GLB load (R3F `useLoader` parity), builds the
 * mixer exactly like `createGUI`, then drives it from `useFrame`.
 */
export function* Robot(): Generator<
  Effect.Effect<unknown, unknown, unknown>,
  View | undefined,
  View
> {
  useThree();
  const loader = new GLTFLoader();
  const gltf = (yield useLoader(
    loader,
    MODEL_URL,
  )) as unknown as RobotGltf;
  controller.setup(gltf.scene, gltf.animations);
  useFrame((_store: RootState, delta: number) => {
    controller.update(delta);
  });
  return <primitive object={gltf.scene} />;
}

/** Scene content: stage, ground and the robot behind an error boundary. */
export const Scene = (): View => (
  <>
    <Stage />
    <Ground />
    <ErrorBoundary fallback={() => <group />}>
      <Robot />
    </ErrorBoundary>
  </>
);

/** Poll helper for generator components waiting on plain fields. */
export const waitFor = (
  ready: () => boolean,
): Effect.Effect<unknown, unknown, unknown> => {
  const poll = async (): Promise<unknown> => {
    while (!ready()) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
  };
  return Effect.promise(poll) as Effect.Effect<unknown, unknown, unknown>;
};
