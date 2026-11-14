import { describe, expect, test } from "bun:test";
import { Container, PlaneGeometry as PixiPlaneGeometry, Texture } from "pixi.js";
import { Container3D, DirectionalLight, Mesh3D, Model3D, View3D } from "@pixi/3d";

import "./pixi-types.ts";
import { extend, resolveConstructor } from "./catalogue.ts";
import {
  adoptStage,
  bindPixiEvents,
  createPixiElement,
  createPixiRenderer,
  resolveTarget,
  setPixiProp,
} from "./reconciler-pixi.ts";
import { disposeObject } from "./dispose.ts";

describe("pixi-3d catalogue", () => {
  test("3D tags resolve to @pixi/3d constructors", () => {
    expect(resolveConstructor("view3D")).toBe(View3D);
    expect(resolveConstructor("container3D")).toBe(Container3D);
    expect(resolveConstructor("model3D")).toBe(Model3D);
    expect(resolveConstructor("mesh3D")).toBe(Mesh3D);
    expect(resolveConstructor("directionalLight")).toBe(DirectionalLight);
    expect(resolveConstructor("pixiView3D")).toBe(View3D);
  });

  test("2D names keep their pixi.js constructors on collision", () => {
    // Both barrels export PlaneGeometry; the 2D one wins so existing
    // 2D scenes keep working — reach the 3D plane via extend().
    expect(resolveConstructor("planeGeometry")).toBe(PixiPlaneGeometry);
  });
});

describe("pixi-3d reconciler", () => {
  test("View3D adopts in place and 3D children land in view.root", async () => {
    const stage = new Container();
    const renderer = createPixiRenderer();
    const handle = renderer.mount(adoptStage(stage) as never, () => (
      <>
        <view3D>
          <mesh3D position={[1, 2, 3]} />
        </view3D>
        <sprite texture={Texture.EMPTY} />
      </>
    ));
    await handle.ready;
    const view = stage.children[0] as unknown as View3D;
    expect(view).toBeInstanceOf(View3D);
    // The 3D child mounts under the scene root (next to the view's
    // default camera) …
    const meshes = view.root.children.filter((c) => c instanceof Mesh3D);
    expect(meshes.length).toBe(1);
    const mesh = meshes[0] as Mesh3D;
    expect([mesh.position.x, mesh.position.y, mesh.position.z]).toEqual([1, 2, 3]);
    // … while 2D overlays are siblings after the view (the docs' pattern:
    // later display-list siblings draw over the scene).
    expect(stage.children.length).toBe(2);
    handle.unmount();
    expect(view.root.children.filter((c) => c instanceof Mesh3D)).toEqual([]);
  });

  test("2D children under a view throw a helpful error", () => {
    const view = createPixiElement("view3D");
    const sprite = createPixiElement("sprite");
    // ilha paints render errors through an error view, so the contract
    // is pinned at the placement boundary instead of through a mount.
    expect(() => view.append(sprite)).toThrow(/only its scene/);
  });

  test("Container3D subtrees adopt in place and dispose cascades", () => {
    const view = createPixiElement("view3D");
    const group = createPixiElement("container3D");
    const mesh = createPixiElement("mesh3D");
    expect((group as unknown as { pixiObject?: unknown }).pixiObject).toBeUndefined();
    view.append(group);
    group.append(mesh);
    const scene = (view as unknown as { root: Container3D }).root;
    expect(scene.children).toContain(resolveTarget(group) as unknown as Container3D);
    expect(resolveTarget(mesh).parent).toBe(resolveTarget(group));
    disposeObject(view);
    expect(scene.children.length).toBe(0);
  });

  test("geometry and material attach by name", () => {
    const mesh = createPixiElement("mesh3D");
    const geo = createPixiElement("cubeGeometry");
    const mat = createPixiElement("material3D");
    setPixiProp(geo, "attach", "geometry");
    setPixiProp(mat, "attach", "material");
    mesh.append(geo, mat);
    const target = resolveTarget(mesh) as unknown as {
      geometry: unknown;
      material: unknown;
    };
    expect(target.geometry).toBe(resolveTarget(geo));
    expect(target.material).toBe(resolveTarget(mat));
  });

  test("3D nodes take pointer events with static event mode", () => {
    const mesh = createPixiElement("mesh3D");
    let tapped = 0;
    bindPixiEvents(mesh, { onPointerTap: () => void (tapped += 1) });
    const record = resolveTarget(mesh) as unknown as Record<string, unknown>;
    expect(typeof record["onpointertap"]).toBe("function");
    expect(record["eventMode"]).toBe("static");
  });

  test("position and scale span z", () => {
    const mesh = createPixiElement("mesh3D");
    setPixiProp(mesh, "position", [1, 2, 3]);
    setPixiProp(mesh, "position-z", 4);
    const target = resolveTarget(mesh) as unknown as {
      position: { x: number; y: number; z: number };
      scale: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number };
    };
    expect([target.position.x, target.position.y, target.position.z]).toEqual([1, 2, 4]);
    setPixiProp(mesh, "scale", 2);
    expect([target.scale.x, target.scale.y, target.scale.z]).toEqual([2, 2, 2]);
    setPixiProp(mesh, "rotation", [0.4, 0.2, 0.1]);
    expect([target.rotation.x, target.rotation.y, target.rotation.z]).toEqual([0.4, 0.2, 0.1]);
  });

  test("args on initial mount construct in place", () => {
    class NeedsOpts extends Container {
      marker: string;
      constructor(opts?: { marker?: string }) {
        super();
        if (opts === undefined) {
          throw new Error("needs opts");
        }
        this.marker = opts.marker ?? "?";
      }
    }
    extend({ NeedsOpts: NeedsOpts as never });
    const el = createPixiElement("needsOpts");
    setPixiProp(el, "args", [{ marker: "real" }]);
    // The holder mounted later must resolve to the constructed instance.
    expect((resolveTarget(el) as unknown as { marker?: string }).marker).toBe("real");
    const parent = createPixiElement("container");
    (parent as unknown as Container).addChild(el as never);
    expect((parent as unknown as Container).children[0]).toBe(el as never);
  });
});
