// Cross-tree controller registry (port of `@ui-sdk/solid`'s
// `controller-target`, minus Solid's signals).
//
// A part outside its component (a trigger in a table row, a carousel step
// outside the carousel) finds its component through the controller both name.
// The component registers its handle under its controller while mounted;
// parts read the registry during render. Unlike Solid's version there is no
// reactive subscription: a part rendered after its component in the document
// resolves at once, while one rendered before it (or whose component mounts
// later) renders the unconnected fallback until a re-render reads again.
// The controller itself still reaches the core imperatively, since core
// attaches its api from the options (`controller.js`).
import { watch } from "ilha";

// Instances by controller, while mounted.
const controlled = new WeakMap<object, unknown>();

/**
 * Registers a component's handle under its controller while mounted, so
 * parts outside the component can find it. Call it unconditionally with the
 * controller getter and the handle.
 * @stable
 */
function useControllerEntry(
  controller: () => object | undefined,
  value: unknown,
) {
  const target = controller();
  if (target) {
    controlled.set(target, value);
  }
  watch.once(() => () => {
    if (target && controlled.get(target) === value) {
      controlled.delete(target);
    }
  });
}

/**
 * The component a part connects to: the one its controller names, from
 * anywhere on the page, or else `nearest`, the one it sits in. Returns a
 * getter like the Solid version; call it during render.
 * @stable
 */
function useControllerTarget<T>(
  controller: () => object | undefined,
  nearest: T | null,
) {
  const current = controller();
  const found =
    ((current ? (controlled.get(current) as T | undefined) : undefined) ??
      nearest ??
      undefined);
  return () => found;
}

export { useControllerEntry, useControllerTarget };
