import { describe, expect, test } from "bun:test";
import { Container, Sprite } from "pixi.js";

import { disposeObject, markNoDispose } from "./dispose.ts";

describe("dispose", () => {
  test("destroys the subtree with children:true", () => {
    const stage = new Container();
    const child = new Container();
    const grandchild = new Sprite();
    child.addChild(grandchild);
    stage.addChild(child);
    disposeObject(stage);
    expect(stage.destroyed).toBe(true);
    expect(child.destroyed).toBe(true);
    expect(grandchild.destroyed).toBe(true);
  });

  test("shared textures survive by default, destroy on request", () => {
    const sprite = new Sprite();
    const texture = sprite.texture;
    let textureDestroyed = 0;
    texture.destroy = () => {
      textureDestroyed += 1;
    };
    disposeObject(sprite);
    expect(textureDestroyed).toBe(0);
    const sprite2 = new Sprite();
    const texture2 = sprite2.texture;
    let texture2Destroyed = 0;
    texture2.destroy = () => {
      texture2Destroyed += 1;
    };
    disposeObject(sprite2, { texture: true });
    expect(texture2Destroyed).toBe(1);
  });

  test("dispose=null opts out via markNoDispose", () => {
    const keeper = new Container();
    markNoDispose(keeper);
    const stage = new Container();
    stage.addChild(keeper);
    disposeObject(stage);
    expect(keeper.destroyed).toBe(false);
  });

  test("double dispose is a no-op", () => {
    const stage = new Container();
    disposeObject(stage);
    expect(() => disposeObject(stage)).not.toThrow();
  });
});
