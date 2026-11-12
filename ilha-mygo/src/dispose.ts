// Subtree disposal for the mygo retained host.
//
// `placeChildren` only detaches, so unmount must explicitly release: every
// child is detached and its subtree removed (Go `Remove` cascades, the
// memory host mirrors it). The opt-out marker lives in the store itself (a
// `__noDispose` prop), so it survives FFI/IPC round-trips and fresh element
// wrappers. Nodes carrying `dispose={null}` semantics opt out via
// `markNoDispose` — they are detached and survive while the rest of the
// subtree releases.
import type { SyncHost } from "./host.ts";
import { MygoElement } from "./paint.ts";

/** Store prop recording the `dispose={null}` opt-out. */
export const NO_DISPOSE_PROP = "__noDispose";

/**
 * Dispose a mygo subtree: detach every child and remove the whole branch
 * from the store. Nodes flagged with `markNoDispose` (`dispose={null}`
 * parity) are detached but survive.
 */
export const disposeObject = (el: MygoElement): void => {
  const host: SyncHost = el.host;
  const tree = host.describe(el.nodeId);
  if (tree === null) {
    return;
  }
  if (tree.props[NO_DISPOSE_PROP] === "1") {
    // Opt-out: the caller already detached this branch; the whole subtree
    // (children included) survives.
    return;
  }
  for (const child of tree.children) {
    host.detach(el.nodeId, child.id);
    disposeObject(MygoElement.__adopt(host, child.id, child.kind));
  }
  host.remove(el.nodeId);
};

/** Mark a node as excluded from auto-dispose (`dispose={null}` parity). */
export const markNoDispose = (el: MygoElement): void => {
  el.noDispose = true;
  el.setAttribute(NO_DISPOSE_PROP, "1");
};
