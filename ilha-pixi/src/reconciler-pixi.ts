import { Color, Container, Filter, Graphics } from "pixi.js";
import { Container3D } from "@pixi/3d";

import { createRenderer } from "ilha/renderer";
import type {
  FiberLocal,
  HostRenderer,
  PaintOps,
  PropBag,
  PropValue,
} from "ilha/renderer";

import {
  isPixiEventProp,
  PIXI_EVENT_PROPS,
  warnOnLowercaseEventProp,
} from "./events.ts";
import { resolveConstructor } from "./catalogue.ts";
import { disposeObject, markNoDispose } from "./dispose.ts";

/**
 * A pixi.js display object carrying the host-element surface ilha's
 * painter needs. Real pixi instances are augmented in place (never
 * wrapped), so `instanceof` checks and the event system keep working;
 * non-Container values (textures, styles, filters…) ride inside a
 * holder container as `pixiObject`.
 */
export interface PixiHostObject extends Container {
  readonly ilhaPixi: true;
  tagName: string;
  isConnected: boolean;
  /** Host bookkeeping (pixi v8 has no `userData`; augmented in place). */
  userData: Record<string, unknown>;
  /** Real value when the tag resolves to a non-Container constructor. */
  pixiObject?: Container | Filter | unknown;
  /** Attach target on the parent (`attach` prop or auto-inferred). */
  attachSpec?: string | ((parent: Container | Container3D, child: unknown) => void);
  /** Where this node is attached (set by `applyAttach`, cleared on release). */
  attachedTo?: { host: Container | Container3D; key: string };
  /** Constructor args currently built with (for `args` diffing). */
  appliedArgs?: readonly unknown[];
  /** Data props applied since construction (replayed after `args` rebuild). */
  appliedProps: Array<readonly [key: string, value: PropValue]>;
  /** `onUpdate` callback from props. */
  updateFn?: (object: Container) => void;
  /** Attachments made onto this host: key -> { node, owner }. */
  attached: Map<string, { node: PixiHostObject; owner: PixiHostObject }>;
  /**
   * Children this host placed outside itself (3D scene nodes living
   * under a view's scene root, including migrated hole contents), so
   * cleanup and disposal find them without sweeping other hosts' nodes.
   */
  owned: Set<PixiHostObject>;
  /** Event prop names currently assigned (for stale-handler cleanup). */
  appliedEvents: Set<string>;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  append: (...nodes: PixiHostObject[]) => void;
}

export type PixiNode = PixiHostObject;

const TEXT_FLAG = "ilhaText";
const TAG_FLAG = "ilhaTag";

/** Filter instances a host carries, assigned to `parent.filters`. */
const FILTERS_FLAG = "__pixireact_filters";

/** The value other nodes attach to. */
export const resolveTarget = (node: PixiHostObject): Container =>
  (node.pixiObject as Container | undefined) ?? node;

/** True for adopted 3D scene nodes (the Container3D subtree). */
export const isSceneNode = (value: unknown): value is Container3D =>
  value instanceof Container3D;

/** The scene a View3D draws, if `host` is one. */
const sceneOf = (host: Container | Container3D): Container3D | undefined => {
  const root = (host as unknown as { root?: unknown }).root;
  return root instanceof Container3D ? root : undefined;
};

/**
 * Place a plain (non-`attach`) child: 3D scene nodes mount under the
 * view's scene root, everything else on the logical host itself.
 *
 * A view draws only its scene (`View3D.addChild` always throws), so a
 * non-3D child under one is a user error with a pointer to the fix —
 * except holes, which ride the scene inertly (the scene accepts plain
 * containers without drawing them) after their 3D children migrate
 * ahead of them. Either way the logical host tracks scene-routed nodes
 * in `owned`, so later cleanups find exactly their own nodes.
 */
const placePlainChild = (host: PixiHostObject, node: PixiHostObject): void => {
  const anchor = attachHost(host);
  const scene = sceneOf(anchor);
  if (scene === undefined) {
    // Only hosts without a scene of their own pull routed children
    // back: a view's scene moves with it, so its routed nodes stay put.
    if (sceneOf(node) === undefined) {
      pullBack(node);
    }
    host.addChild(node);
    return;
  }
  const target = resolveTarget(node);
  if (target instanceof Container3D) {
    scene.addChild(node as never);
    host.owned.add(node);
    // Moving between scenes carries already-routed children along, so a
    // hole reparented view-to-view keeps its whole branch together.
    for (const child of [...node.owned]) {
      const at = (child as unknown as Container).parent;
      if (at instanceof Container3D && at !== scene) {
        scene.addChild(child as never);
      }
    }
    return;
  }
  if (isHole(node)) {
    for (const child of [...node.children] as PixiHostObject[]) {
      if (resolveTarget(child) instanceof Container3D) {
        scene.addChild(child as never);
        node.owned.add(child);
      }
    }
    scene.addChild(node as never);
    host.owned.add(node);
    return;
  }
  throw new Error(
    `<${node.tagName}> cannot mount under <${host.tagName}>: a view draws only its scene (view.root). Put 2D overlays as siblings after the view instead.`,
  );
};

/**
 * Pull scene-routed children back into their host when it leaves the
 * scene (e.g. a hole reparented under a 2D container) — keeps one owner
 * per node instead of leaking scene orphans.
 */
const pullBack = (node: PixiHostObject): void => {
  if (node.owned === undefined || node.owned.size === 0) {
    return;
  }
  for (const child of [...node.owned]) {
    if ((child as unknown as Container).parent instanceof Container3D) {
      node.addChild(child);
      node.owned.delete(child);
    }
  }
};

export const isTextPlaceholder = (node: PixiHostObject): boolean =>
  node.userData[TEXT_FLAG] === true;

const augment = (object: Container, tag: string): PixiHostObject => {
  const el = object as PixiHostObject;
  (el as { ilhaPixi: true }).ilhaPixi = true;
  el.userData ??= {};
  el.tagName = tag;
  el.isConnected = true;
  el.appliedProps = [];
  el.appliedEvents = new Set();
  el.attached = new Map();
  el.owned = new Set();
  if (tag === "span") {
    // Ilha hole host (components, fragments, keyed rows): transparent for
    // `attach`, which climbs to the nearest real ancestor.
    el.userData["ilhaHole"] = true;
  }
  el.setAttribute = (name: string, value: string): void => {
    el.userData[name] = value;
  };
  el.removeAttribute = (name: string): void => {
    delete el.userData[name];
  };
  el.append = (...nodes: PixiHostObject[]): void => {
    for (const node of nodes) {
      if (node.userData[TEXT_FLAG] === true) {
        continue;
      }
      const spec = node.attachSpec ?? inferAttach(node);
      if (spec === undefined) {
        placePlainChild(el, node);
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

/** R3F-style convention for pixi: `Filter` children auto-attach to `filters`. */
const inferAttach = (
  node: PixiHostObject,
): string | ((parent: Container | Container3D, child: unknown) => void) | undefined => {
  if (resolveTarget(node) instanceof Filter) {
    return "filters";
  }
  return undefined;
};

const setPath = (
  parent: Container | Container3D,
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

const getPath = (parent: Container, parts: readonly string[]): unknown => {
  let target: unknown = parent;
  for (const part of parts) {
    target = (target as Record<string, unknown>)[part];
  }
  return target;
};

interface FilterCarrier extends Container {
  [FILTERS_FLAG]?: Filter[];
}

const readFilters = (parent: Container): Filter[] =>
  (parent as FilterCarrier)[FILTERS_FLAG] ?? [];

const writeFilters = (parent: Container, filters: Filter[]): void => {
  (parent as FilterCarrier)[FILTERS_FLAG] = filters;
  (
    parent as unknown as Record<string, Filter[] | null>
  ).filters = filters.length > 0 ? [...filters] : null;
};

const detachFilters = (parent: Container | Container3D, node: PixiHostObject): void => {
  const target = resolveTarget(node);
  if (!(target instanceof Filter)) {
    return;
  }
  const carrier = parent as Container;
  const next = readFilters(carrier).filter((entry) => entry !== target);
  writeFilters(carrier, next);
  disposeObject(target as never);
};

const detachPath = (parent: Container | Container3D, key: string): void => {
  const carrier = parent as Container;
  if (key === "filters") {
    writeFilters(carrier, []);
    return;
  }
  const parts = key.split("-");
  const value = getPath(carrier, parts);
  if (value instanceof Container) {
    disposeObject(value);
  }
  setPath(parent, parts, undefined);
};

/** True for ilha's transparent hole hosts (components, fragments, keys). */
const isHole = (node: PixiHostObject): boolean =>
  node.userData["ilhaHole"] === true;

/** Climb past transparent hole hosts to the nearest real ancestor. */
const attachHost = (immediate: Container): Container | Container3D => {
  let current: Container | Container3D = immediate;
  while (
    (current as PixiHostObject).userData?.["ilhaHole"] === true &&
    current.parent !== null
  ) {
    current = current.parent as Container | Container3D;
  }
  return current;
};

/**
 * Release an attachment recorded on `host`, but only when it still points
 * at `node` (repaints replace entries wholesale; stale releases no-op).
 */
export const releaseAttached = (
  host: Container | Container3D,
  key: string,
  node: PixiHostObject,
): void => {
  const holder = host as unknown as PixiHostObject;
  if (holder.attached?.get(key)?.node !== node) {
    return;
  }
  holder.attached.delete(key);
  if (node.attachedTo?.host === host && node.attachedTo.key === key) {
    node.attachedTo = undefined;
  }
  if (key === "filters") {
    detachFilters(host, node);
    return;
  }
  detachPath(host, key);
  disposeObject(resolveTarget(node));
};

/** Release every attachment owned by a removed subtree. */
const releaseSubtreeAttachments = (root: Container | Container3D): void => {
  const queue: (Container | Container3D)[] = [root];
  while (queue.length > 0) {
    const current = queue.pop() as Container | Container3D;
    queue.push(...(current.children as (Container | Container3D)[]));
    const tagged = current as unknown as Partial<PixiHostObject>;
    if (tagged.attachedTo !== undefined) {
      const { host, key } = tagged.attachedTo;
      releaseAttached(host, key, current as PixiHostObject);
    }
  }
};

const applyAttach = (
  immediate: Container | Container3D,
  node: PixiHostObject,
  spec: string | ((parent: Container | Container3D, child: unknown) => void),
): void => {
  const target = (node.pixiObject ?? node) as unknown;
  const parent = attachHost(immediate as Container);
  if (typeof spec === "function") {
    spec(parent, target);
    return;
  }
  const host = parent as unknown as PixiHostObject;
  host.attached ??= new Map();
  const previous = host.attached.get(spec);
  if (previous !== undefined && previous.node !== node) {
    releaseAttached(parent, spec, previous.node);
  }
  host.attached.set(spec, { node, owner: immediate as PixiHostObject });
  node.attachedTo = { host: parent as Container, key: spec };
  if (spec === "filters") {
    if (target instanceof Filter) {
      const next = readFilters(parent as Container).filter((entry) => entry !== target);
      next.push(target);
      writeFilters(parent as Container, next);
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
  el: PixiHostObject,
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

const hasSetMethod = (
  value: unknown,
): value is { set: (...args: never[]) => void } =>
  value !== null &&
  typeof value === "object" &&
  "set" in value &&
  typeof (value as { set: unknown }).set === "function";

const assignValue = (el: PixiHostObject, key: string, value: unknown): void => {
  const record = resolveTarget(el) as unknown as Record<string, unknown>;
  const current = record[key];
  if (
    current instanceof Color &&
    (typeof value === "string" || typeof value === "number")
  ) {
    current.setValue(value);
    return;
  }
  if (hasSetMethod(current) && Array.isArray(value)) {
    current.set(...(value as never[]));
    return;
  }
  record[key] = value;
};

/** `position-x` / `scale-y`-style dashed props. */
const applyDashProp = (
  el: PixiHostObject,
  key: string,
  value: unknown,
): void => {
  const target = resolveTarget(el) as unknown as Record<string, unknown>;
  const parts = key.split("-");
  if (parts.length === 2) {
    const current = target[parts[0]];
    if (hasSetMethod(current) && typeof value === "number") {
      const point = current as unknown as {
        x: number;
        y: number;
        z?: number;
        set: (x?: number, y?: number, z?: number) => void;
      };
      // Extra args are ignored by 2D points, so one path serves both.
      if (parts[1] === "x") {
        point.set(value, point.y, point.z);
        return;
      }
      if (parts[1] === "y") {
        point.set(point.x, value, point.z);
        return;
      }
      if (parts[1] === "z" && point.z !== undefined) {
        point.set(point.x, point.y, value);
        return;
      }
    }
  }
  setPath(resolveTarget(el), parts, value);
};

const applyPointProp = (
  el: PixiHostObject,
  key: "position" | "scale" | "pivot" | "skew" | "anchor",
  value: unknown,
): void => {
  const target = resolveTarget(el) as unknown as Record<string, unknown>;
  const current = target[key] as
    | { set: (...args: number[]) => void; z?: number }
    | undefined;
  if (typeof value === "number" && current) {
    // 3D vectors take the scalar on every axis; 2D points ignore the rest.
    if ("z" in current) {
      current.set(value, value, value);
    } else {
      current.set(value, value);
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

/** Fresh instance of the element's own type, for removed-prop defaults. */
const freshDefaultOf = (el: PixiHostObject): Container | undefined => {
  const tag = el.userData[TAG_FLAG] as string | undefined;
  if (tag === undefined) {
    return undefined;
  }
  const Ctor = resolveConstructor(tag);
  if (Ctor === undefined) {
    return undefined;
  }
  try {
    const instance = new (Ctor as new (...args: unknown[]) => unknown)(
      ...((el.appliedArgs ?? []) as unknown[]),
    );
    return instance instanceof Container ? instance : undefined;
  } catch {
    return undefined;
  }
};

/** Reset a removed prop to the fresh-constructed default. */
const resetToDefault = (el: PixiHostObject, key: string): void => {
  const target = resolveTarget(el) as unknown as Record<string, unknown>;
  const current = target[key];
  const fresh = freshDefaultOf(el);
  const fallback =
    fresh !== undefined
      ? (fresh as unknown as Record<string, unknown>)[key]
      : undefined;
  if (hasSetMethod(current)) {
    if (Array.isArray(fallback)) {
      current.set(...(fallback as never[]));
      return;
    }
    if (
      fallback !== null &&
      typeof fallback === "object" &&
      "x" in fallback &&
      typeof (fallback as { x: unknown }).x === "number"
    ) {
      const point = fallback as { x: number; y?: number };
      (current.set as (x: number, y?: number) => void)(point.x, point.y);
      return;
    }
  }
  target[key] = fallback;
};

/** Props the reconciler owns; never written onto the pixi instance. */
const isReservedProp = (key: string): boolean =>
  key === "args" ||
  key === "attach" ||
  key === "object" ||
  key === "dispose" ||
  key === "onUpdate" ||
  key === "draw" ||
  key === "children" ||
  key === "key" ||
  key === "ref" ||
  isPixiEventProp(key);

/** Skip getters without setters (read-only instance state). */
const isReadOnlyProp = (el: PixiHostObject, key: string): boolean => {
  let proto: object | null = resolveTarget(el);
  while (proto !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (descriptor !== undefined) {
      if (descriptor.writable === false) {
        return true;
      }
      if (
        descriptor.set === undefined &&
        typeof descriptor.get === "function"
      ) {
        return true;
      }
      return false;
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return false;
};

const reconstructWithArgs = (
  el: PixiHostObject,
  args: readonly unknown[],
): void => {
  if (shallowArgsEqual(el.appliedArgs, args)) {
    return;
  }
  const tag = el.userData[TAG_FLAG] as string;
  const Ctor = resolveConstructor(tag) ?? Container;
  let raw: unknown;
  try {
    raw = new (Ctor as new (...args: unknown[]) => unknown)(
      ...(args as unknown[]),
    );
  } catch {
    // Constructors with required args stay as-is until valid args arrive.
    el.appliedArgs = args;
    return;
  }
  if (raw instanceof Container || raw instanceof Container3D) {
    // Adopt in place whether or not `el` is parented: the fiber already
    // holds `el`, so swapping nodes would strand refs and handlers on
    // the discarded instance (and drops the instance entirely when
    // unparented, as initial-mount `args` used to do).
    adoptInstanceInPlace(el, raw, args);
    return;
  }
  if (el.parent === null && el.pixiObject === undefined) {
    // Initial mount of a non-tree value (texture, material, …): `el`
    // already is a holder, so the value rides it directly — there is
    // no parent slot to transplant into.
    el.pixiObject = raw;
    el.appliedArgs = args;
    for (const [key, value] of el.appliedProps.filter(([k]) => k !== "args")) {
      setPixiProp(el, key, value);
    }
    syncEventMode(el);
    return;
  }
  const holder = augment(new Container(), el.tagName);
  holder.pixiObject = raw;
  transplant(el, holder, args);
};

/** Host bookkeeping that an in-place adoption must not overwrite. */
const ADOPTED_KEEP = new Set([
  "ilhaPixi",
  "userData",
  "tagName",
  "isConnected",
  "appliedProps",
  "appliedEvents",
  "attached",
  "attachSpec",
  "attachedTo",
  "appliedArgs",
  "pixiObject",
  "updateFn",
  "setAttribute",
  "removeAttribute",
  "append",
]);

/**
 * Adopt a freshly constructed instance into `el` in place: unseen
 * instance state moves onto the held node and its prototype becomes the
 * constructor's, then recorded props replay onto the adopted instance.
 * Pixi's own per-instance fields win by staying put — only state the
 * holder lacks is copied over, so children and handlers survive.
 */
const adoptInstanceInPlace = (
  el: PixiHostObject,
  raw: Container | Container3D,
  args: readonly unknown[],
): void => {
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key === "string" && ADOPTED_KEEP.has(key)) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(el, key)) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (descriptor !== undefined) {
      Object.defineProperty(el, key, descriptor);
    }
  }
  Object.setPrototypeOf(el, Object.getPrototypeOf(raw));
  el.appliedArgs = args;
  for (const [key, value] of el.appliedProps.filter(([k]) => k !== "args")) {
    setPixiProp(el, key, value);
  }
  syncEventMode(el);
  if (typeof el.updateFn === "function") {
    el.updateFn(resolveTarget(el));
  }
};

/**
 * Move a non-tree value's holder onto `fresh`: children, handlers and
 * recorded props transfer, then `fresh` takes `el`'s parent slot. Only
 * holders need this — real tree nodes (2D or 3D) adopt in place and keep
 * their identity, so refs, handlers and attachments survive `args`
 * rebuilds.
 */
const transplant = (
  el: PixiHostObject,
  fresh: PixiHostObject,
  args: readonly unknown[],
): void => {
  fresh.userData = { ...el.userData };
  fresh.attachSpec = el.attachSpec;
  fresh.updateFn = el.updateFn;
  fresh.appliedArgs = args;
  fresh.owned = el.owned;
  const replay = el.appliedProps.filter(([k]) => k !== "args");
  el.appliedProps = [];
  for (const spec of [...el.appliedEvents]) {
    const pixiKey = PIXI_EVENT_PROPS[spec];
    const handler = (el as unknown as Record<string, unknown>)[pixiKey];
    if (typeof handler === "function") {
      (fresh as unknown as Record<string, unknown>)[pixiKey] = handler;
      fresh.appliedEvents.add(spec);
    }
  }
  for (const [spec, entry] of [...el.attached]) {
    el.attached.delete(spec);
    entry.owner = entry.owner === el ? fresh : entry.owner;
    fresh.attached.set(spec, entry);
    if (entry.node.attachedTo?.host === el) {
      entry.node.attachedTo = { host: fresh, key: spec };
    }
  }
  for (const child of [...el.children]) {
    fresh.addChild(child);
  }
  // Re-resolve the event mode for the transplanted node.
  syncEventMode(fresh);
  const parent = el.parent;
  if (parent !== null) {
    const hostParent = parent as unknown as PixiHostObject;
    const attachedKey = [...(hostParent.attached?.entries() ?? [])].find(
      ([, entry]) => entry.node === el,
    )?.[0];
    const index = parent.children.indexOf(el as never);
    el.removeFromParent();
    if (attachedKey !== undefined) {
      applyAttach(parent, fresh, fresh.attachSpec ?? attachedKey);
    } else if (index >= 0) {
      parent.addChildAt(fresh, Math.min(index, parent.children.length));
    } else {
      parent.addChild(fresh);
    }
    if (el.attachedTo?.host !== undefined) {
      const { host, key } = el.attachedTo;
      releaseAttached(host, key, el);
    }
    if (el.userData["ilhaDispose"] !== false) {
      disposeObject(el);
    }
  }
  for (const [key, value] of replay) {
    setPixiProp(fresh, key, value);
  }
  if (typeof fresh.updateFn === "function") {
    fresh.updateFn(resolveTarget(fresh));
  }
};

/**
 * Sync `eventMode`/`cursor` from the assigned handlers: nodes carrying
 * handlers are hit-testable (`static`), others opt out (`none`), unless
 * the user set `eventMode` explicitly. Mirrors @pixi/react defaults.
 */
export const syncEventMode = (el: PixiHostObject): void => {
  const record = resolveTarget(el) as unknown as Record<string, unknown>;
  const explicit = el.appliedProps.some(([k]) => k === "eventMode");
  if (explicit) {
    return;
  }
  // Never force `"none"`: pixi prunes `"none"` subtrees from hit testing,
  // which would make handler-bearing descendants unreachable (and leave
  // static containers with no hittable children). Pixi defaults
  // (`"passive"`, `interactiveChildren: true`) already let hit testing
  // descend; only opt handler-bearing nodes into `"static"`.
  if (el.appliedEvents.size === 0) {
    return;
  }
  record["eventMode"] = "static";
  if (!el.appliedProps.some(([k]) => k === "cursor")) {
    record["cursor"] = "pointer";
  }
};

/** Core prop application. Returns `true` when the prop is claimed. */
export const setPixiProp = (
  el: PixiHostObject,
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
    el.attachSpec = value as PixiHostObject["attachSpec"];
    return true;
  }
  if (key === "object") {
    if (value instanceof Container) {
      el.pixiObject = value;
      el.addChild(value);
    } else {
      el.pixiObject = value as PixiHostObject["pixiObject"];
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
      el.updateFn = value as (object: Container) => void;
      el.updateFn(resolveTarget(el));
    }
    return true;
  }
  if (key === "draw") {
    if (
      typeof value === "function" &&
      resolveTarget(el) instanceof Graphics
    ) {
      (value as (graphics: Graphics) => void)(
        resolveTarget(el) as Graphics,
      );
      if (typeof el.updateFn === "function") {
        el.updateFn(resolveTarget(el));
      }
    }
    recordProp(el, key, value);
    return true;
  }
  if (value === undefined) {
    resetToDefault(el, key);
    recordProp(el, key, value);
    return true;
  }
  if (key === "rotation" && Array.isArray(value)) {
    // 3D Euler rotation takes radians (`rotation={[x, y, z]}`); a bare
    // number keeps its 2D meaning and falls through to assignment below.
    const current = (resolveTarget(el) as unknown as Record<string, unknown>)[
      key
    ] as { set: (...args: number[]) => void } | undefined;
    if (current !== undefined && hasSetMethod(current)) {
      current.set(...(value as number[]));
      recordProp(el, key, value);
      return true;
    }
  }
  if (
    key === "position" ||
    key === "scale" ||
    key === "pivot" ||
    key === "skew" ||
    key === "anchor"
  ) {
    // `anchor` only exists on sprites/views; guard before touching it.
    if (key !== "anchor" || "anchor" in resolveTarget(el)) {
      applyPointProp(el, key, value);
      recordProp(el, key, value);
      return true;
    }
  }
  if (key.includes("-")) {
    applyDashProp(el, key, value);
    recordProp(el, key, value);
    return true;
  }
  if (isPixiEventProp(key)) {
    // Event props route through `bindEvents`, never direct assignment.
    return true;
  }
  const record = resolveTarget(el) as unknown as Record<string, unknown>;
  if (isReservedProp(key) || isReadOnlyProp(el, key)) {
    return true;
  }
  if (key in record) {
    assignValue(el, key, value);
    recordProp(el, key, value);
    return true;
  }
  return false;
};

/** Augment an existing stage to serve as a mount root. */
export const adoptStage = (stage: Container): PixiHostObject => {
  const el = augment(stage, "__root__");
  el.userData[TAG_FLAG] = "__root__";
  return el;
};

export const createPixiElement = (tag: string): PixiHostObject => {
  const lower = tag.toLowerCase();
  if (lower === "primitive") {
    const holder = augment(new Container(), tag);
    holder.userData[TAG_FLAG] = tag;
    return holder;
  }
  if (lower === "span") {
    const hole = augment(new Container(), tag);
    hole.userData[TAG_FLAG] = tag;
    return hole;
  }
  const Ctor = resolveConstructor(tag);
  if (Ctor === undefined) {
    throw new Error(
      `<${tag}> is not part of the PIXI namespace. ` +
        `Add it with extend({ ${parseName(tag)}: YourClass }).`,
    );
  }
  try {
    const instance: unknown = new (Ctor as new () => Container)();
    if (instance instanceof Container || instance instanceof Container3D) {
      // Scene nodes adopt in place — a 2D holder could never join the
      // 3D tree, and the renderer needs the real node for its children.
      const el = augment(instance as unknown as Container, tag);
      el.userData[TAG_FLAG] = tag;
      syncEventMode(el);
      return el;
    }
    const holder = augment(new Container(), tag);
    holder.userData[TAG_FLAG] = tag;
    holder.pixiObject = instance;
    return holder;
  } catch {
    // Constructors with required args (AnimatedSprite, …) defer the real
    // build until `args` arrive via `reconstructWithArgs`.
    const holder = augment(new Container(), tag);
    holder.userData[TAG_FLAG] = tag;
    return holder;
  }
};

const parseName = (tag: string): string =>
  tag.length === 0 ? tag : tag[0].toUpperCase() + tag.slice(1);

export const createPixiText = (): PixiHostObject => {
  const el = augment(new Container(), "#text");
  el.userData[TEXT_FLAG] = true;
  return el;
};

const reconcileChildren = (
  host: PixiHostObject,
  nodes: PixiHostObject[],
): void => {
  const seen = new Set<PixiHostObject>();
  const ordered: PixiHostObject[] = [];
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
  // Scene-routed children live under the view's scene root, not the
  // logical host — sweep them through the host's `owned` set so one
  // host never releases another's nodes.
  const scene = sceneOf(attachHost(host));
  const previous: PixiHostObject[] = [...host.children] as PixiHostObject[];
  if (scene !== undefined) {
    for (const child of scene.children) {
      const tagged = child as unknown as PixiHostObject;
      if (host.owned.has(tagged) && !previous.includes(tagged)) {
        previous.push(tagged);
      }
    }
  }
  for (const child of previous) {
    if (!seen.has(child)) {
      const from = ((child as unknown as Container).parent ?? host) as Container;
      from.removeChild(child as never);
      host.owned.delete(child);
      releaseSubtreeAttachments(child as unknown as Container);
      if (child.userData?.[TEXT_FLAG] !== true) {
        if (child.userData?.["ilhaDispose"] !== false) {
          disposeObject(child as never);
        }
      }
    }
  }
  for (const node of ordered) {
    placePlainChild(host, node);
  }
  if (typeof host.updateFn === "function") {
    host.updateFn(resolveTarget(host));
  }
};

/**
 * Reconcile `onX` handler props against the instance: functions assign
 * directly (`sprite.onpointerdown = fn`, per `FederatedEventTarget`).
 * Pixi looks handlers up as ``on${type}`` (`EventBoundary.notifyTarget`),
 * so the assignment keeps the `on` prefix. Falsy or removed props delete
 * the instance key. Afterwards `eventMode` follows the handler set
 * unless the user set it explicitly.
 */
export const bindPixiEvents = (
  el: PixiHostObject,
  props: PropBag,
): void => {
  const record = resolveTarget(el) as unknown as Record<string, unknown>;
  for (const [prop, pixiKey] of Object.entries(PIXI_EVENT_PROPS)) {
    const key = `on${pixiKey}`;
    const value = (props as Record<string, PropValue>)[prop];
    if (typeof value === "function") {
      record[key] = value;
      el.appliedEvents.add(prop);
    } else if (el.appliedEvents.has(prop)) {
      delete record[key];
      el.appliedEvents.delete(prop);
    }
  }
  // Lowercase `onclick`-style props never fire; warn once, loudly.
  for (const key of Object.keys(props)) {
    if (/^on[a-z]/u.test(key)) {
      warnOnLowercaseEventProp(key);
    }
  }
  syncEventMode(el);
};

export const pixiOps: PaintOps<PixiNode, PixiHostObject> = {
  createElement: (tag: string) => createPixiElement(tag),
  createText: () => createPixiText(),
  createRaw: () => [],
  placeChildren: (root, nodes) => {
    reconcileChildren(root as unknown as PixiHostObject, nodes as PixiHostObject[]);
  },
  setProp: (el, key, value) => setPixiProp(el, key, value),
  setStyle: (el, css) => {
    el.userData["style"] = css;
  },
  setFormControl: () => {},
  committed: (el) =>
    (el.pixiObject instanceof Container ? el.pixiObject : el) as PixiHostObject,
  bindEvents: (el, props: PropBag, _fiber: FiberLocal) => {
    void _fiber;
    bindPixiEvents(el, props);
  },
};

/** Host renderer for pixi.js display trees. */
export const createPixiRenderer = (): HostRenderer<PixiNode> =>
  createRenderer<PixiNode, PixiHostObject>(pixiOps);
