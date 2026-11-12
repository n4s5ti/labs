import { describe, expect, test } from "bun:test";
import { Application, Container } from "pixi.js";

import { atom, mount } from "ilha";
import type { View } from "ilha";

import "./pixi-types.ts";
import type { RootState } from "./atoms.ts";
import { bootRoot, Canvas, createRoot } from "./canvas.tsx";
import { useApplication, useFrame, useTick } from "./hooks.ts";

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 10));
};

interface StubTicker {
  listeners: Array<(ticker: unknown) => void>;
  started: boolean;
  add: (fn: (ticker: unknown) => void) => void;
  remove: (fn: (ticker: unknown) => void) => void;
  start: () => void;
  stop: () => void;
}

const makeStubApp = (): {
  app: Application;
  ticker: StubTicker;
  stage: Container;
  destroyed: { calls: number };
  rendered: { calls: number };
} => {
  const ticker: StubTicker = {
    listeners: [],
    started: false,
    add: (fn) => {
      ticker.listeners.push(fn);
    },
    remove: (fn) => {
      ticker.listeners = ticker.listeners.filter((entry) => entry !== fn);
    },
    start: () => {
      ticker.started = true;
    },
    stop: () => {
      ticker.started = false;
    },
  };
  const stage = new Container();
  const destroyed = { calls: 0 };
  const rendered = { calls: 0 };
  // A real Application instance (sync constructor is headless-safe;
  // only `init` needs GL) so the `instanceof` invariant holds.
  const app = Object.assign(new Application(), {
    init: async (): Promise<void> => {},
    render: (): void => {
      rendered.calls += 1;
    },
    renderer: {
      resolution: 1,
      resize: (): void => {},
    },
    stage,
    ticker,
  });
  (
    app as unknown as { destroy: (a?: unknown, b?: unknown) => void }
  ).destroy = (): void => {
    destroyed.calls += 1;
  };
  return {
    app: app as unknown as Application,
    destroyed,
    rendered,
    stage,
    ticker,
  };
};

describe("canvas", () => {
  test("boots, mounts hooks and disposes", async () => {
    const stub = makeStubApp();
    const calls = { app: false, frame: 0, tick: 0 };
    const Probe = (): View => {
      const { app, isInitialised } = useApplication();
      calls.app = isInitialised && app === stub.app;
      useTick(() => {
        calls.tick += 1;
      });
      useFrame(() => {
        calls.frame += 1;
      });
      return <container />;
    };
    const canvas = document.createElement("canvas");
    const state = await bootRoot(
      canvas,
      { app: () => stub.app, frameloop: "always" },
      <Probe />,
    );
    // Component evaluation commits async (holes mount first).
    await flush();
    expect(state.status).toBe("open");
    expect(state.app).toBe(stub.app);
    expect(state.stage).toBe(stub.stage);
    expect(stub.stage.children.length).toBe(1);
    expect(calls.app).toBe(true);
    expect(state.loop.subscribers.length).toBe(1);
    expect(stub.ticker.listeners.length).toBe(2);

    // The single ticker driver advances the loop: the frame subscriber
    // runs and the render callback fires exactly once per tick.
    const advance = stub.ticker.listeners[0];
    advance({ lastTime: 100 });
    advance({ lastTime: 116 });
    expect(calls.frame).toBe(2);
    expect(stub.rendered.calls).toBe(2);

    // useTick wired through ticker.add; invoke it directly.
    const tickListener = stub.ticker.listeners[1];
    tickListener({});
    expect(calls.tick).toBe(1);

    // Demand mode stops the ticker and steps once per invalidation.
    state.setFrameloop("demand");
    expect(stub.ticker.started).toBe(false);
    const before = stub.rendered.calls;
    state.invalidate();
    expect(stub.rendered.calls).toBe(before + 1);

    state.dispose();
    expect(state.status).toBe("disposed");
    expect(stub.stage.children.length).toBe(0);
    // Factory-provided apps are not destroyed by the root.
    expect(stub.destroyed.calls).toBe(0);
    state.dispose();
    expect(state.status).toBe("disposed");
  });

  test("ambient repaint while boot is in flight keeps the root alive", async () => {
    // Hold `await app.init()` open so a repaint lands mid-boot, mirroring
    // the suspense commit that used to abandon the root (white canvas).
    let resolveInit!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveInit = resolve;
    });
    const stub = makeStubApp();
    (stub.app as unknown as { init: () => Promise<void> }).init =
      async (): Promise<void> => {
        await gate;
      };
    let n = 0;
    interface NumberAtom {
      (): number;
      set: (value: number) => void;
    }
    let bump!: NumberAtom;
    const seen: { current: RootState | null } = { current: null };
    const App = (): View => {
      bump ??= atom(0, { snapshot: false }) as unknown as NumberAtom;
      return (
        <>
          <Canvas
            app={() => stub.app}
            onCreated={(rootState) => {
              seen.current = rootState;
            }}
          >
            <container />
          </Canvas>
          <span>{bump()}</span>
        </>
      );
    };
    const host = document.createElement("div");
    document.body.append(host);
    mount(host, App);
    await flush();
    // Repaint the tree while the boot is still pending.
    n += 1;
    bump.set(n);
    await flush();
    resolveInit();
    await flush();
    await flush();
    expect(seen.current?.status).toBe("open");
    expect(stub.stage.children.length).toBe(1);
    seen.current?.dispose();
    expect(seen.current?.status).toBe("disposed");
    host.remove();
  });

  test("createRoot guards live canvases", async () => {
    const stub = makeStubApp();
    const canvas = document.createElement("canvas");
    const root = createRoot(canvas, { app: () => stub.app });
    root.render(<container />);
    await flush();
    expect(() => createRoot(canvas)).toThrow(
      "Call unmount() first",
    );
    root.unmount();
    const second = createRoot(canvas, { app: () => stub.app });
    second.render(<container />);
    await flush();
    second.unmount();
  });
});
