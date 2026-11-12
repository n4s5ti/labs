// Root component and imperative roots for the mygo retained host.
//
// `bootRoot` paints `children` through the real ilha renderer into a fresh
// root element and returns the root state (loop, size, invalidate, dispose
// — pixi `RootState` parity minus the GPU). `createRoot` is the imperative
// R3F-style handle; `MygoRoot` is the declarative top component carrying
// the state in context for `useMygo`/`useFrame`.
import { h } from "ilha";
import type { View } from "ilha";

import {
  registerRootState,
  RootContext,
  unregisterRootState,
} from "./atoms.ts";
import type { RootSize, RootState } from "./atoms.ts";
import type { SyncHost } from "./host.ts";
import type { Frameloop } from "./loop.ts";
import { createLoop } from "./loop.ts";
import { disposeObject } from "./dispose.ts";
import { createMygoRenderer, MygoElement } from "./paint.ts";

/** Props for `<MygoRoot>` / `bootRoot` (mygo has no GPU surface to configure). */
export interface MygoRootProps {
  children?: View;
  /** Loop drive mode (`demand` default: mygo renders only on change). */
  frameloop?: Frameloop;
  /** Logical root size in device-independent px. */
  size?: RootSize;
  /** Fires once the root mounted (after the first commit). */
  onCreated?: (state: RootState) => void;
}

/** Mutable build-up of the public `RootState`. */
interface MutableState extends Omit<RootState, "status" | "frames" | "ready"> {
  status: RootState["status"];
  frames: number;
  ready: Promise<void>;
}

/**
 * Declarative root. Carries a booted root state in context for
 * `useMygo`/`useFrame`; `bootRoot` mounts exactly this around `children`.
 */
export const MygoRoot = (
  props: { state: RootState; children?: View },
): View =>
  h(RootContext.Provider as never, { value: props.state }, props.children);

/**
 * Boot a root state on `host` and mount `children` into a fresh root
 * element; the inverse is `state.dispose()`. Fully synchronous — the
 * retained store needs no GPU init.
 */
export const bootRoot = (
  host: SyncHost,
  children: View,
  props: Omit<MygoRootProps, "children"> = {},
): RootState => {
  const { frameloop = "demand", onCreated, size = { height: 720, width: 1280 } } = props;

  const root = new MygoElement(host, "root");
  const mutable = {
    frameloop,
    frames: 0,
    host,
    ready: Promise.resolve(),
    loop: createLoop(() => {
      mutable.frames += 1;
    }),
    root,
    size: { ...size },
    status: "open",
  } as MutableState;
  mutable.advance = (timestamp: number, manual = true): void => {
    mutable.loop.advance(timestamp, manual);
  };
  mutable.invalidate = (): void => {
    mutable.loop.invalidate();
  };
  mutable.setFrameloop = (mode: Frameloop): void => {
    mutable.frameloop = mode;
    mutable.loop.setFrameloop(mode);
  };
  mutable.setSize = (width: number, height: number): void => {
    mutable.size = { height, width };
    mutable.invalidate();
  };
  // Assigned by `mount` below; `dispose` only runs after boot returns.
  let unmount = (): void => undefined;
  let runtime: object | null = null;
  mutable.dispose = (): void => {
    if (mutable.status !== "open") {
      return;
    }
    mutable.status = "closing";
    unmount();
    if (runtime !== null) {
      unregisterRootState(runtime);
    }
    mutable.loop.stop();
    const tree = host.describe(root.nodeId);
    for (const child of tree?.children ?? []) {
      host.detach(root.nodeId, child.id);
      disposeObject(MygoElement.__adopt(host, child.id, child.kind));
    }
    mutable.status = "disposed";
  };
  const state = mutable as unknown as RootState;

  mutable.loop.setFrameloop(frameloop);
  const renderer = createMygoRenderer(host);
  const handle = renderer.mount(
    root as never,
    () => h(MygoRoot as never, { state }, children) as View,
    {
      onRuntime: (rt) => {
        runtime = rt;
        registerRootState(rt, state);
      },
    },
  );
  unmount = handle.unmount;
  mutable.ready = handle.ready.then(() => undefined);
  // Demand mode renders the first commit on mount; `always` starts ticking.
  mutable.invalidate();
  void handle.ready.then(() => {
    onCreated?.(state);
  });
  return state;
};

/** Imperative root (R3F `createRoot` parity, synchronous boot). */
export interface ReconcilerRoot {
  render: (children: View) => void;
  unmount: () => void;
  configure: (opts: Partial<Pick<RootState, "frameloop">>) => void;
}

export const createRoot = (
  host: SyncHost,
  defaults: Omit<MygoRootProps, "children"> = {},
): ReconcilerRoot => {
  let state: RootState | null = null;
  return {
    configure: (opts) => {
      if (opts.frameloop !== undefined) {
        state?.setFrameloop(opts.frameloop);
      }
    },
    render: (children: View) => {
      if (state !== null && state.status === "open") {
        state.dispose();
      }
      state = bootRoot(host, children, defaults);
    },
    unmount: () => {
      state?.dispose();
      state = null;
    },
  };
};
