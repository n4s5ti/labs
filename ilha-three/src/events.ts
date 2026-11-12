import * as THREE from "three";

import type { Frameloop } from "./loop.ts";

/** Pointer event delivered to three handlers (R3F `ThreeEvent` parity). */
export interface ThreeEvent {
  /** Nearest ancestor (or self) carrying a handler for this event. */
  eventObject: THREE.Object3D;
  /** All intersections, nearest first. */
  intersections: THREE.Intersection[];
  /** Ray distance from the camera, in world units. */
  distance: number;
  /** Unprojected pointer position on the camera plane. */
  unprojectedPoint: THREE.Vector3;
  /** Pointer in normalized device coordinates. */
  pointer: THREE.Vector2;
  /** Seconds since the previous frame. */
  delta: number;
  ray: THREE.Raycaster;
  camera: THREE.Camera;
  nativeEvent: PointerEvent | WheelEvent;
  stopped: boolean;
  stopPropagation: () => void;
}

/** DOM event names the manager dispatches. */
export type ThreeDomEvent =
  | "click"
  | "contextmenu"
  | "dblclick"
  | "pointerup"
  | "pointerdown"
  | "pointerover"
  | "pointerout"
  | "pointerenter"
  | "pointerleave"
  | "pointermove"
  | "pointercancel"
  | "wheel"
  | "lostpointercapture";

/** R3F `onDoubleClick` maps to the DOM `dblclick` event. */
const EVENT_ALIASES: Readonly<Record<string, ThreeDomEvent>> = {
  doubleclick: "dblclick",
};

export const normalizeEventName = (name: string): ThreeDomEvent =>
  (EVENT_ALIASES[name] ?? name) as ThreeDomEvent;

/** Structural slice of root state the event manager needs. */
export interface PointerEventState {
  gl: { domElement: HTMLCanvasElement };
  scene: THREE.Scene;
  camera: THREE.Camera;
  interactive: THREE.Object3D[];
  size: { width: number; height: number; top: number; left: number };
  onPointerMissed?: (event: PointerEvent | WheelEvent) => void;
  setFrameloop?: (mode: Frameloop) => void;
  invalidate?: () => void;
  compute?: (
    event: PointerEvent | WheelEvent,
    state: PointerEventState,
  ) => void;
  filter?: (
    intersections: THREE.Intersection[],
    state: PointerEventState,
  ) => THREE.Intersection[];
}

/** R3F `EventManager` parity: connect/disconnect/update + flags. */
export interface EventManager {
  enabled: boolean;
  priority: number;
  connected: HTMLCanvasElement | false;
  handlers: Partial<Record<ThreeDomEvent, (event: ThreeEvent) => void>>;
  compute?: (
    event: PointerEvent | WheelEvent,
    state: PointerEventState,
  ) => void;
  filter?: (
    intersections: THREE.Intersection[],
    state: PointerEventState,
  ) => THREE.Intersection[];
  connect?: (element: HTMLCanvasElement) => void;
  disconnect?: () => void;
  update?: () => void;
}

type HandlerMap = Map<string, (event: ThreeEvent) => void>;

const handlersOf = (node: THREE.Object3D): HandlerMap | undefined =>
  (node as unknown as { handlers?: HandlerMap }).handlers;

const raycaster = new THREE.Raycaster();
const scratch = new THREE.Vector2();

/** NDC pointer for a client position over the canvas. */
export const computePointer = (
  clientX: number,
  clientY: number,
  state: PointerEventState,
): THREE.Vector2 => {
  const rect = state.gl.domElement.getBoundingClientRect();
  const width = rect.width === 0 ? state.size.width : rect.width;
  const height = rect.height === 0 ? state.size.height : rect.height;
  return new THREE.Vector2(
    ((clientX - rect.left) / width) * 2 - 1,
    -(((clientY - rect.top) / height) * 2 - 1),
  );
};

/** Unprojected pointer position at mid-depth through the camera. */
export const unprojectPointer = (
  ndc: THREE.Vector2,
  camera: THREE.Camera,
): THREE.Vector3 => new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera);

const inScene = (object: THREE.Object3D, scene: THREE.Scene): boolean => {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (current === (scene as THREE.Object3D)) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

/** Nearest ancestor (or self) carrying a handler for `name`. */
export const findEventObject = (
  object: THREE.Object3D,
  name: ThreeDomEvent,
): THREE.Object3D | undefined => {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (handlersOf(current)?.has(name) === true) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
};

/**
 * DOM-level event manager with raycast dispatch. Listeners bind lowercase
 * (`click`, `pointermove`, …) per ilha convention; tree handlers use R3F
 * `onClick`/`onPointerMove` props collected by `bindEvents`.
 */
export const createPointerEvents = (
  state: PointerEventState,
): EventManager => {
  let element: HTMLCanvasElement | null = null;
  let last: PointerEvent | null = null;
  const hovered = new Map<number, THREE.Object3D>();

  const intersect = (
    event: PointerEvent | WheelEvent,
  ): THREE.Intersection[] => {
    state.scene.updateMatrixWorld();
    const ndc = computePointer(event.clientX, event.clientY, state);
    scratch.copy(ndc);
    state.compute?.(event, state);
    raycaster.setFromCamera(scratch, state.camera);
    const live = state.interactive.filter((object) =>
      inScene(object, state.scene),
    );
    state.interactive.length = 0;
    state.interactive.push(...live);
    const hits = raycaster.intersectObjects(live, true);
    return state.filter ? state.filter(hits, state) : hits;
  };

  const makeEvent = (
    eventObject: THREE.Object3D,
    name: ThreeDomEvent,
    nativeEvent: PointerEvent | WheelEvent,
    hits: THREE.Intersection[],
    hit: THREE.Intersection | undefined,
  ): { event: ThreeEvent; fire: () => void } => {
    const ndc = computePointer(
      nativeEvent.clientX,
      nativeEvent.clientY,
      state,
    );
    let stopped = false;
    const event: ThreeEvent = {
      camera: state.camera,
      delta: 0,
      distance: hit?.distance ?? 0,
      eventObject,
      intersections: hits,
      nativeEvent,
      pointer: ndc,
      ray: raycaster,
      stopPropagation: () => {
        stopped = true;
      },
      stopped: false,
      unprojectedPoint: unprojectPointer(ndc, state.camera),
    };
    return {
      event,
      fire: () => {
        handlersOf(eventObject)?.get(name)?.(event);
        if (stopped) {
          event.stopped = true;
        }
      },
    };
  };

  const dispatchHits = (
    name: ThreeDomEvent,
    nativeEvent: PointerEvent | WheelEvent,
    hits: THREE.Intersection[],
  ): void => {
    let stopped = false;
    const fired = new Set<number>();
    for (const hit of hits) {
      if (stopped) {
        break;
      }
      const eventObject = findEventObject(hit.object, name);
      if (eventObject === undefined || fired.has(eventObject.id)) {
        continue;
      }
      fired.add(eventObject.id);
      const { event, fire } = makeEvent(
        eventObject,
        name,
        nativeEvent,
        hits,
        hit,
      );
      fire();
      stopped = event.stopped;
    }
    if (hits.length === 0 && name === "click") {
      state.onPointerMissed?.(nativeEvent);
    }
    state.invalidate?.();
  };

  const dispatchTo = (
    name: ThreeDomEvent,
    eventObject: THREE.Object3D,
    nativeEvent: PointerEvent | WheelEvent,
    hits: THREE.Intersection[],
  ): void => {
    const { fire } = makeEvent(
      eventObject,
      name,
      nativeEvent,
      hits,
      undefined,
    );
    fire();
  };

  const onMove = (event: PointerEvent): void => {
    last = event;
    const hits = intersect(event);
    const seen = new Set<number>();
    for (const hit of hits) {
      const eventObject = findEventObject(hit.object, "pointermove");
      if (eventObject === undefined) {
        continue;
      }
      seen.add(eventObject.id);
      if (!hovered.has(eventObject.id)) {
        hovered.set(eventObject.id, eventObject);
        dispatchTo("pointerenter", eventObject, event, [hit]);
        dispatchTo("pointerover", eventObject, event, [hit]);
      }
    }
    for (const [id, object] of [...hovered]) {
      if (!seen.has(id)) {
        hovered.delete(id);
        dispatchTo("pointerout", object, event, []);
        dispatchTo("pointerleave", object, event, []);
      }
    }
    dispatchHits("pointermove", event, hits);
  };

  const onPointer = (
    name: ThreeDomEvent,
    event: PointerEvent | WheelEvent,
  ): void => {
    dispatchHits(name, event, intersect(event));
  };

  const onDom = (event: Event): void => {
    const name = normalizeEventName((event as { type: string }).type);
    onPointer(name, event as PointerEvent);
  };

  const onWheel = (event: WheelEvent): void => {
    onPointer("wheel", event);
  };

  const manager: EventManager = {
    connected: false,
    enabled: true,
    handlers: {},
    priority: 1,
    connect: (target: HTMLCanvasElement): void => {
      if (element !== null) {
        manager.disconnect?.();
      }
      element = target;
      manager.connected = target;
      target.addEventListener("pointermove", onMove as (event: Event) => void);
      target.addEventListener("pointerdown", onDom);
      target.addEventListener("pointerup", onDom);
      target.addEventListener("click", onDom);
      target.addEventListener("dblclick", onDom);
      target.addEventListener("contextmenu", onDom);
      target.addEventListener("pointercancel", onDom);
      target.addEventListener("wheel", onWheel, { passive: true });
    },
    disconnect: (): void => {
      if (element === null) {
        return;
      }
      element.removeEventListener(
        "pointermove",
        onMove as (event: Event) => void,
      );
      element.removeEventListener("pointerdown", onDom);
      element.removeEventListener("pointerup", onDom);
      element.removeEventListener("click", onDom);
      element.removeEventListener("dblclick", onDom);
      element.removeEventListener("contextmenu", onDom);
      element.removeEventListener("pointercancel", onDom);
      element.removeEventListener("wheel", onWheel);
      element = null;
      manager.connected = false;
      hovered.clear();
    },
    update: (): void => {
      if (last !== null) {
        onMove(last);
      }
    },
  };
  return manager;
};
