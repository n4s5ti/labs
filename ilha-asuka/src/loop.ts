// Demand-by-default render loop for the asuka-protocol host.
//
// Same subscriber/effect state machine as the pixi bindings (`always` |
// `demand` | `never`, priority-ordered subscribers, take-over rendering),
// but the default is `demand`: asuka renders only on change, so `invalidate`
// steps the loop once synchronously instead of arming a ticker. `always`
// drives via `requestAnimationFrame`; `never` only advances manually.
export type Frameloop = "always" | "demand" | "never";

/** A frame subscriber: R3F `useFrame` parity. */
export interface FrameSubscription {
  /** Stable subscriber identity for unsubscribe. */
  readonly ref: object;
  /** Lower priority runs first; render passes use positive priority. */
  priority: number;
  /** Called with (state, delta). Return value is ignored. */
  callback: (state: FrameState, delta: number) => void;
}

/** Minimal frame state handed to subscribers. */
export interface FrameState {
  /** Seconds since the loop started. */
  clock: number;
  /** Seconds since the previous frame. */
  delta: number;
  /** True while a manual `advance` drives the loop. */
  manual: boolean;
}

/** Render effect registered via `addEffect` (runs before subscribers). */
export type RenderEffect = (state: FrameState) => void;

/** Create an isolated render loop (one per asuka root). */
export const createLoop = (
  render: (state: FrameState, delta: number) => void,
): RenderLoop => {
  const subscribers: FrameSubscription[] = [];
  const effects: RenderEffect[] = [];
  const afterEffects: RenderEffect[] = [];
  const tails: RenderEffect[] = [];
  let frameloop: Frameloop = "demand";
  let invalidated = true;
  let running = false;
  let raf = 0;
  let start = 0;
  let last = 0;

  const loop: RenderLoop = {
    get frameloop() {
      return frameloop;
    },
    subscribers,
    advance(timestamp: number, manual = true): void {
      // Explicit steps always run; the automatic tick obeys the frameloop.
      if (!manual && frameloop === "never") {
        return;
      }
      if (!manual && frameloop === "demand" && !invalidated) {
        return;
      }
      if (start === 0) {
        start = timestamp;
        last = timestamp;
      }
      const clock = (timestamp - start) / 1000;
      const delta = Math.min((timestamp - last) / 1000, 0.1);
      last = timestamp;
      const state: FrameState = { clock, delta, manual };
      for (const effect of effects) {
        effect(state);
      }
      const ordered = [...subscribers].sort((a, b) => a.priority - b.priority);
      for (const subscription of ordered) {
        subscription.callback(state, delta);
      }
      const takeOver = ordered.some((subscription) => subscription.priority > 0);
      if (!takeOver) {
        render(state, delta);
      }
      for (const effect of afterEffects) {
        effect(state);
      }
      for (const effect of tails) {
        effect(state);
      }
      invalidated = false;
    },
    invalidate(): void {
      invalidated = true;
      if (frameloop === "demand") {
        // Demand mode steps once per invalidation — no ticker involved.
        loop.advance(
          typeof performance === "undefined" ? 0 : performance.now(),
          true,
        );
      } else if (frameloop === "always" && !running) {
        loop.start();
      }
    },
    setFrameloop(mode: Frameloop): void {
      if (mode === "demand") {
        invalidated = false;
      }
      frameloop = mode;
      if (mode === "never") {
        loop.stop();
      } else if (mode === "always") {
        loop.start();
      }
    },
    subscribe(subscription: FrameSubscription): () => void {
      subscribers.push(subscription);
      return () => {
        const index = subscribers.indexOf(subscription);
        if (index >= 0) {
          subscribers.splice(index, 1);
        }
      };
    },
    addEffect(effect: RenderEffect): () => void {
      effects.push(effect);
      return () => {
        const index = effects.indexOf(effect);
        if (index >= 0) {
          effects.splice(index, 1);
        }
      };
    },
    addAfterEffect(effect: RenderEffect): () => void {
      afterEffects.push(effect);
      return () => {
        const index = afterEffects.indexOf(effect);
        if (index >= 0) {
          afterEffects.splice(index, 1);
        }
      };
    },
    addTail(effect: RenderEffect): () => void {
      tails.push(effect);
      return () => {
        const index = tails.indexOf(effect);
        if (index >= 0) {
          tails.splice(index, 1);
        }
      };
    },
    start(): void {
      if (
        running ||
        frameloop === "never" ||
        typeof requestAnimationFrame === "undefined"
      ) {
        return;
      }
      running = true;
      const tick = (timestamp: number): void => {
        if (!running) {
          return;
        }
        if (frameloop === "always" || invalidated) {
          loop.advance(timestamp, false);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    },
    stop(): void {
      running = false;
      if (typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(raf);
      }
    },
  };
  return loop;
};

/** Render loop handle owned by one asuka root. */
export interface RenderLoop {
  readonly frameloop: Frameloop;
  readonly subscribers: FrameSubscription[];
  advance: (timestamp: number, manual?: boolean) => void;
  invalidate: () => void;
  setFrameloop: (mode: Frameloop) => void;
  subscribe: (subscription: FrameSubscription) => () => void;
  addEffect: (effect: RenderEffect) => () => void;
  addAfterEffect: (effect: RenderEffect) => () => void;
  addTail: (effect: RenderEffect) => () => void;
  start: () => void;
  stop: () => void;
}
