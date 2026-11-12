import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  computePointer,
  createPointerEvents,
  findEventObject,
  normalizeEventName,
} from "./events.ts";
import type { PointerEventState, ThreeEvent } from "./events.ts";

const makeState = (): {
  state: PointerEventState;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
} => {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () =>
    ({ height: 600, left: 0, top: 0, width: 800 }) as DOMRect;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  const state: PointerEventState = {
    camera,
    gl: { domElement: canvas },
    interactive: [],
    scene,
    size: { height: 600, left: 0, top: 0, width: 800 },
  };
  return { camera, canvas, scene, state };
};

const withHandler = (object: THREE.Object3D, name: string): void => {
  (object as unknown as { handlers: Map<string, unknown> }).handlers =
    new Map();
  void name;
};

describe("events", () => {
  test("normalizeEventName maps doubleclick to dblclick", () => {
    expect(normalizeEventName("doubleclick")).toBe("dblclick");
    expect(normalizeEventName("click")).toBe("click");
    expect(normalizeEventName("pointermove")).toBe("pointermove");
  });

  test("computePointer centers on the canvas middle", () => {
    const { state } = makeState();
    const ndc = computePointer(400, 300, state);
    expect(ndc.x).toBeCloseTo(0);
    expect(ndc.y).toBeCloseTo(0);
  });

  test("findEventObject ascends to the handled ancestor", () => {
    const group = new THREE.Group();
    withHandler(group, "click");
    (group as unknown as { handlers: Map<string, unknown> }).handlers.set(
      "click",
      () => {},
    );
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    group.add(child);
    expect(findEventObject(child, "click")).toBe(group);
    expect(findEventObject(child, "wheel")).toBeUndefined();
  });

  test("click dispatches to the intersected object", () => {
    const { canvas, scene, state } = makeState();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    const seen: ThreeEvent[] = [];
    (mesh as unknown as { handlers: Map<string, (e: ThreeEvent) => void> })
      .handlers = new Map([["click", (event) => void seen.push(event)]]);
    scene.add(mesh);
    state.interactive.push(mesh);
    const manager = createPointerEvents(state);
    manager.connect?.(canvas);
    canvas.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 400, clientY: 300 }),
    );
    expect(seen.length).toBe(1);
    expect(seen[0]?.eventObject).toBe(mesh);
    expect(seen[0]?.intersections.length).toBeGreaterThan(0);
    manager.disconnect?.();
    expect(manager.connected).toBe(false);
  });

  test("click on empty space calls onPointerMissed", () => {
    const { canvas, scene, state } = makeState();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    scene.add(mesh);
    state.interactive.push(mesh);
    let missed = 0;
    state.onPointerMissed = () => {
      missed += 1;
    };
    const manager = createPointerEvents(state);
    manager.connect?.(canvas);
    // Far corner: the unit box at the origin does not cover it.
    canvas.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 4, clientY: 4 }),
    );
    expect(missed).toBe(1);
    manager.disconnect?.();
  });

  test("prunes objects removed from the scene", () => {
    const { canvas, scene, state } = makeState();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    const seen: ThreeEvent[] = [];
    (mesh as unknown as { handlers: Map<string, (e: ThreeEvent) => void> })
      .handlers = new Map([["click", (event) => void seen.push(event)]]);
    scene.add(mesh);
    scene.remove(mesh);
    state.interactive.push(mesh);
    const manager = createPointerEvents(state);
    manager.connect?.(canvas);
    canvas.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 400, clientY: 300 }),
    );
    expect(seen.length).toBe(0);
    expect(state.interactive.length).toBe(0);
    manager.disconnect?.();
  });
});
