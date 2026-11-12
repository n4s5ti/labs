import type { Container } from "pixi.js";

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
 * GPU resources. Nodes carrying `dispose={null}` semantics opt out via
 * `userData.ilhaDispose = false`.
 */
const userDataOf = (root: Container): Record<string, unknown> | undefined =>
  (root as unknown as { userData?: Record<string, unknown> }).userData;

export const disposeObject = (
  root: Container,
  options?: PixiDisposeOptions,
): void => {
  const tagged = root as Container & { destroyed?: boolean };
  if (tagged.destroyed === true) {
    return;
  }
  // Per-node opt-out (`dispose={null}`): flagged branches are detached
  // and survive while the rest of the subtree releases.
  for (const child of [...root.children]) {
    root.removeChild(child);
    disposeObject(child, options);
  }
  if (userDataOf(root)?.["ilhaDispose"] === false) {
    return;
  }
  root.destroy({
    children: false,
    texture: options?.texture ?? false,
    textureSource: options?.textureSource ?? false,
  });
};

/** Mark a node as excluded from auto-dispose (`dispose={null}` parity). */
export const markNoDispose = (node: Container): void => {
  const existing = userDataOf(node);
  if (existing !== undefined) {
    existing["ilhaDispose"] = false;
    return;
  }
  (node as unknown as { userData: Record<string, unknown> }).userData = {
    ilhaDispose: false,
  };
};
