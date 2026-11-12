import * as THREE from "three";

import { atom, h } from "ilha";
import type { Component, View } from "ilha";
import { getFiber } from "ilha/renderer";

import {
  registerRootState,
  RootContext,
  unregisterRootState,
} from "./atoms.ts";
import type { RootSize, RootState } from "./atoms.ts";
import type { EventManager } from "./events.ts";
import { createPointerEvents } from "./events.ts";
import type { Frameloop } from "./loop.ts";
import { createLoop } from "./loop.ts";
import type { ThreeHostObject } from "./reconciler-three.ts";
import { adoptScene } from "./reconciler-three.ts";
import { createThreeRenderer } from "./reconciler-three.ts";
import { disposeObject } from "./dispose.ts";

/** Camera construction options (arrays accepted, R3F-style). */
export interface CameraOptions {
  position?: [x: number, y: number, z: number] | THREE.Vector3;
  lookAt?: [x: number, y: number, z: number] | THREE.Vector3;
  fov?: number;
  near?: number;
  far?: number;
  zoom?: number;
  manual?: THREE.Camera;
}

/** Props for `<Canvas>` (R3F `CanvasProps`/`RenderProps` parity, DOM shell). */
export interface CanvasProps {
  children?: View;
  gl?:
    | THREE.WebGLRendererParameters
    | THREE.WebGLRenderer
    | ((canvas: HTMLCanvasElement) => THREE.WebGLRenderer);
  shadows?: boolean | "basic" | "percentage" | "soft" | "variance";
  linear?: boolean;
  flat?: boolean;
  legacy?: boolean;
  orthographic?: boolean;
  frameloop?: Frameloop;
  dpr?: number | [min: number, max: number];
  performance?: { min?: number; max?: number; debounce?: number };
  raycaster?: Partial<{
    params: Partial<THREE.RaycasterParameters>;
    filter: EventManager["filter"];
    compute: EventManager["compute"];
  }>;
  scene?: Partial<THREE.Scene> & Record<string, unknown>;
  camera?: CameraOptions | THREE.Camera;
  events?: EventManager | ((state: RootState) => EventManager);
  onCreated?: (state: RootState) => void;
  onPointerMissed?: (event: PointerEvent | WheelEvent) => void;
  resize?: false | { debounce?: number };
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

const applyShadows = (
  gl: THREE.WebGLRenderer,
  shadows: CanvasProps["shadows"],
): void => {
  if (shadows === undefined || shadows === false) {
    return;
  }
  gl.shadowMap.enabled = true;
  gl.shadowMap.type =
    shadows === true || shadows === "soft"
      ? THREE.PCFSoftShadowMap
      : shadows === "basic"
        ? THREE.BasicShadowMap
        : shadows === "percentage"
          ? THREE.PCFShadowMap
          : THREE.VSMShadowMap;
};

const createRendererFor = (
  canvas: HTMLCanvasElement,
  gl: CanvasProps["gl"],
): { renderer: THREE.WebGLRenderer; ownsRenderer: boolean } => {
  if (typeof gl === "function") {
    return { ownsRenderer: true, renderer: gl(canvas) };
  }
  if (gl instanceof THREE.WebGLRenderer) {
    return { ownsRenderer: false, renderer: gl };
  }
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas,
    powerPreference: "high-performance",
    ...(gl ?? {}),
  });
  return { ownsRenderer: true, renderer };
};

const setVector = (
  target: THREE.Vector3,
  value: [number, number, number] | THREE.Vector3 | undefined,
  fallback: [number, number, number],
): void => {
  if (Array.isArray(value)) {
    target.set(value[0], value[1], value[2]);
  } else if (value instanceof THREE.Vector3) {
    target.copy(value);
  } else {
    target.set(fallback[0], fallback[1], fallback[2]);
  }
};

const applyLookAt = (
  cam: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  lookAt: CameraOptions["lookAt"],
): void => {
  if (lookAt === undefined) {
    return;
  }
  if (Array.isArray(lookAt)) {
    cam.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  } else {
    cam.lookAt(lookAt);
  }
};

const createCameraFor = (
  camera: CanvasProps["camera"],
  orthographic: boolean,
  size: RootSize,
): THREE.PerspectiveCamera | THREE.OrthographicCamera => {
  if (camera instanceof THREE.Camera) {
    return camera as
      | THREE.PerspectiveCamera
      | THREE.OrthographicCamera;
  }
  const opts = (camera ?? {}) as CameraOptions;
  if (opts.manual instanceof THREE.Camera) {
    return opts.manual as
      | THREE.PerspectiveCamera
      | THREE.OrthographicCamera;
  }
  if (orthographic) {
    const halfH = 5;
    const halfW = (halfH * size.width) / Math.max(size.height, 1);
    const cam = new THREE.OrthographicCamera(
      -halfW,
      halfW,
      halfH,
      -halfH,
      0.1,
      1000,
    );
    setVector(cam.position, opts.position, [0, 0, 5]);
    cam.zoom = opts.zoom ?? 1;
    cam.updateProjectionMatrix();
    applyLookAt(cam, opts.lookAt);
    return cam;
  }
  const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  setVector(cam.position, opts.position, [0, 0, 5]);
  for (const key of ["fov", "near", "far", "zoom"] as const) {
    if (typeof opts[key] === "number") {
      (cam as unknown as Record<string, number>)[key] = opts[key] as number;
    }
  }
  cam.updateProjectionMatrix();
  applyLookAt(cam, opts.lookAt);
  return cam;
};

const sceneRoot = (scene: THREE.Scene): ThreeHostObject =>
  adoptScene(scene);

/** Boot a root state on a live canvas; the inverse is `state.dispose()`. */
export const bootRoot = (
  canvas: HTMLCanvasElement,
  props: CanvasProps,
  children: View,
): RootState => {
  const {
    camera: cameraProp,
    dpr: dprProp = [1, 2],
    events: eventsProp,
    flat,
    frameloop = "always",
    gl: glProp,
    legacy,
    linear,
    onCreated,
    onPointerMissed,
    orthographic = false,
    performance,
    raycaster: raycasterProp,
    resize,
    scene: sceneProp,
    shadows,
  } = props;

  const parent = canvas.parentElement;
  const size: RootSize = {
    height: parent?.clientHeight || 720,
    left: 0,
    top: 0,
    width: parent?.clientWidth || 1280,
  };
  const { renderer: gl, ownsRenderer } = createRendererFor(canvas, glProp);
  applyShadows(gl, shadows);
  if (flat === true) {
    gl.toneMapping = THREE.NoToneMapping;
  }
  if (linear === true) {
    gl.outputColorSpace = THREE.LinearSRGBColorSpace;
  }
  if (
    legacy === true &&
    "useLegacyLights" in gl &&
    typeof (gl as Record<string, unknown>)["useLegacyLights"] === "boolean"
  ) {
    (gl as unknown as Record<string, boolean>)["useLegacyLights"] = true;
  }

  const scene = new THREE.Scene();
  if (sceneProp !== undefined) {
    for (const [key, value] of Object.entries(sceneProp)) {
      (scene as unknown as Record<string, unknown>)[key] = value;
    }
  }
  const camera = createCameraFor(cameraProp, orthographic, size);

  const state = {
    attached: new Map(),
    camera,
    dpr: clampDpr(
      typeof dprProp === "number" ? dprProp : dprProp[1],
      dprProp,
    ),
    events: null,
    frameloop,
    gl,
    interactive: [],
    scene,
    size,
    status: "open",
    viewport: { factor: 1, height: size.height, width: size.width },
  } as unknown as MutableState as RootState;
  const mutable = state as unknown as MutableState;

  const loop = createLoop(() => {
    gl.render(scene, camera);
  });
  mutable.loop = loop;

  const setSize = (width: number, height: number): void => {
    mutable.size = { height, left: 0, top: 0, width };
    const aspect = width / Math.max(height, 1);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    } else {
      const halfH =
        (camera.top - camera.bottom) / 2 || 5;
      camera.left = -halfH * aspect;
      camera.right = halfH * aspect;
      camera.updateProjectionMatrix();
    }
    gl.setPixelRatio(mutable.dpr);
    gl.setSize(width, height, false);
    const dist = camera.position.length() || 1;
    mutable.viewport = {
      factor: dist,
      height: height / dist,
      width: width / dist,
    };
    loop.invalidate();
  };
  mutable.setSize = setSize;

  mutable.setDpr = (next: number): void => {
    mutable.dpr = clampDpr(next, dprProp);
    gl.setPixelRatio(mutable.dpr);
    loop.invalidate();
  };

  mutable.setFrameloop = (mode: Frameloop): void => {
    mutable.frameloop = mode;
    loop.setFrameloop(mode);
  };

  mutable.invalidate = (): void => {
    loop.invalidate();
  };
  mutable.advance = (timestamp: number, manual = true): void => {
    loop.advance(timestamp, manual);
  };

  const pointerState = {
    camera,
    compute: raycasterProp?.compute,
    filter: raycasterProp?.filter,
    get interactive() {
      return mutable.interactive;
    },
    get size() {
      return mutable.size;
    },
    gl,
    invalidate: () => loop.invalidate(),
    onPointerMissed,
    scene,
    setFrameloop: (mode: Frameloop) => mutable.setFrameloop(mode),
  };
  mutable.events =
    typeof eventsProp === "function"
      ? eventsProp(state)
      : (eventsProp ?? createPointerEvents(pointerState));
  if (raycasterProp?.filter !== undefined) {
    mutable.events.filter = raycasterProp.filter;
  }
  if (raycasterProp?.compute !== undefined) {
    mutable.events.compute = raycasterProp.compute;
  }
  if (mutable.events.enabled !== false) {
    mutable.events.connect?.(canvas);
  }

  // Optional performance regression: shed pixel ratio under sustained load.
  const perfMin = performance?.min ?? mutable.dpr;
  if (
    performance !== undefined &&
    (performance.min ?? mutable.dpr) < mutable.dpr
  ) {
    let ema = 1 / 60;
    let cooldown = 0;
    loop.subscribe({
      callback: (_frame, delta) => {
        ema = ema * 0.95 + delta * 0.05;
        cooldown -= delta;
        if (ema > 1 / 25 && cooldown <= 0 && mutable.dpr > perfMin) {
          mutable.setDpr(Math.max(perfMin, mutable.dpr - 0.25));
          cooldown = (performance.debounce ?? 500) / 1000;
        }
      },
      priority: -10,
      ref: {},
    });
  }

  setSize(size.width, size.height);
  loop.setFrameloop(frameloop);
  if (frameloop === "always") {
    loop.start();
  }

  const host = sceneRoot(scene);
  const threeRenderer = createThreeRenderer();
  const mountComponent: Component = () => (
    <RootContext.Provider value={state}>{children}</RootContext.Provider>
  );
  const handle = threeRenderer.mount(host as never, mountComponent, {
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
    mutable.events?.disconnect?.();
    loop.stop();
    for (const child of [...scene.children]) {
      scene.remove(child);
      disposeObject(child);
    }
    if (ownsRenderer) {
      gl.dispose();
      gl.forceContextLoss();
    }
    mutable.status = "disposed";
  };

  onCreated?.(state);
  return state;
};

/**
 * Declarative root. Mounts the three tree when the `<canvas>` ref fires;
 * the 3D `children` render into the WebGL scene, not the DOM.
 */
export const Canvas = (props: CanvasProps): View => {
  const { children, fallback, style } = props;
  const fiber = getFiber();
  const failed = atom<string | null>(null, { snapshot: false });
  let state: RootState | null = null;
  const boot = (canvas: HTMLCanvasElement | null): void => {
    if (canvas === null) {
      return;
    }
    try {
      state = bootRoot(canvas, props, children);
    } catch (error) {
      failed.set(error instanceof Error ? error.message : String(error));
    }
  };
  fiber.holes.push({
    dispose: () => {
      state?.dispose();
    },
    keep: true,
  });
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

/** Imperative root (R3F `createRoot` parity). */
export interface ReconcilerRoot {
  render: (children: View) => void;
  unmount: () => void;
  configure: (opts: Partial<Pick<RootState, "dpr" | "frameloop">>) => void;
}

export const createRoot = (canvas: HTMLCanvasElement): ReconcilerRoot => {
  const existing = liveRoots.get(canvas);
  if (existing !== undefined && existing.status === "open") {
    throw new Error(
      "Canvas already has a reconciler root. Call unmount() first.",
    );
  }
  let state: RootState | null = null;
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
      state = bootRoot(canvas, {}, children);
      liveRoots.set(canvas, state);
    },
    unmount: () => {
      state?.dispose();
      state = null;
      liveRoots.delete(canvas);
    },
  };
};
