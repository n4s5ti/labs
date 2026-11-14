import type { Container } from "pixi.js";
import { Container as PixiContainer } from "pixi.js";
import type { Container3D } from "@pixi/3d";

/** A node either scene tree owns. */
export type PixiSceneNode = Container | Container3D;

/** Options for `disposeObject`, mirroring `Container.destroy` flags. */
export interface PixiDisposeOptions {
  /**
   * Also destroy textures held by the subtree. Defaults to `false`:
   * textures are usually shared (e.g. one symbol reused by many
   * sprites), so pass `textureSource: false` explicitly when sharing.
   */
  texture?: boolean;
  /**
   * Also destroy the underlying texture sources (GPU uploads). This
   * split is pixi.js v8-only; keep it `false` for shared textures.
   */
  textureSource?: boolean;
}

/**
 * Dispose a pixi.js subtree, mirroring R3F auto-dispose: containers are
 * destroyed with `{ children: true }` so the whole branch releases its
 * GPU resources. 3D scene nodes take the same path through their own
 * `destroy` (texture flags are a 2D concern and are skipped there).
 * Nodes carrying `dispose={null}` semantics opt out via
 * `userData.ilhaDispose = false`.
 */
const userDataOf = (root: PixiSceneNode): Record<string, unknown> | undefined =>
  (root as unknown as { userData?: Record<string, unknown> }).userData;

export const disposeObject = (
  root: PixiSceneNode,
  options?: PixiDisposeOptions,
): void => {
  const tagged = root as PixiSceneNode & { destroyed?: boolean };
  if (tagged.destroyed === true) {
    return;
  }
  // Per-node opt-out (`dispose={null}`): flagged branches are detached
  // and survive while the rest of the subtree releases.
  for (const child of [...root.children] as PixiSceneNode[]) {
    (root as Container).removeChild(child as never);
    disposeObject(child, options);
  }
  // Scene-routed children (meshes a hole placed under a view's scene
  // root) are not physical children — release them through the owner's
  // record instead, so unmounting a view clears its whole scene.
  const owned = (root as unknown as { owned?: Set<PixiSceneNode> }).owned;
  if (owned !== undefined) {
    for (const child of [...owned]) {
      if ((root.children as unknown[]).includes(child)) {
        continue;
      }
      (child as unknown as Container).parent?.removeChild(child as never);
      disposeObject(child, options);
    }
    owned.clear();
  }
  if (userDataOf(root)?.["ilhaDispose"] === false) {
    return;
  }
  if (root instanceof PixiContainer) {
    root.destroy({
      children: false,
      texture: options?.texture ?? false,
      textureSource: options?.textureSource ?? false,
    });
    return;
  }
  root.destroy();
};

/** Mark a node as excluded from auto-dispose (`dispose={null}` parity). */
export const markNoDispose = (node: PixiSceneNode): void => {
  const existing = userDataOf(node);
  if (existing !== undefined) {
    existing["ilhaDispose"] = false;
    return;
  }
  (node as unknown as { userData: Record<string, unknown> }).userData = {
    ilhaDispose: false,
  };
};
