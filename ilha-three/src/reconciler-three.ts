import * as THREE from "three";

import { createRenderer } from "ilha/renderer";
import { normalizeEventName } from "./events.ts";
import type {
  FiberLocal,
  HostRenderer,
  PaintOps,
  PropBag,
  PropValue,
} from "ilha/renderer";

import { rootStateOf } from "./atoms.ts";
import { resolveConstructor } from "./catalogue.ts";
import { disposeObject, markNoDispose } from "./dispose.ts";

/**
 * A three.js scene-graph node carrying the host-element surface ilha's
 * painter needs. Real three instances are augmented in place (never
 * wrapped), so `instanceof`, `isMesh`-style flags and raycasting keep
 * working; non-Object3D values (Color, Fog, materials…) ride inside a
 * holder group as `primitiveObject`.
 */
export interface ThreeHostObject extends THREE.Object3D {
  readonly ilhaHost: true;
  tagName: string;
  isConnected: boolean;
  /** Real value when the tag resolves to a non-Object3D constructor. */
  primitiveObject?: THREE.Object3D | THREE.Color | THREE.Fog | unknown;
  /** Attach target on the parent (`attach` prop or auto-inferred). */
  attachSpec?: string | ((parent: THREE.Object3D, child: unknown) => void);
  /** Where this node is attached (set by `applyAttach`, cleared on release). */
  attachedTo?: { host: THREE.Object3D; key: string };
  /** Constructor args currently built with (for `args` diffing). */
  appliedArgs?: readonly unknown[];
  /** Data props applied since construction (replayed after `args` rebuild). */
  appliedProps: Array<readonly [key: string, value: PropValue]>;
  /** Pointer handlers by DOM event name, registered via `bindEvents`. */
  handlers: Map<string, (event: unknown) => void>;
  /** `onUpdate` callback from props. */
  updateFn?: (object: THREE.Object3D) => void;
  /** Attachments made onto this host: key -> { node, owner }. */
  attached: Map<string, { node: ThreeHostObject; owner: ThreeHostObject }>;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  append: (...nodes: ThreeHostObject[]) => void;
}

export type ThreeNode = ThreeHostObject;

const TEXT_FLAG = "ilhaText";
const TAG_FLAG = "ilhaTag";

/** The value other nodes attach to / raycast resolves to. */
export const resolveTarget = (node: ThreeHostObject): THREE.Object3D =>
  (node.primitiveObject as THREE.Object3D | undefined) ?? node;

export const isTextPlaceholder = (node: ThreeHostObject): boolean =>
  node.userData[TEXT_FLAG] === true;

const augment = (object: THREE.Object3D, tag: string): ThreeHostObject => {
  const el = object as ThreeHostObject;
  el.tagName = tag;
  el.isConnected = true;
  el.appliedProps = [];
  el.handlers = new Map();
  el.attached = new Map();
  if (tag === "span") {
    // Ilha hole host (components, fragments, keyed rows): transparent for
    // `attach`, which climbs to the nearest real ancestor like R3F.
    el.userData["ilhaHole"] = true;
  }
  el.setAttribute = (name: string, value: string): void => {
    el.userData[name] = value;
  };
  el.removeAttribute = (name: string): void => {
    delete el.userData[name];
  };
  el.append = (...nodes: ThreeHostObject[]): void => {
    for (const node of nodes) {
      if (node.userData[TEXT_FLAG] === true) {
        continue;
      }
      const spec = node.attachSpec ?? inferAttach(node);
      if (spec === undefined) {
        // Identity add: primitive holders stay in the tree so refs,
        // events and disposal resolve through the holder.
        el.add(node);
        continue;
      }
      applyAttach(el, node, spec);
    }
    if (typeof el.updateFn === "function") {
      el.updateFn(resolveTarget(el));
    }
  };
  return el;
};

/** R3F naming convention: `*Geometry`/`*Material` children auto-attach. */
const inferAttach = (
  node: ThreeHostObject,
): string | ((parent: THREE.Object3D, child: unknown) => void) | undefined => {
  const name = resolveTarget(node).constructor.name;
  if (name.endsWith("Geometry")) {
    return "geometry";
  }
  if (name.endsWith("Material")) {
    return "material";
  }
  return undefined;
};

const setPath = (
  parent: THREE.Object3D,
  parts: readonly string[],
  value: unknown,
): void => {
  let target: Record<string, unknown> = parent as unknown as Record<
    string,
    unknown
  >;
  for (const part of parts.slice(0, -1)) {
    target = target[part] as Record<string, unknown>;
  }
  target[parts[parts.length - 1]] = value;
};

const getPath = (
  parent: THREE.Object3D,
  parts: readonly string[],
): unknown => {
  let target: unknown = parent;
  for (const part of parts) {
    target = (target as Record<string, unknown>)[part];
  }
  return target;
};

/** Shared fallbacks so detaching never leaves an unrenderable hole. */
let defaultGeometry: THREE.BufferGeometry | undefined;
let defaultMaterial: THREE.Material | undefined;

const detachPath = (parent: THREE.Object3D, key: string): void => {
  const record = parent as unknown as Record<string, unknown>;
  if (key === "geometry") {
    defaultGeometry ??= new THREE.BufferGeometry();
    record["geometry"] = defaultGeometry;
    return;
  }
  if (key === "material") {
    defaultMaterial ??= new THREE.MeshBasicMaterial();
    record["material"] = defaultMaterial;
    return;
  }
  const parts = key.split("-");
  const value = getPath(parent, parts);
  if (value instanceof THREE.Object3D || value instanceof THREE.Material) {
    disposeObject(value as THREE.Object3D);
  }
  setPath(parent, parts, undefined);
};

/** Climb past transparent hole hosts to the nearest real ancestor. */
const attachHost = (immediate: THREE.Object3D): THREE.Object3D => {
  let current = immediate;
  while (
    (current as ThreeHostObject).userData?.["ilhaHole"] === true &&
    current.parent !== null
  ) {
    current = current.parent;
  }
  return current;
};

/**
 * Release an attachment recorded on `host`, but only when it still points
 * at `node` (repaints replace entries wholesale; stale releases no-op).
 */
export const releaseAttached = (
  host: THREE.Object3D,
  key: string,
  node: ThreeHostObject,
): void => {
  const holder = host as unknown as ThreeHostObject;
  if (holder.attached?.get(key)?.node !== node) {
    return;
  }
  holder.attached.delete(key);
  if (node.attachedTo?.host === host && node.attachedTo.key === key) {
    node.attachedTo = undefined;
  }
  detachPath(host, key);
  disposeObject(resolveTarget(node));
};

/** Release every attachment owned by a removed subtree. */
const releaseSubtreeAttachments = (root: THREE.Object3D): void => {
  const queue: THREE.Object3D[] = [root];
  while (queue.length > 0) {
    const current = queue.pop() as THREE.Object3D;
    queue.push(...current.children);
    const tagged = current as unknown as Partial<ThreeHostObject>;
    if (tagged.attachedTo !== undefined) {
      const { host, key } = tagged.attachedTo;
      releaseAttached(host, key, current as ThreeHostObject);
    }
  }
};

const applyAttach = (
  immediate: THREE.Object3D,
  node: ThreeHostObject,
  spec: string | ((parent: THREE.Object3D, child: unknown) => void),
): void => {
  const target = (node.primitiveObject ?? node) as unknown;
  const parent = attachHost(immediate);
  if (typeof spec === "function") {
    spec(parent, target);
    return;
  }
  const host = parent as unknown as ThreeHostObject;
  const previous = host.attached.get(spec);
  if (previous !== undefined && previous.node !== node) {
    releaseAttached(parent, spec, previous.node);
  }
  host.attached.set(spec, { node, owner: immediate as ThreeHostObject });
  node.attachedTo = { host: parent, key: spec };
  if (spec.startsWith("material-")) {
    const record = parent as unknown as Record<string, unknown>;
    const materials = record["material"];
    const index = Number(spec.slice("material-".length));
    if (Array.isArray(materials)) {
      const old = materials[index] as THREE.Material | undefined;
      if (old !== undefined && old !== target) {
        old.dispose();
      }
      materials[index] = target;
    } else {
      record["material"] = [target];
    }
    return;
  }
  setPath(parent, spec.split("-"), target);
};

const shallowArgsEqual = (
  prev: readonly unknown[] | undefined,
  next: readonly unknown[],
): boolean =>
  prev !== undefined &&
  prev.length === next.length &&
  prev.every((value, index) => Object.is(value, next[index]));

const recordProp = (
  el: ThreeHostObject,
  key: string,
  value: PropValue,
): void => {
  const existing = el.appliedProps.findIndex(([k]) => k === key);
  if (existing >= 0) {
    el.appliedProps[existing] = [key, value];
  } else {
    el.appliedProps.push([key, value]);
  }
};

const assignValue = (el: ThreeHostObject, key: string, value: unknown): void => {
  const record = resolveTarget(el) as unknown as Record<string, unknown>;
  const current = record[key];
  if (
    current instanceof THREE.Color &&
    (typeof value === "string" || typeof value === "number")
  ) {
    current.set(value);
    return;
  }
  if (
    current !== null &&
    typeof current === "object" &&
    "set" in current &&
    typeof (current as { set: unknown }).set === "function" &&
    Array.isArray(value)
  ) {
    (current as { set: (...args: unknown[]) => void }).set(...value);
    return;
  }
  record[key] = value;
};

/** `position-x` / `rotation-y` / `material-color`-style dashed props. */
const applyDashProp = (
  el: ThreeHostObject,
  key: string,
  value: unknown,
): void => {
  setPath(resolveTarget(el), key.split("-"), value);
};

const applyMathProp = (
  el: ThreeHostObject,
  key: "position" | "rotation" | "scale",
  value: unknown,
): void => {
  const target = resolveTarget(el) as unknown as Record<string, unknown>;
  const current = target[key] as
    | { set: (...args: number[]) => void }
    | undefined;
  if (typeof value === "number") {
    if (key === "scale" && current) {
      current.set(value, value, value);
    }
    return;
  }
  if (Array.isArray(value) && current) {
    current.set(...(value as number[]));
    return;
  }
  if (value !== null && typeof value === "object") {
    target[key] = value;
  }
};

const reconstructWithArgs = (
  el: ThreeHostObject,
  args: readonly unknown[],
): void => {
  if (shallowArgsEqual(el.appliedArgs, args)) {
    return;
  }
  const tag = el.userData[TAG_FLAG] as string;
  const Ctor = resolveConstructor(tag) ?? THREE.Group;
  if (
    el.primitiveObject !== undefined &&
    !(el.primitiveObject instanceof THREE.Object3D)
  ) {
    el.primitiveObject = new (Ctor as new (...a: unknown[]) => unknown)(
      ...(args as unknown[]),
    ) as ThreeHostObject["primitiveObject"];
    el.appliedArgs = args;
    return;
  }
  const fresh = new (Ctor as new (...a: unknown[]) => THREE.Object3D)(
    ...(args as unknown[]),
  );
  if (fresh instanceof THREE.Object3D) {
    transplant(el, augment(fresh, el.tagName), args);
  } else {
    const holder = augment(new THREE.Group(), el.tagName);
    holder.primitiveObject = fresh;
    transplant(el, holder, args);
  }
};

/** Move children, parent slot, handlers and recorded props onto `fresh`. */
const transplant = (
  el: ThreeHostObject,
  fresh: ThreeHostObject,
  args: readonly unknown[],
): void => {
  fresh.userData = { ...el.userData };
  fresh.attachSpec = el.attachSpec;
  fresh.handlers = el.handlers;
  fresh.updateFn = el.updateFn;
  fresh.appliedArgs = args;
  const replay = el.appliedProps.filter(([k]) => k !== "args");
  el.appliedProps = [];
  for (const [spec, entry] of [...el.attached]) {
    el.attached.delete(spec);
    entry.owner = entry.owner === el ? fresh : entry.owner;
    fresh.attached.set(spec, entry);
    if (entry.node.attachedTo?.host === el) {
      entry.node.attachedTo = { host: fresh, key: spec };
    }
  }
  for (const child of [...el.children]) {
    fresh.add(child);
  }
  const parent = el.parent;
  if (parent !== null) {
    const hostParent = parent as unknown as ThreeHostObject;
    const attachedKey = [...hostParent.attached.entries()].find(
      ([, entry]) => entry.node === el,
    )?.[0];
    const index = parent.children.indexOf(el);
    el.removeFromParent();
    if (attachedKey !== undefined) {
      applyAttach(parent, fresh, fresh.attachSpec ?? attachedKey);
    } else if (index >= 0) {
      parent.children.splice(index, 0, fresh);
      fresh.parent = parent;
    } else {
      parent.add(fresh);
    }
    if (el.attachedTo?.host !== undefined) {
      const { host, key } = el.attachedTo;
      releaseAttached(host, key, el);
    }
    disposeObject(el);
  }
  for (const [key, value] of replay) {
    setThreeProp(fresh, key, value);
  }
  if (typeof fresh.updateFn === "function") {
    fresh.updateFn(resolveTarget(fresh));
  }
};

/** Core prop application. Returns `true` when the prop is claimed. */
export const setThreeProp = (
  el: ThreeHostObject,
  key: string,
  value: PropValue,
): boolean => {
  if (key === "args") {
    if (Array.isArray(value)) {
      reconstructWithArgs(el, value);
    }
    return true;
  }
  if (key === "attach") {
    el.attachSpec =
      value as ThreeHostObject["attachSpec"];
    return true;
  }
  if (key === "object") {
    if (value instanceof THREE.Object3D) {
      el.primitiveObject = value;
      el.add(value);
      // Share the handler map so raycast ascent resolves the real object
      // (matching refs, which receive it through `committed`).
      (value as unknown as { handlers?: Map<string, unknown> }).handlers =
        el.handlers as Map<string, unknown>;
    } else {
      el.primitiveObject = value as ThreeHostObject["primitiveObject"];
    }
    recordProp(el, key, value);
    return true;
  }
  if (key === "dispose") {
    if (value === null) {
      markNoDispose(resolveTarget(el));
    }
    return true;
  }
  if (key === "onUpdate") {
    if (typeof value === "function") {
      el.updateFn = value as (object: THREE.Object3D) => void;
      el.updateFn(resolveTarget(el));
    }
    return true;
  }
  if (key === "position" || key === "rotation" || key === "scale") {
    applyMathProp(el, key, value);
    recordProp(el, key, value);
    return true;
  }
  if (key.includes("-")) {
    applyDashProp(el, key, value);
    recordProp(el, key, value);
    return true;
  }
  const record = resolveTarget(el) as unknown as Record<string, unknown>;
  if (key in record) {
    assignValue(el, key, value);
    recordProp(el, key, value);
    return true;
  }
  return false;
};

/** Augment an existing scene to serve as a mount root. */
export const adoptScene = (scene: THREE.Scene): ThreeHostObject => {
  const el = augment(scene, "__root__");
  el.userData[TAG_FLAG] = "__root__";
  return el;
};

export const createThreeElement = (tag: string): ThreeHostObject => {
  const lower = tag.toLowerCase();
  if (lower === "primitive") {
    const holder = augment(new THREE.Group(), tag);
    holder.userData[TAG_FLAG] = tag;
    return holder;
  }
  const Ctor = resolveConstructor(tag);
  if (Ctor === undefined) {
    const group = augment(new THREE.Group(), tag);
    group.userData[TAG_FLAG] = tag;
    return group;
  }
  try {
    const instance = new (Ctor as new () => THREE.Object3D)();
    if (instance instanceof THREE.Object3D) {
      const el = augment(instance, tag);
      el.userData[TAG_FLAG] = tag;
      return el;
    }
    const holder = augment(new THREE.Group(), tag);
    holder.userData[TAG_FLAG] = tag;
    holder.primitiveObject = instance;
    return holder;
  } catch {
    const group = augment(new THREE.Group(), tag);
    group.userData[TAG_FLAG] = tag;
    return group;
  }
};

export const createThreeText = (): ThreeHostObject => {
  const el = augment(new THREE.Object3D(), "#text");
  el.userData[TEXT_FLAG] = true;
  return el;
};

const reconcileChildren = (
  host: ThreeHostObject,
  nodes: ThreeHostObject[],
): void => {
  const seen = new Set<ThreeHostObject>();
  const ordered: ThreeHostObject[] = [];
  for (const node of nodes) {
    if (node.userData[TEXT_FLAG] === true) {
      continue;
    }
    seen.add(node);
    const spec = node.attachSpec ?? inferAttach(node);
    if (spec === undefined) {
      ordered.push(node);
    } else {
      applyAttach(host, node, spec);
    }
  }
  for (const [key, entry] of [...host.attached]) {
    // Only this host's own paint releases its entries; attachments owned
    // by descendant holes are managed by their own repaints.
    if (entry.owner === host && !seen.has(entry.node)) {
      releaseAttached(host, key, entry.node);
    }
  }
  for (const child of [...host.children]) {
    if (!seen.has(child as ThreeHostObject)) {
      host.remove(child);
      const tagged = child as ThreeHostObject;
      releaseSubtreeAttachments(child);
      if (tagged.userData?.[TEXT_FLAG] !== true) {
        disposeObject(child);
      }
    }
  }
  for (const node of ordered) {
    host.add(node);
  }
  if (typeof host.updateFn === "function") {
    host.updateFn(resolveTarget(host));
  }
};

const EVENT_PROP = /^on[A-Z]/u;

export const threeOps: PaintOps<ThreeNode, ThreeHostObject> = {
  createElement: (tag: string) => createThreeElement(tag),
  createText: () => createThreeText(),
  createRaw: () => [],
  placeChildren: (root, nodes) => {
    reconcileChildren(root as unknown as ThreeHostObject, nodes as ThreeHostObject[]);
  },
  setProp: (el, key, value) => setThreeProp(el, key, value),
  setStyle: (el, css) => {
    el.userData["style"] = css;
  },
  setFormControl: () => {},
  committed: (el) =>
    (el.primitiveObject instanceof THREE.Object3D
      ? el.primitiveObject
      : el) as ThreeHostObject,
  bindEvents: (el, props: PropBag, fiber: FiberLocal) => {
    let claimed = false;
    for (const [key, value] of Object.entries(props)) {
      if (!EVENT_PROP.test(key) || key === "onUpdate" || typeof value !== "function") {
        continue;
      }
      claimed = true;
      el.handlers.set(
        normalizeEventName(key.slice(2).toLowerCase()),
        value as (event: unknown) => void,
      );
    }
    if (claimed) {
      const state = rootStateOf(fiber.runtime);
      const target = resolveTarget(el);
      if (state && target instanceof THREE.Object3D && !state.interactive.includes(target)) {
        state.interactive.push(target);
      }
    }
  },
};

/** Host renderer for three.js scene graphs. */
export const createThreeRenderer = (): HostRenderer<ThreeNode> =>
  createRenderer<ThreeNode, ThreeHostObject>(threeOps);
