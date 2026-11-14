// Subtree disposal for the Asuka retained host.
//
// `placeChildren` only removes dropped children, so unmount must release
// explicitly: the whole branch is destroyed (Go `Destroy` cascades, the
// memory host mirrors it). The opt-out marker lives in the store itself
// (a `__noDispose` attr), so it survives FFI/IPC round-trips and fresh
// element wrappers. Nodes carrying `dispose={null}` semantics opt out via
// `markNoDispose` — they are detached and survive while the rest of the
// subtree releases.
import type { SyncHost } from "./host.ts";
import { AsukaElement } from "./paint.ts";

/** Store attr recording the `dispose={null}` opt-out. */
export const NO_DISPOSE_PROP = "__noDispose";

/**
 * Dispose an asuka subtree: detach every child and destroy the whole
 * branch in the store. Nodes flagged with `markNoDispose`
 * (`dispose={null}` parity) are detached but survive.
 */
export const disposeObject = (el: AsukaElement): void => {
  const host: SyncHost = el.host;
  const tree = host.describe(el.nodeId);
  if (tree === null) {
    return;
  }
  if (tree.props[NO_DISPOSE_PROP] === "1") {
    // Opt-out: the caller already detached this branch; the whole
    // subtree (children included) survives.
    return;
  }
  for (const child of tree.children) {
    if (child.props[NO_DISPOSE_PROP] === "1") {
      // Flagged branches detach and survive with their subtree intact.
      host.remove(el.nodeId, child.id);
    } else {
      disposeObject(AsukaElement.__adopt(host, child.id, child.kindId));
    }
  }
  host.destroy(el.nodeId);
};

/** Mark a node as excluded from auto-destroy (`dispose={null}` parity). */
export const markNoDispose = (el: AsukaElement): void => {
  el.noDispose = true;
  el.host.setAttr(el.nodeId, NO_DISPOSE_PROP, "1");
};
