// Ilha adapter over `@ui-sdk/core` (port of `@ui-sdk/solid`'s
// `use-primitive.tsx`).
//
// The Solid adapter is built on Solid owners, memos, projections and
// effects: per-part subscriptions, per-key state memos, deferred binding
// and delivery tracking. None of that exists in Ilha, so this module keeps
// the same public shape (`usePrimitive`, `usePart`, `createParts`,
// `PartProps`, `PrimitiveHandle`, …) but implements it with Ilha idioms:
//
// - One `tick` atom per component (claimed in `usePrimitive`). Core store
//   changes bump it through a microtask, so the component body re-runs and
//   morphs — the documented Ilha equivalent of a Solid effect.
// - Instance and option state live in an `atom.lazy` box, created once per
//   slot and reconciled synchronously on every render (the `ilha-fate`
//   `useFateRequest` shape). Subscription callbacks no-op once their fiber
//   is closed, and everything is released when the component unmounts.
// - No per-part delivery tracking: every part of a component shares the
//   component's tick. Updates are coarser than Solid's (whole component
//   re-renders instead of one key's readers) but always correct.
// - `class` / `style` / `children` functions of the part's state are
//   resolved eagerly against the part's current state instead of through
//   key memos. Ilha's `class` type is a scalar, so array/object class
//   values are joined to a string.
// - Events are lowercase (`onclick`, …) exactly like core's DOM type names,
//   so the Solid `onClick` remap table is unnecessary: `user["on"+type]`.
// - `ref` follows the Ilha contract (node on mount, `null` on unmount) and
//   binds core's `ref()` handle, deferring a microtask when the element is
//   not connected yet (the Solid "settled" rule, simplified).
//
// What is intentionally not ported: `renderStatic` keeps its signature but
// reads plain values (no memos); server "settled" binding collapses to the
// same microtask rule; `provided()` is a no-op wrapper because Ilha
// evaluates JSX eagerly.
import {
  attrs as partAttrs,
  handlers as partHandlers,
  partState,
  present as isPresent,
  ref as coreRef,
  sameValue,
  schemaOf,
  subscribe,
  takeOwnId,
  yieldToAuthor,
  type PrimitiveGeneric,
} from "@ui-sdk/core/renderer";
import type {
  Attrs,
  OptionsOf,
  Part,
  Primitive,
  PropSpec,
  PropsOf,
  SlotName,
  StateOf,
  TypesOf,
} from "@ui-sdk/core";
import { atom, context, createContext, h, untrack, watch } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { getFiber } from "ilha/renderer";
import type { FiberLocal } from "ilha/renderer";

// Calls a user's event handler prop the way a framework element does: a
// function with the event, or the bound form `[handler, data]`, with its
// data first. `extra` follows the event, and what the handler returns
// comes back, so a Button gets its action's Promise.
function callHandler(handler: unknown, event: Event, ...extra: unknown[]) {
  if (Array.isArray(handler)) {
    return (handler[0] as (...args: unknown[]) => unknown)(
      handler[1],
      event,
      ...extra,
    ) as unknown;
  }
  if (typeof handler === "function") {
    return (handler as (...args: unknown[]) => unknown)(event, ...extra);
  }
}

// "position:absolute;--x:1" becomes { position: "absolute", "--x": "1" }.
function styleObject(css: string): Record<string, string> {
  const style: Record<string, string> = {};
  for (const declaration of css.split(";")) {
    const index = declaration.indexOf(":");
    if (index > 0) {
      style[declaration.slice(0, index).trim()] = declaration
        .slice(index + 1)
        .trim();
    }
  }
  return style;
}

// A user's style, maybe a string or a function of the part's state, under
// the part's own. Replacing it, a tree item's `--tree-level` dropped a
// virtualized row's `top`.
function mergeStyles(
  user: unknown,
  part: Record<string, string>,
): Record<string, string> | ((state: unknown) => Record<string, string>) {
  const combine = (style: unknown) => ({
    ...(typeof style === "string"
      ? styleObject(style)
      : (style as Record<string, string> | undefined)),
    ...part,
  });
  return typeof user === "function"
    ? (state: unknown) => combine((user as (state: unknown) => unknown)(state))
    : combine(user);
}

// Class values the Solid adapter accepts (arrays, objects) joined to the
// scalar string Ilha's `class` takes.
function resolveClassValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === false) {
    return undefined;
  }
  if (typeof value === "string") {
    return value === "" ? undefined : value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => resolveClassValue(item))
      .filter((item) => item !== undefined && item !== "")
      .join(" ");
    return joined === "" ? undefined : joined;
  }
  if (typeof value === "object") {
    const joined = Object.entries(value as Record<string, unknown>)
      .filter(([, active]) => Boolean(active))
      .map(([name]) => name)
      .join(" ");
    return joined === "" ? undefined : joined;
  }
  return undefined;
}

/**
 * Core's attributes for a slot as element props. Skips `undefined`, maps
 * the native `checked` to the live `defaultChecked` on the client (core
 * writes the live checkedness itself between renders), and leaves styles
 * for `slotProps` to merge with the author's.
 */
function toIlhaProps(attrs: Attrs): Record<string, unknown> {
  const isServer = typeof document === "undefined";
  const props: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined) {
      continue;
    }
    if (name === "checked") {
      props[isServer ? "checked" : "defaultChecked"] = true;
    } else {
      props[name] = value;
    }
  }
  return props;
}

// Records with the same values, so options rebuilt with equal values do
// not hand the options over again (which would resubscribe the instance).
function sameRecord(a: Record<string, unknown>, b: Record<string, unknown>) {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => key in b && sameValue(a[key], b[key]))
  );
}

// Omit element props by name or predicate (the two `solid-js` `omit`
// forms the ported components use).
function omit<T extends Record<string, any>>(
  props: T,
  ...keys: (string | ((key: string) => boolean))[]
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of Object.keys(props)) {
    let skip = false;
    for (const rule of keys) {
      if (typeof rule === "function" ? rule(key) : rule === key) {
        skip = true;
        break;
      }
    }
    if (!skip) {
      out[key] = props[key];
    }
  }
  return out;
}

let nextId = 0;

type SlotSub = {
  part: Part;
  /** Slot name this part renders under (several live parts can share one). */
  name: string;
  props: unknown;
  unsub: () => void;
  bound: (el: HTMLElement | null) => void;
  attached: HTMLElement | null;
  /** Element whose unbind is deferred (cancelled when it re-attaches). */
  detaching: HTMLElement | null;
  ref: (el: HTMLElement | null) => void;
};

type InstanceBox = {
  id: string;
  instance: ReturnType<Primitive> | null;
  sent: Record<string, unknown> | null;
  /** Every live part's subscription, keyed by the part itself. */
  subs: Map<Part, SlotSub>;
  closed: boolean;
};

/**
 * What `usePrimitive` returns, and what a component's context holds: one object for the instance's life.
 * @stable
 */
type PrimitiveHandle<P extends Primitive> = {
  /** The primitive it's an instance of. */
  primitive: P;
  /** The core instance `usePrimitive` made, with its `get()`, `part()` and `api`. */
  instance: ReturnType<P>;
  /** The instance's state now. Reading it doesn't track; parts read theirs from `usePart`. */
  readonly state: TypesOf<P>["state"];
  /** The methods its definition declares, like Tabs' `setValue`. */
  api: TypesOf<P>["api"];
  /** Whether a slot's element should exist. Reading it in a render tracks the component's tick. */
  present: <S extends SlotName<P>>(
    name: S,
    props?: () => PropsOf<P, S>,
  ) => boolean;
  /**
   * Props for a slot's element: its attributes, listeners and ref, merged
   * with the user's props, whose handlers run first. Call it in the part's
   * body and spread the result, so the attributes update in place.
   */
  slot: <S extends SlotName<P>>(
    name: S,
    props?: () => PropsOf<P, S>,
    user?: Record<string, any>,
  ) => Record<string, any>;
};

const noProps = () => ({});

/**
 * Creates an instance of a primitive for this component, keeps its options
 * current, and destroys it when the component unmounts. Pass the options as
 * a getter, so reactive props stay in sync. Provide the handle to the parts.
 * @stable
 */
function usePrimitive<P extends Primitive>(
  primitive: P,
  options: () => OptionsOf<P>,
) {
  // Prefixed so a page using ui-sdk is recognizable from its HTML. Part ids
  // stay unprefixed, since some are keys, like saved resizable layouts.
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextId += 1)}`, {
    snapshot: false,
  });
  const id = idBox();
  const box = atom.lazy<InstanceBox>(
    () => ({ closed: false, id, instance: null, sent: null, subs: new Map() }),
    { snapshot: false },
  )();
  const fiber: FiberLocal = getFiber();
  // The component's subscription to its instance: core changes schedule a
  // re-render through this tick (read unconditionally, so slot order stays
  // stable and conditional `present()` calls never claim new slots).
  const tick = atom(0, { snapshot: false });
  tick();

  if (box.instance === null) {
    box.instance = untrack(() => primitive({ ...options(), id }));
    box.sent = { ...options(), id } as Record<string, unknown>;
  }
  const instance = box.instance as ReturnType<P>;
  const next = { ...options(), id } as Record<string, unknown>;
  if (box.sent === null || !sameRecord(next, box.sent)) {
    box.sent = next;
    untrack(() => {
      (instance as { setOptions: (next: unknown) => void }).setOptions(next);
    });
  }

  // Destroy the instance and release every part subscription on unmount.
  // `watch.once` is unconditional here (ILHA002), and the guard covers
  // callbacks that fire while the fiber is closing.
  watch.once(() => () => {
    box.closed = true;
    for (const sub of box.subs.values()) {
      sub.unsub();
      // Flush pending and live bindings, like Solid's cleanup calling
      // `bound(null)` when the part leaves.
      sub.detaching = null;
      if (sub.attached !== null) {
        sub.attached = null;
        sub.bound(null);
      }
    }
    box.subs.clear();
    untrack(() => {
      (instance as { destroy: () => void }).destroy();
    });
  });

  const bump = () => {
    // Core notifies synchronously from store writes, which can happen while
    // this fiber renders (the options sync above). Bumping the tick on a
    // microtask keeps the write out of the render pass.
    queueMicrotask(() => {
      if (!box.closed && !fiber.closed) {
        untrack(() => {
          tick.set(tick() + 1);
        });
      }
    });
  };

  // One subscription per live part, like the Solid adapter's per-part
  // trackers: several parts can share one slot name (one tab per value),
  // and each keeps its own element. When a new part takes over an element
  // its predecessor renders (a list item's value changing in place), the
  // predecessor is released the moment the element attaches to the new
  // part; siblings keep theirs.
  const subFor = (name: string, props: () => unknown) => {
    const part = instance.part(name, props());
    const previous = box.subs.get(part);
    if (previous !== undefined) {
      previous.props = props();
      return previous;
    }
    const entry: SlotSub = {
      attached: null,
      bound: (coreRef as (
        part: Part,
        host: { by: string; attaches: string },
      ) => (el: HTMLElement | null) => void)(part, { attaches: "all", by: "framework" }),
      detaching: null,
      name,
      part,
      props: props(),
      ref: () => {},
      unsub: () => {},
    };
    // Release whichever sibling under the same slot name is still bound to
    // this element (attached now, or about to unbind it): a new key is a new
    // part taking over its predecessor's element.
    const takeOver = (el: HTMLElement) => {
      for (const [other, sub] of box.subs) {
        if (other !== part && sub.name === name && (sub.attached === el || sub.detaching === el)) {
          sub.unsub();
          sub.detaching = null;
          if (sub.attached !== null) {
            sub.attached = null;
            sub.bound(null);
          } else {
            // Already detached (or never attached): still release the core
            // binding so the element is bound exactly once.
            sub.bound(null);
          }
          box.subs.delete(other);
        }
      }
      entry.attached = el;
      entry.detaching = null;
      entry.bound(el);
    };
    // Core's ref handle for the part. Ilha re-invokes ref callbacks on every
    // render of their element — `null` followed by the node — so unbinding
    // is deferred a microtask: when the same element re-attaches first, the
    // pending unbind is cancelled and no core write happens at all. Without
    // this, every render would unregister and re-register the part (a panel
    // mount writes `panels`), notifying forever. Bind once connected, else
    // wait a task (an element in a container inserted later, or mid-hydration).
    // Anything that is not an element detaches like `null` (Ilha may pass
    // through non-element hosts).
    entry.ref = (el: HTMLElement | null) => {
      if (
        typeof el !== "object" ||
        el === null ||
        (el as unknown as { nodeType?: unknown }).nodeType !== 1
      ) {
        if (entry.attached !== null) {
          const doomed = entry.attached;
          entry.attached = null;
          entry.detaching = doomed;
          queueMicrotask(() => {
            if (entry.attached === null && entry.detaching === doomed) {
              entry.detaching = null;
              entry.bound(null);
            }
          });
        }
        return;
      }
      if (entry.attached === el || entry.detaching === el) {
        // Same element re-announced: cancel any pending unbind. The core
        // binding is already correct, so no core call happens.
        entry.detaching = null;
        entry.attached = el;
        return;
      }
      if (!el.isConnected) {
        const pending = el;
        queueMicrotask(() => {
          if (entry.attached === null && entry.detaching === null && pending.isConnected) {
            takeOver(pending);
          } else if (entry.attached === null && entry.detaching === null) {
            queueMicrotask(() => {
              if (entry.attached === null && entry.detaching === null) {
                takeOver(pending);
              }
            });
          }
        });
        return;
      }
      takeOver(el);
    };
    entry.unsub = subscribe(part, () => {
      bump();
    }, props());
    box.subs.set(part, entry);
    return entry;
  };

  const handle: PrimitiveHandle<P> = {
    instance: instance as ReturnType<P>,
    primitive,
    get api() {
      return (instance as { api: TypesOf<P>["api"] }).api;
    },
    get state() {
      return (instance as unknown as { get: () => TypesOf<P>["state"] }).get();
    },
    present(name, props = noProps as never) {
      tick();
      const entry = subFor(name as string, props as () => unknown);
      return untrack(() =>
        (isPresent as (part: Part, props: unknown) => boolean)(
          entry.part,
          (entry.part as unknown as { props: unknown }).props,
        ),
      );
    },
    slot(name, props = noProps as never, user = {}) {
      tick();
      const entry = subFor(name as string, props as () => unknown);
      const part = entry.part;
      // Handlers are stable per slot entry. User handlers run first and can
      // call preventDefault() to skip the built-in behavior. Ilha events are
      // lowercase like core's DOM type names, so no remap table is needed.
      const handlers: Record<string, (event: Event) => void> = {};
      const coreHandlers = untrack(() =>
        (
          partHandlers as (
            part: Part,
          ) => Record<string, (event: Event) => void>
        )(part),
      );
      for (const type of Object.keys(coreHandlers)) {
        const prop = `on${type}`;
        handlers[prop] = (event) => {
          callHandler(user[prop], event);
          if (!event.defaultPrevented) {
            coreHandlers[type]?.(event);
          }
        };
      }
      const userRef = untrack(() => user.ref);
      const own: Record<string, unknown> = {
        ...handlers,
        ref:
          typeof userRef === "function"
            ? (el: HTMLElement | null) => {
                entry.ref(el);
                (userRef as (el: HTMLElement | null) => void)(el);
              }
            : entry.ref,
      };
      const current = untrack(() => {
        takeOwnId(part, user.id);
        const ownAttrs = (
          partAttrs as (part: Part, props: unknown) => Attrs
        )(part, (part as unknown as { props: unknown }).props);
        return toIlhaProps(
          yieldToAuthor(ownAttrs, (key: string) => user[key] != null),
        );
      });
      return slotProps(user, new Set(Object.keys(own)), own, () => current);
    },
  };
  return handle;
}

/**
 * A part's state for `render` functions and state-based class names, read
 * from the part now. The component's tick (read by `slot`/`present`)
 * re-renders the part when its state changes.
 */
function slotState(instance: { part: (name: string, props: unknown) => Part }, name: string, props: () => unknown) {
  const part = instance.part(name, props());
  return untrack(() =>
    (partState as (part: Part, props: unknown) => Record<string, unknown>)(
      part,
      (part as { props: unknown }).props,
    ),
  );
}

/**
 * A custom element for a part: its props, which spread onto an element, and its state.
 * @stable
 */
type RenderProp<State = {}> = (
  props: Record<string, any>,
  state: State,
) => JSX.Element;

/**
 * Props every part takes: its element's props, `render`, and class names,
 * styles and children that may be functions of the part's state.
 * `class` takes the scalar Ilha renders, or a state function of it; arrays
 * and objects (valid in Solid) are joined to a string.
 * @stable
 */
type PartProps<Tag extends keyof JSX.IntrinsicElements, State = {}> = Omit<
  JSX.IntrinsicElements[Tag],
  "class" | "style" | "children"
> & {
  /** Class names, or a function of the part's state that returns them. */
  class?:
    | string
    | number
    | boolean
    | null
    | undefined
    | Array<string | number | boolean | null | undefined | Record<string, unknown>>
    | Record<string, unknown>
    | ((state: State) => unknown);
  /** Styles, or a function of the part's state that returns them. */
  style?:
    | string
    | Record<string, string | number | null | undefined>
    | null
    | undefined
    | ((
        state: State,
      ) =>
        | string
        | Record<string, string | number | null | undefined>
        | null
        | undefined);
  /** Renders your own element: a function of the props to spread and the part's state. */
  render?: RenderProp<State>;
  /** Content, or a function of the part's state that returns it. */
  children?: JSX.Element | ((state: State) => JSX.Element);
};

const resolve = (value: unknown, state: unknown) =>
  typeof value === "function" ? (value as (state: unknown) => unknown)(state) : value;

// Children that take the part's state are called with it. A function that
// takes nothing is passed through untouched, the way `<Show>` treats its
// children: calling it here would evaluate the subtree outside the
// element's tracking scope. A single child that arrives wrapped in an array
// (how JSX children reach a component) is unwrapped first, so a lone state
// function does not leak into the tree as a component.
const resolveChildren = (value: unknown, state: unknown) => {
  const single =
    Array.isArray(value) && value.length === 1 ? value[0] : value;
  return typeof single === "function" &&
      (single as (...args: unknown[]) => unknown).length > 0
    ? (single as (state: unknown) => JSX.Element)(state)
    : (single as JSX.Element);
};

/**
 * A component's children as its props carry them. JSX children always
 * arrive wrapped in an array, so one child reads as its element and no
 * child reads as `undefined` (an empty array), which `?? fallback` sites
 * need. A lone state function unwraps to itself for an arity check.
 * @stable
 */
function childOf(props: Record<string, any>): JSX.Element | undefined {
  const children = props.children;
  if (Array.isArray(children)) {
    if (children.length === 1) {
      return children[0] as JSX.Element;
    }
    if (children.length === 0) {
      return undefined;
    }
  }
  return children as JSX.Element | undefined;
}

// The `render` function with its props and state, or the default tag. Class
// names, styles and children that are functions resolve against the part's
// state, read now (the component's tick re-renders when it changes).
function renderElement(
  tag: string,
  props: Record<string, any>,
  state: unknown,
) {
  const { render, ...rest } = props;
  const resolved: Record<string, any> = { ...rest };
  resolved.class = resolveClassValue(resolve(props.class, state));
  const style = resolve(props.style, state);
  resolved.style =
    typeof style === "function"
      ? (style as (state: unknown) => unknown)(state)
      : style;
  if (typeof resolved.style === "string" || typeof resolved.style === "object") {
    // keep as-is: Ilha renders style strings and records
  } else if (resolved.style != null) {
    resolved.style = undefined;
  }
  if (resolved.class === undefined) {
    delete resolved.class;
  }
  if (resolved.style === undefined) {
    delete resolved.style;
  }
  resolved.children = resolveChildren(props.children, state);
  const renderFn = untrack(() => render);
  if (typeof renderFn === "function") {
    return (renderFn as RenderProp<any>)(resolved, state);
  }
  return h(tag, resolved);
}

// A `render` for a part whose element follows its props, like a link or a
// button: the tag or component `tag` returns.
function renderAs(tag: () => string | ((props: any) => JSX.Element)) {
  return (props: Record<string, any>) => {
    const target = untrack(tag);
    return typeof target === "function"
      ? (target as (props: any) => JSX.Element)(props)
      : h(target, props);
  };
}

/**
 * Renders a part with no instance behind it, like a trigger outside its
 * component until the component mounts, from a getter of its attributes and
 * state, which follow the props the getter reads.
 */
function renderStatic<State extends object>(
  tag: string,
  view: () => { attrs: Attrs; state: State },
  user: Record<string, any>,
) {
  const current = untrack(view);
  const attrs = toIlhaProps(current.attrs);
  return renderElement(tag, slotProps(user, new Set(), {}, () => attrs), current.state);
}

/**
 * A context provider's element. Ilha evaluates JSX eagerly, so unlike
 * Solid's version this is a plain pass-through kept for API parity.
 */
function provided(children: JSX.Element) {
  return children;
}

// A slot's props: core's attributes, listeners and ref over the user's
// props. A key the user passed resolves without touching the attributes.
// An `id` the user gives is the element's own, and styles combine (core's
// under the author's).
function slotProps(
  user: Record<string, any>,
  skipped: Set<string>,
  own: Record<string, unknown>,
  attrs: () => Record<string, unknown>,
) {
  const current = attrs();
  const has = (key: string) =>
    key in own || key in current || (!skipped.has(key) && key in user);
  const get = (key: string) => {
    if (key in own) {
      return own[key];
    }
    if (key === "id" && user.id != null) {
      return user.id;
    }
    if (key === "style" && key in current && user.style != null) {
      return mergeStyles(user.style, current.style as Record<string, string>);
    }
    if (key in current) {
      return current[key];
    }
    if (skipped.has(key)) {
      return undefined;
    }
    return key in user || key === "children" ? user[key] : current[key];
  };
  const out: Record<string, any> = {};
  const keys = new Set<string>([
    ...Object.keys(current),
    ...Object.keys(own),
    ...Object.keys(user).filter((key) => !skipped.has(key)),
  ]);
  for (const key of keys) {
    if (has(key)) {
      out[key] = get(key);
    }
  }
  return out;
}

// Each primitive's parts share one context: the handle, and getters of the
// props of the parts around the one rendering, by slot, for props a nested
// part takes from its parent, like a handle's item `value`.
type Scope = {
  handle: PrimitiveHandle<Primitive>;
  around: Record<string, () => Record<string, unknown>>;
};
const scopes = new WeakMap<Primitive, ReturnType<typeof createContext<Scope | null>>>();
function scopeOf(primitive: Primitive) {
  let scopeContext = scopes.get(primitive);
  if (!scopeContext) {
    scopes.set(primitive, (scopeContext = createContext<Scope | null>(null)));
  }
  return scopeContext;
}

// A parser function reads an attribute, which only custom elements have.
const kindOf = (spec: PropSpec) =>
  typeof spec === "string"
    ? spec
    : typeof spec === "object"
      ? (spec as { kind?: string }).kind
      : "value";
// Where a prop comes from when it's left out: the slot, and that slot's prop,
// which `"group.id"` names and `"item"` leaves to the prop's own name.
const fromOf = (spec: PropSpec, key: string) => {
  if (typeof spec !== "object") {
    return undefined;
  }
  const from = (spec as { from?: string }).from;
  if (!from) {
    return undefined;
  }
  const [slot, prop = key] = from.split(".");
  return { prop, slot };
};

// Each primitive's slots whose props a nested part takes, which provide them to it.
const providers = new WeakMap<Primitive, Set<string>>();
function providersOf(primitive: Primitive) {
  let slots = providers.get(primitive);
  if (!slots) {
    const schema = schemaOf(primitive);
    slots = new Set(
      Object.values(schema.slots).flatMap((props) =>
        Object.entries(props).flatMap(
          ([key, spec]) => fromOf(spec, key)?.slot ?? [],
        ),
      ),
    );
    providers.set(primitive, slots);
  }
  return slots;
}

// Each primitive's slots with a `"key"` prop, a list item's value, whose
// nested parts take its key as its value.
const keyedSlots = new WeakMap<Primitive, Set<string>>();
function keyedOf(primitive: Primitive) {
  let slots = keyedSlots.get(primitive);
  if (!slots) {
    const schema = schemaOf(primitive);
    slots = new Set(
      Object.entries(schema.slots).flatMap(([slot, props]) =>
        Object.values(props).some((spec) => kindOf(spec) === "key") ? [slot] : [],
      ),
    );
    keyedSlots.set(primitive, slots);
  }
  return slots;
}

// A list's api, whose items' values key their parts.
type ListApi = { internal: { keyOf: (value: unknown) => string } };

// "tab-icon" is "TabIcon".
const pascal = (name: string) =>
  name.replace(/(^|-)(\w)/g, (_, _dash: string, char: string) => char.toUpperCase());

// The props `schema` names, read from a component's props. What's left out stays out.
function pick(props: Record<string, any>, schema: Record<string, PropSpec>) {
  const named: Record<string, unknown> = {};
  for (const key in schema) {
    const value = props[key];
    if (value !== undefined) {
      named[key] = value;
    }
  }
  return named;
}

// The element's own props: every prop no schema names.
const elementProps = (props: Record<string, any>, ...schemas: Record<string, PropSpec>[]) =>
  omit(props, (key) => schemas.some((schema) => key in schema));

// A part's element with its slot's attributes over `props`, or nothing while
// the slot says it isn't present. A slot that's always present skips the check.
function renderSlot(
  owner: PrimitiveHandle<Primitive>,
  slot: string,
  part: () => Record<string, unknown>,
  props: Record<string, any>,
  tag: string,
) {
  const state = slotState(
    owner.instance as unknown as {
      part: (name: string, props: unknown) => Part;
    },
    slot,
    part,
  );
  const definition = (
    owner.primitive.slots as Record<string, { present?: unknown }> | undefined
  )?.[slot];
  if (definition && !definition.present) {
    return renderElement(tag, owner.slot(slot as never, part as never, props), state);
  }
  return owner.present(slot as never, part as never)
    ? renderElement(tag, owner.slot(slot as never, part as never, props), state)
    : null;
}

/**
 * Renders one part of a primitive written by hand: its element, with the
 * slot's attributes and handlers over `props`, updated in place when what it
 * shows changes, or nothing while the slot says it isn't present. `handle` is
 * `usePrimitive`'s, or the primitive, whose nearest instance it uses. Pass the
 * slot's props as a getter, so reactive props stay in sync. Class names,
 * styles and children that are functions of the part's state run again when
 * the keys they read change. Given `usePrimitive`'s handle, it shares the
 * instance with the parts inside it, like `createParts`'s.
 *
 * @example
 * function StarIcon(props: PartProps<"span", StarIconState> & { value: string }) {
 *   const rest = omit(props, "value")
 *   return usePart(rating, "star-icon", () => ({ value: props.value }), rest, "span")
 * }
 * @stable
 */
function usePart<
  P extends Primitive,
  S extends SlotName<P>,
  State extends StateOf<P, S> = StateOf<P, S>,
  T extends Tag = "div",
>(
  handle: P | PrimitiveHandle<P>,
  slot: S,
  part: () => PropsOf<P, S> = noProps as never,
  props: PartProps<T, State> = {} as PartProps<T, State>,
  tag: T = "div" as T,
) {
  const primitive: Primitive =
    typeof handle === "function" ? handle : handle.primitive;
  const Scope = scopeOf(primitive);
  const scope = context(Scope)();
  const owner = (typeof handle === "function" ? scope?.handle : handle) as
    | PrimitiveHandle<Primitive>
    | undefined;
  if (!owner) {
    throw new Error(`The ${slot} part must be used inside its primitive's root.`);
  }
  const slotPropsFn = part as () => Record<string, unknown>;
  const provides = providersOf(primitive).has(slot as string);
  if (owner === scope?.handle && !provides) {
    return renderSlot(owner, slot as string, slotPropsFn, props, tag);
  }
  // A root written by hand shares its instance with the parts inside it, and
  // a part whose props nested parts take, like an item's value, provides them.
  const inherited = owner === scope?.handle ? scope.around : {};
  // The parts inside a keyed item take its key as its value.
  const aroundProps = keyedOf(primitive).has(slot as string)
    ? () => ({ ...slotPropsFn(), value: slotPropsFn().id })
    : slotPropsFn;
  const around = provides ? { ...inherited, [slot as string]: aroundProps } : inherited;
  return h(Scope.Provider as (props: { value: Scope; children?: JSX.Element }) => JSX.Element, {
    children: renderSlot(owner, slot as string, slotPropsFn, props, tag),
    value: { around, handle: owner },
  });
}

// The props of the part of `slot` around the one rendering, as a getter, like
// an option's inside its group. An item's `value` is its key.
function useAround<P extends Primitive>(primitive: P, slot: SlotName<P>) {
  return context(scopeOf(primitive))()?.around[slot as string];
}

// The nearest instance of a primitive, or undefined outside its root, like a toggle's group.
function useNearest<P extends Primitive>(primitive: P) {
  return context(scopeOf(primitive))()?.handle as PrimitiveHandle<P> | undefined;
}

// The nearest instance of a primitive, for a part written by hand that calls its api.
function useHandle<P extends Primitive>(primitive: P) {
  const handle = useNearest(primitive);
  if (!handle) {
    throw new Error(`A ${primitive.name} part must be used inside its root.`);
  }
  return handle;
}

// Shares an instance from `usePrimitive` with the parts inside a root written
// by hand that renders no element of its own, like a dialog's. A root with an
// element shares it through `usePart`.
function providePrimitive<P extends Primitive>(
  handle: PrimitiveHandle<P>,
  children: () => JSX.Element,
): JSX.Element {
  const Scope = scopeOf(handle.primitive);
  const scope: Scope = {
    around: {},
    handle: handle as unknown as PrimitiveHandle<Primitive>,
  };
  return h(Scope.Provider as (props: { value: Scope; children?: JSX.Element }) => JSX.Element, {
    children: children(),
    value: scope,
  });
}

// "tab-icon" is `TabIcon`.
type Pascal<Name extends string> = Name extends `${infer Head}-${infer Tail}`
  ? `${Capitalize<Head>}${Pascal<Tail>}`
  : Capitalize<Name>;

type Tag = keyof JSX.IntrinsicElements;

// A part's element props, without the ones its slot or options name.
type ElementProps<T extends Tag, State, Named> = Omit<PartProps<T, State>, keyof Named>;

// A part's props: what its slot and, for a root, the options name, and its element's.
type Props<Named, State, T extends Tag | undefined> = T extends Tag
  ? Named & ElementProps<T, State, Named>
  : Named & { children?: JSX.Element };

type RootSlot<P extends Primitive> = "root" & SlotName<P>;

// A slot type core leaves as `any`, like a slot made without type
// parameters, is nothing a part's props or state must name.
type Known<X> = 0 extends 1 & X ? {} : X;

// A slot's props as a part takes them. Its `id` is the element's, which the
// slot reads only when its schema names it.
type NamedProps<P extends Primitive, S extends SlotName<P>> = Omit<Known<PropsOf<P, S>>, "id">;

// A generic primitive's types for parameters `T` and `U`, or the primitive's own without one.
type GenericOf<P> = P extends { generic?: infer G extends PrimitiveGeneric } ? G : never;
type Applied<G, T, U> = G & { T: T; U: U };
type DefaultOf<G extends PrimitiveGeneric, K extends "T" | "U"> = G extends {
  defaults: Record<K, infer D>;
}
  ? D & G[K]
  : G[K];
// A generic's options never include `id`, and an `Omit` there would stop TypeScript inferring its parameters.
// A primitive without parameters (`never`) gets its own types.
type OptionsIn<P extends Primitive, A> = [A] extends [never]
  ? OptionsOf<P>
  : A extends { options: infer O }
    ? O
    : OptionsOf<P>;
type StateIn<P extends Primitive, S extends SlotName<P>, A> = [A] extends [never]
  ? Known<StateOf<P, S>>
  : A extends { state: Record<S, infer State> }
    ? State
    : Known<StateOf<P, S>>;
type PropsIn<P extends Primitive, S extends SlotName<P>, A> = [A] extends [never]
  ? NamedProps<P, S>
  : A extends { props: Record<S, infer Named> }
    ? Named
    : NamedProps<P, S>;

// The root's component: generic over the primitive's parameters when it has them.
type RootOf<P extends Primitive, T extends Tag | undefined> = [GenericOf<P>] extends [never]
  ? (props: RootPropsIn<P, never, T>) => JSX.Element
  : <
        A extends GenericOf<P>["T"] = DefaultOf<GenericOf<P>, "T">,
        B extends GenericOf<P>["U"] = DefaultOf<GenericOf<P>, "U">,
      >(
        props: GenericRootProps<P, Applied<GenericOf<P>, A, B>, T>,
      ) => JSX.Element;
// Indexed, not matched with a conditional, so TypeScript infers the parameters from the props.
type GenericRootProps<P extends Primitive, A extends PrimitiveGeneric, T extends Tag | undefined> = T extends Tag
  ? Props<A["options"] & NamedProps<P, RootSlot<P>>, StateIn<P, RootSlot<P>, A>, T>
  : A["options"] & { children?: JSX.Element };
type RootPropsIn<P extends Primitive, A, T extends Tag | undefined> = T extends Tag
  ? Props<OptionsIn<P, A> & PropsIn<P, RootSlot<P>, A>, StateIn<P, RootSlot<P>, A>, T>
  : OptionsIn<P, A> & { children?: JSX.Element };

// A part's component: generic when the primitive's parameters reach its props or state.
type PartOf<P extends Primitive, S extends SlotName<P>, T extends Tag> = [GenericOf<P>] extends [never]
  ? PartComponent<P, S, T>
  : GenericOf<P> extends { props: Record<S, unknown> }
    ? GenericPartComponent<P, S, T>
    : PartComponent<P, S, T>;

// Interfaces, so declaration files name a part's type instead of spelling out
// every prop of its element at each part.
/**
 * A part's component, from `createParts`: the props of slot `S` of primitive
 * `P` rendered as a `T`.
 * @stable
 */
interface PartComponent<P extends Primitive, S extends SlotName<P>, T extends Tag> {
  (
    props: Props<
      NamedProps<P, S>,
      [GenericOf<P>] extends [never] ? Known<StateOf<P, S>> : StateIn<P, S, GenericOf<P>>,
      T
    >,
  ): JSX.Element;
}

/**
 * A part's component whose props take the primitive's type parameter, like an
 * item's `value`, from `createParts`.
 * @stable
 */
interface GenericPartComponent<P extends Primitive, S extends SlotName<P>, T extends Tag> {
  <A extends GenericOf<P>["T"] = DefaultOf<GenericOf<P>, "T">>(
    props: Props<
      (Applied<GenericOf<P>, A, unknown>["props"] & Record<S, unknown>)[S],
      StateIn<P, S, Applied<GenericOf<P>, A, unknown>>,
      T
    >,
  ): JSX.Element;
}

/**
 * The components `createParts` makes: `Root`, and one per tagged slot, named in Pascal case.
 * @stable
 */
type Parts<P extends Primitive, Tags extends { [S in SlotName<P>]?: Tag }> = {
  Root: RootOf<P, Tags extends { root: Tag } ? Tags["root"] : undefined>;
} & {
  [
    S in keyof TypesOf<P>["slots"] as S extends Exclude<keyof Tags, "root"> & string
    ? Pascal<S>
    : never
  ]: PartOf<P, S & SlotName<P>, NonNullable<Tags[S & keyof Tags]> & Tag>;
};

/**
 * Every part of a primitive as a component, from `createParts`: `Root` makes the
 * instance from the primitive's options and shares it with the parts inside
 * it. Each slot named in `tags` becomes a component that renders that tag,
 * named in Pascal case, like `TabIcon` for `tab-icon`. Without a `root` tag,
 * `Root` renders only its children. Every part takes `render`, and class
 * names, styles and children that may be functions of its state.
 *
 * @example
 * const { Root: Playlist, Track: PlaylistTrack } = createParts(playlist, { root: "ul", track: "li" })
 * @stable
 */
function createParts<P extends Primitive, Tags extends { [S in SlotName<P>]?: Tag }>(
  primitive: P,
  tags: Tags,
) {
  const schema = schemaOf(primitive);
  const Scope = scopeOf(primitive);
  const name = pascal(primitive.name);
  const parts: Record<string, (props: Record<string, any>) => JSX.Element> = {};

  const rootTag = (tags as Record<string, Tag>).root;
  const rootProps = schema.slots.root ?? {};
  parts.Root = (props) => {
    const handle = usePrimitive(primitive, () => pick(props, schema.options) as OptionsOf<P>);
    if (rootTag) {
      const rest = elementProps(props, schema.options, rootProps);
      return usePart(handle, "root" as never, () => pick(props, rootProps) as never, rest, rootTag);
    }
    return providePrimitive(handle, () => props.children);
  };

  for (const [slot, tag] of Object.entries(tags as Record<string, Tag>)) {
    if (slot === "root") {
      continue;
    }
    const propsSchema = schema.slots[slot] ?? {};
    const ids = Object.keys(propsSchema).filter((key) => kindOf(propsSchema[key]) === "id");
    const key = Object.keys(propsSchema).find((prop) => kindOf(propsSchema[prop]) === "key");
    const required = Object.entries(propsSchema).flatMap(([prop, spec]) =>
      typeof spec === "object" && (spec as { required?: boolean }).required
        ? (fromOf(spec, prop)?.slot ?? [])
        : [],
    );
    parts[pascal(slot)] = (props) => {
      const scope = context(Scope)();
      if (!scope) {
        throw new Error(`<${name}${pascal(slot)}> must be used inside <${name}>.`);
      }
      for (const parent of required) {
        if (!scope.around[parent]) {
          throw new Error(`<${name}${pascal(slot)}> must be used inside <${name}${pascal(parent)}>.`);
        }
      }
      // Ilha renders ids deterministically per render; unlike Solid's
      // `createUniqueId`, a module counter is stable across re-renders
      // because the props getter below reuses made ids for the fiber's life.
      const madeBox = atom.lazy<Record<string, string>>(() => ({}), { snapshot: false });
      const made = madeBox();
      for (const idKey of ids) {
        made[idKey] ??= `ilha-ui-sdk-${(nextId += 1)}`;
      }
      const part = () => {
        const named = pick(props, propsSchema);
        for (const keyName in propsSchema) {
          if (named[keyName] !== undefined) {
            continue;
          }
          const from = fromOf(propsSchema[keyName], keyName);
          const value = made[keyName] ?? (from ? scope.around[from.slot]?.()[from.prop] : undefined);
          if (value !== undefined) {
            named[keyName] = value;
          }
        }
        // A list item is keyed by its value's key, which may be an object.
        if (key) {
          named.id = (scope.handle.api as unknown as ListApi).internal.keyOf(named[key]);
        }
        return named;
      };
      // An `id` the slot reads, like a toolbar item's key, is the element's own too.
      const element = omit(props, (prop) => prop !== "id" && prop in propsSchema);
      return usePart(scope.handle, slot as never, part as never, element, tag);
    };
  }
  return parts as unknown as Parts<P, Tags>;
}

export {
  callHandler,
  childOf,
  createParts,
  type GenericPartComponent,
  type PartComponent,
  type PartProps,
  type Parts,
  type PrimitiveHandle,
  omit,
  provided,
  providePrimitive,
  type RenderProp,
  renderAs,
  renderStatic,
  sameRecord,
  toIlhaProps,
  useAround,
  useHandle,
  useNearest,
  usePart,
  usePrimitive,
};
