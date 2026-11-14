import * as Effect from "effect/Effect";
import { Assets, FillGradient, TextStyle, Texture } from "pixi.js";
import type {
  BlurFilter,
  Container,
  Graphics,
  Sprite,
  Ticker,
} from "pixi.js";
import type { Mesh3D, View3D } from "@pixi/3d";

import { ErrorBoundary } from "ilha";
import type { View } from "ilha";

import { useLoader, useThree, useTick } from "../../src/index.ts";

/**
 * Port of the pixi.js v8 `misc/slots` example ("PIXI MONSTER SLOTS!"),
 * built only on `ilha-pixi` bindings: `<Canvas>` owns the application,
 * ticker and resize; the machine is JSX (`attach`/filter inference,
 * dash props, `draw` callbacks); textures suspend through `useLoader`;
 * the reels scroll in `useTick` and spin on `onPointerDown`.
 */

const SYMBOL_URLS = [
  "assets/eggHead.png",
  "assets/flowerTop.png",
  "assets/helmlok.png",
  "assets/skully.png",
];

const REEL_COUNT = 5;
const SPRITES_PER_REEL = 4;
const VISIBLE_ROWS = 3;
const SYMBOL_SIZE = 150;
const REEL_WIDTH = 160;
const MACHINE_WIDTH = REEL_COUNT * REEL_WIDTH;
const MACHINE_HEIGHT = VISIBLE_ROWS * SYMBOL_SIZE;
const TOP_MARGIN = 110;
/** Extra headroom so the title clears the top cover bar. */
const MACHINE_Y = TOP_MARGIN + 80;
const SPIN_TIME = 2500;
const SPIN_STAGGER = 600;

interface ReelState {
  node: Container | null;
  distance: number;
  previous: number;
}

interface TweenState {
  reel: number;
  start: number;
  target: number;
  time: number;
  elapsed: number;
}

const reels: ReelState[] = Array.from({ length: REEL_COUNT }, () => ({
  distance: 0,
  node: null,
  previous: 0,
}));
let symbolTextures: Texture[] = [];
let running = false;
let tweening: TweenState[] = [];

const randomTexture = (): Texture =>
  symbolTextures[Math.floor(Math.random() * symbolTextures.length)];

const backout = (amount: number) => (t: number): number => {
  const scaled = t - 1;
  return scaled * scaled * ((amount + 1) * scaled + amount) + 1;
};

/** Scroll reel `index` forward by `dy`, wrapping symbols with fresh art. */
const moveReel = (index: number, dy: number): void => {
  const node = reels[index].node;
  if (node === null || dy === 0) {
    return;
  }
  const span = SPRITES_PER_REEL * SYMBOL_SIZE;
  for (const child of node.children) {
    const sprite = child as Sprite;
    sprite.y += dy;
    if (sprite.y >= MACHINE_HEIGHT) {
      sprite.y -= span;
      sprite.texture = randomTexture();
    }
  }
};

/** Start a spin unless one is already running (pointerdown guard). */
const startPlay = (): void => {
  if (running || symbolTextures.length === 0) {
    return;
  }
  running = true;
  tweening = reels.map((reel, i) => {
    const extra = Math.floor(Math.random() * VISIBLE_ROWS) * SYMBOL_SIZE;
    return {
      elapsed: 0,
      reel: i,
      start: reel.distance,
      target:
        reel.distance + (8 + i * 3) * SYMBOL_SIZE + extra,
      time: SPIN_TIME + i * SPIN_STAGGER,
    };
  });
};

/** Tween runner: eases every reel toward its target with backout. */
const runTweens = (ticker: Ticker): void => {
  if (tweening.length === 0) {
    return;
  }
  const ease = backout(0.5);
  const settled: TweenState[] = [];
  for (const tween of tweening) {
    tween.elapsed += ticker.deltaMS;
    const phase = Math.min(tween.elapsed / tween.time, 1);
    const distance =
      tween.start + (tween.target - tween.start) * ease(phase);
    const reel = reels[tween.reel];
    moveReel(tween.reel, distance - reel.distance);
    reel.distance = distance;
    if (phase >= 1) {
      settled.push(tween);
    }
  }
  if (settled.length === tweening.length) {
    tweening = [];
    running = false;
  }
};

/**
 * `strengthY` (pixi ≥8.3) with fallback to the deprecated `blurY`, which
 * the current types no longer declare.
 */
const setBlurY = (filter: BlurFilter, value: number): void => {
  if ("strengthY" in filter) {
    filter.strengthY = value;
  } else {
    (filter as unknown as Record<string, number>).blurY = value;
  }
};

/** Blur pass: vertical blur follows each reel's frame delta. */
const runBlur = (): void => {
  for (const reel of reels) {
    const node = reel.node;
    if (node === null) {
      continue;
    }
    const blur = (node.filters?.[0] ?? null) as BlurFilter | null;
    if (blur !== null) {
      setBlurY(blur, (reel.distance - reel.previous) * 8);
    }
    reel.previous = reel.distance;
  }
};

const titleStyle = new TextStyle({
  align: "center",
  dropShadow: {
    alpha: 0.5,
    angle: Math.PI / 6,
    blur: 4,
    color: "#000000",
    distance: 6,
  },
  fill: new FillGradient({
    colorStops: [
      { color: "#ffffff", offset: 0 },
      { color: "#ffcc33", offset: 1 },
    ],
    end: { x: 0.5, y: 1 },
    start: { x: 0.5, y: 0 },
    type: "linear",
  }),
  fontFamily: "Arial Black, Arial, sans-serif",
  fontSize: 56,
  fontWeight: "bold",
  stroke: { color: "#4a1850", width: 6 },
  wordWrap: true,
  wordWrapWidth: MACHINE_WIDTH,
});

const buttonStyle = new TextStyle({
  align: "center",
  fill: "#ffffff",
  fontFamily: "Arial, sans-serif",
  fontSize: 28,
  fontWeight: "bold",
});

const assetsLoader = {
  loadAsync: (url: string): Promise<Texture> => Assets.load(url),
};

/**
 * The slot machine. Suspends on the four symbol PNGs, then mounts five
 * blurred reels, cover bars and a spin button — all declarative JSX.
 */
export function* Slots(): Generator<
  Effect.Effect<unknown, unknown, unknown>,
  View | undefined,
  View
> {
  const { size } = useThree();
  const textures = (yield useLoader(
    assetsLoader,
    SYMBOL_URLS,
  )) as Texture[];
  symbolTextures = textures;
  useTick(runTweens);
  useTick(runBlur);
  const machineX = Math.max((size.width - MACHINE_WIDTH) / 2, 0);
  const machineY = MACHINE_Y;
  const buttonX = (MACHINE_WIDTH - 160) / 2;
  const buttonY = MACHINE_HEIGHT + 40;
  return (
    <container x={machineX} y={machineY}>
      <pixiText
        text="PIXI MONSTER SLOTS!"
        style={titleStyle}
        x={MACHINE_WIDTH / 2}
        y={-TOP_MARGIN - 6}
        anchor={[0.5, 1]}
      />
      {reels.map((reel, i) => (
        <container
          key={i}
          x={i * REEL_WIDTH + REEL_WIDTH / 2}
          ref={(target: unknown) => {
            reel.node = target as Container;
          }}
        >
          {Array.from({ length: SPRITES_PER_REEL }, (_, j) => (
            <sprite
              key={j}
              texture={textures[(i + j) % textures.length]}
              anchor={[0.5, 0]}
              x={0}
              y={j * SYMBOL_SIZE - SYMBOL_SIZE}
            />
          ))}
          <blurFilter strength={0} />
        </container>
      ))}
      <graphics
        draw={(g: unknown) => {
          const graphics = g as Graphics;
          graphics
            .rect(0, -TOP_MARGIN, MACHINE_WIDTH, TOP_MARGIN - 20)
            .fill({ color: "#0e0e1a" });
          graphics
            .rect(0, MACHINE_HEIGHT, MACHINE_WIDTH, 200)
            .fill({ color: "#0e0e1a" });
        }}
      />
      <container
        x={buttonX}
        y={buttonY}
        eventMode="static"
        cursor="pointer"
        onPointerDown={startPlay}
      >
        <graphics
          draw={(g: unknown) => {
            const graphics = g as Graphics;
            graphics.roundRect(0, 0, 160, 60, 14).fill({ color: "#22aa44" });
          }}
        />
        <pixiText
          text="SPIN"
          style={buttonStyle}
          anchor={[0.5, 0.5]}
          x={80}
          y={30}
        />
      </container>
    </container>
  );
};

/** A slow cube behind the machine, tap it to spin it faster. */
const orbit: { mesh: Mesh3D | null; speed: number } = {
  mesh: null,
  speed: 0.4,
};

const frameCube = (target: unknown): void => {
  const view = target as View3D;
  view.camera.position.set(0, 0.5, 6);
};

/** 3D backdrop: one view, one light, one spinning cube, all declarative. */
export function OrbitBackdrop(): View {
  useTick((ticker) => {
    if (orbit.mesh !== null) {
      orbit.mesh.rotation.y += (ticker.deltaMS / 1000) * orbit.speed;
    }
  });
  return (
    <view3D autoResize onUpdate={frameCube}>
      <directionalLight position={[3, 5, 2]} intensity={3} />
      <mesh3D
        ref={(target: unknown) => {
          orbit.mesh = target as Mesh3D;
        }}
        position={[0, 0.5, 0]}
        rotation={[0.4, 0, 0]}
        onPointerTap={() => {
          orbit.speed = orbit.speed > 1 ? 0.4 : 2.5;
        }}
      >
        <cubeGeometry attach="geometry" />
        <material3D attach="material" />
      </mesh3D>
    </view3D>
  );
}

/** Scene content: the 3D backdrop and the slots behind an error boundary. */
export const Scene = (): View => (
  <ErrorBoundary fallback={() => <container />}>
    <OrbitBackdrop />
    <Slots />
  </ErrorBoundary>
);
