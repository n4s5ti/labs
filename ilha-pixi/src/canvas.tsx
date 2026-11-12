import { Application, UPDATE_PRIORITY } from "pixi.js";
import type { Ticker } from "pixi.js";

import { atom, h } from "ilha";
import type { Component, View } from "ilha";
import { getFiber } from "ilha/renderer";

import {
  registerRootState,
  RootContext,
  unregisterRootState,
} from "./atoms.ts";
import type { RootSize, RootState } from "./atoms.ts";
import type { Frameloop } from "./loop.ts";
import { createLoop } from "./loop.ts";
import type { PixiHostObject } from "./reconciler-pixi.ts";
import { adoptStage } from "./reconciler-pixi.ts";
import { createPixiRenderer } from "./reconciler-pixi.ts";
import { disposeObject } from "./dispose.ts";

/** Props for `<Canvas>` (pixi `ApplicationOptions` essentials, DOM shell). */
export interface CanvasProps {
  children?: View;
  /**
   * Bring your own application: an instance, or a factory receiving the
   * canvas (handy for tests, which inject a headless stub). Otherwise a
   * fresh `Application` is created and destroyed with the root.
   */
  app?:
    | Application
    | ((canvas: HTMLCanvasElement) => Application | Promise<Application>);
  /** Scene background fill (pixi `background` option). */
  background?: string | number;
  antialias?: boolean;
  /** Renderer preference (`webgl` default; `webgpu` where supported). */
  preference?: "webgl" | "webgpu" | "canvas";
  frameloop?: Frameloop;
  dpr?: number | [min: number, max: number];
  resize?: false | { debounce?: number };
  onCreated?: (state: RootState) => void;
  fallback?: View;
  style?: Record<string, string | number>;
}

/** Mutable build-up of the public `RootState`. */
interface MutableState extends Omit<RootState, "status"> {
  status: RootState["status"];
}

const clampDpr = (
  target: number,
  range: number | [min: number, max: number],
): number => {
  const max = typeof window === "undefined" ? 2 : window.devicePixelRatio || 1;
  if (typeof range === "number") {
    return Math.min(target, Math.min(range, max));
  }
  return Math.min(Math.max(target, range[0]), Math.min(range[1], max));
};

const resolveApp = async (
  canvas: HTMLCanvasElement,
  appProp: CanvasProps["app"],
): Promise<{ app: Application; ownsApp: boolean }> => {
  if (typeof appProp === "function") {
    return { app: await appProp(canvas), ownsApp: false };
  }
  if (appProp instanceof Application) {
    return { app: appProp, ownsApp: false };
  }
  return { app: new Application(), ownsApp: true };
};

/**
 * Boot a root state on a live canvas; the inverse is `state.dispose()`.
 * Async because pixi.js v8 requires `await app.init(...)`.
 */
export const bootRoot = async (
  canvas: HTMLCanvasElement,
  props: CanvasProps,
  children: View,
): Promise<RootState> => {
  const {
    antialias = true,
    app: appProp,
    background,
    dpr: dprProp = [1, 2],
    frameloop = "always",
    onCreated,
    preference,
    resize,
  } = props;

  const parent = canvas.parentElement;
  const size: RootSize = {
    height: parent?.clientHeight || 720,
    left: 0,
    top: 0,
    width: parent?.clientWidth || 1280,
  };

  const { app, ownsApp } = await resolveApp(canvas, appProp);
  await app.init({
    antialias,
    autoStart: false,
    background,
    canvas,
    preference,
  });

  const state = {
    app,
    dpr: clampDpr(
      typeof dprProp === "number" ? dprProp : dprProp[1],
      dprProp,
    ),
    frameloop,
    size,
    stage: app.stage,
    status: "open",
    ticker: app.ticker,
    viewport: { factor: 1, height: size.height, width: size.width },
  } as unknown as MutableState as RootState;
  const mutable = state as unknown as MutableState;

  // Single driver: the pixi ticker advances the frameloop state machine at
  // high priority, so `useFrame` subscribers run before the automatic
  // `app.render` (added by the ticker plugin at LOW priority). A
  // positive-priority subscriber takes over rendering, like R3F.
  const loop = createLoop(() => {
    app.render();
  });
  mutable.loop = loop;
  const advanceListener = (ticker: Ticker): void => {
    loop.advance(ticker.lastTime, false);
  };
  app.ticker.add(advanceListener, undefined, UPDATE_PRIORITY.HIGH);

  const applySize = (): void => {
    app.renderer.resize(mutable.size.width, mutable.size.height);
    mutable.viewport = {
      factor: 1,
      height: mutable.size.height,
      width: mutable.size.width,
    };
    mutable.invalidate();
  };

  const setSize = (width: number, height: number): void => {
    mutable.size = { height, left: 0, top: 0, width };
    applySize();
  };
  mutable.setSize = setSize;

  mutable.setDpr = (next: number): void => {
    mutable.dpr = clampDpr(next, dprProp);
    app.renderer.resolution = mutable.dpr;
    mutable.invalidate();
  };

  // Frameloop enforcement is the ticker's start/stop; the loop internals
  // stay in `always` so exactly one driver advances per tick. `demand`
  // stops the ticker and steps once per invalidation.
  mutable.setFrameloop = (mode: Frameloop): void => {
    mutable.frameloop = mode;
    if (mode === "never" || mode === "demand") {
      app.ticker.stop();
    } else {
      app.ticker.start();
    }
  };

  mutable.invalidate = (): void => {
    if (mutable.frameloop === "demand") {
      loop.advance(
        typeof performance === "undefined" ? 0 : performance.now(),
        true,
      );
      return;
    }
    loop.invalidate();
  };
  mutable.advance = (timestamp: number, manual = true): void => {
    loop.advance(timestamp, manual);
  };

  app.renderer.resolution = mutable.dpr;
  applySize();
  mutable.setFrameloop(frameloop);
  if (frameloop === "always") {
    app.ticker.start();
  }

  const host = adoptStage(app.stage);
  const pixiRenderer = createPixiRenderer();
  const mountComponent: Component = () => (
    <RootContext.Provider value={state}>{children}</RootContext.Provider>
  );
  const handle = pixiRenderer.mount(host as never, mountComponent, {
    onRuntime: (runtime) => {
      registerRootState(runtime, state);
    },
  });

  let observed: ResizeObserver | null = null;
  if (resize !== false && typeof ResizeObserver !== "undefined") {
    let timer = 0;
    observed = new ResizeObserver(() => {
      const target = canvas.parentElement ?? canvas;
      const width = target.clientWidth || size.width;
      const height = target.clientHeight || size.height;
      if (typeof (props.resize as { debounce?: number } | undefined)?.debounce === "number") {
        window.clearTimeout(timer);
        timer = window.setTimeout(
          () => setSize(width, height),
          (props.resize as { debounce?: number }).debounce,
        );
      } else {
        setSize(width, height);
      }
    });
    observed.observe(canvas.parentElement ?? canvas);
  }

  mutable.dispose = (): void => {
    if (mutable.status !== "open") {
      return;
    }
    mutable.status = "closing";
    observed?.disconnect();
    handle.unmount();
    unregisterRootState(handle.runtime);
    app.ticker.remove(advanceListener);
    loop.stop();
    for (const child of [...app.stage.children]) {
      app.stage.removeChild(child);
      if (
        (child as PixiHostObject).userData?.["ilhaDispose"] !== false
      ) {
        disposeObject(child);
      }
    }
    if (ownsApp) {
      void app.destroy();
    }
    mutable.status = "disposed";
  };

  onCreated?.(state);
  return state;
};

/**
 * Declarative root. Mounts the pixi tree when the `<canvas>` ref fires;
 * the 2D `children` render into the pixi stage, not the DOM. The
 * application boots asynchronously, so `fallback` paints until the first
 * stage commit lands.
 */
export const Canvas = (props: CanvasProps): View => {
  const { children, fallback, style } = props;
  const fiber = getFiber();
  const failed = atom<string | null>(null, { snapshot: false });
  let state: RootState | null = null;
  let cancelled = false;
  const boot = (canvas: HTMLCanvasElement | null): void => {
    if (canvas === null) {
      return;
    }
    void bootRoot(canvas, props, children).then(
      (root) => {
        if (cancelled) {
          root.dispose();
          return;
        }
        state = root;
      },
      (error: unknown) => {
        failed.set(error instanceof Error ? error.message : String(error));
      },
    );
  };
  // The external root has no child fiber for ilha to mark reached, so a
  // kept hole would be closed by any repaint of this fiber — including
  // ambient ones before boot's refs even flush. Re-arm while the fiber
  // is open (`closeFiber` sets `closed` before releasing holes, so a
  // real unmount always takes the teardown path). Only then abandon a
  // boot in flight or dispose a live root.
  const rootHole = {
    dispose: () => {
      if (!fiber.closed) {
        fiber.holes.push(rootHole);
        return;
      }
      cancelled = true;
      state?.dispose();
    },
    keep: true,
  };
  fiber.holes.push(rootHole);
  const error = failed();
  return h(
    "div",
    {
      style:
        "position:relative;width:100%;height:100%;overflow:hidden;" +
        (style !== undefined ? serializeStyle(style) : ""),
    },
    h("canvas", {
      ref: boot as never,
      style: "display:block;width:100%;height:100%;",
    }),
    error === null
      ? h("slot", {})
      : h(
          "div",
          {
            style:
              "position:absolute;inset:0;display:flex;align-items:center;" +
              "justify-content:center;",
          },
          fallback ?? `WebGL failed: ${error}`,
        ),
  );
};

const serializeStyle = (style: Record<string, string | number>): string =>
  Object.entries(style)
    .map(([key, value]) => `${key}:${String(value)};`)
    .join("");

const liveRoots = new WeakMap<HTMLCanvasElement, RootState>();

/** Imperative root (R3F `createRoot` parity, async boot). */
export interface ReconcilerRoot {
  render: (children: View) => void;
  unmount: () => void;
  configure: (opts: Partial<Pick<RootState, "dpr" | "frameloop">>) => void;
}

export const createRoot = (
  canvas: HTMLCanvasElement,
  defaults: CanvasProps = {},
): ReconcilerRoot => {
  const existing = liveRoots.get(canvas);
  if (existing !== undefined && existing.status === "open") {
    throw new Error(
      "Canvas already has a reconciler root. Call unmount() first.",
    );
  }
  let state: RootState | null = null;
  let cancelled = false;
  return {
    configure: (opts) => {
      if (opts.dpr !== undefined) {
        state?.setDpr(opts.dpr);
      }
      if (opts.frameloop !== undefined) {
        state?.setFrameloop(opts.frameloop);
      }
    },
    render: (children: View) => {
      if (state !== null && state.status === "open") {
        state.dispose();
      }
      state = null;
      void bootRoot(canvas, { ...defaults }, children).then((root) => {
        if (cancelled) {
          root.dispose();
          return;
        }
        state = root;
        liveRoots.set(canvas, root);
      });
    },
    unmount: () => {
      cancelled = true;
      state?.dispose();
      state = null;
      liveRoots.delete(canvas);
    },
  };
};
