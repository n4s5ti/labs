// Shared demo tree: layout (column/row flexbox props) + text + image
// (cached loader) + events (button click) + loop (useFrame subscriber).
// `runDemo` paints it through the real ilha renderer into `host` and
// returns the retained tree plus observable proof for `/api/proof`.
import type { View } from "ilha";

import {
  bootRoot,
  cachedLoad,
  dispatchMygoEvent,
  elementFor,
  useFrame,
} from "../src/index.ts";
import type {
  AsyncLoader,
  MygoEventPayload,
  MygoTreeNode,
  RootState,
  SyncHost,
} from "../src/index.ts";

/** In-memory stand-in for a texture/asset fetch (bytes stay host-side). */
class DemoLoader implements AsyncLoader<string> {
  async loadAsync(url: string): Promise<string> {
    return `bytes:${url}`;
  }
}

/** Observable proof that layout/text/events/loop all ran. */
export interface DemoProof {
  backend: string;
  /** Frames the root loop rendered. */
  frames: number;
  /** Times the `useFrame` subscriber ran. */
  subscriberCalls: number;
  /** Handler invocations from the dispatched click. */
  clicks: number;
  /** Last click payload target (element handle). */
  clickTarget: number | null;
  /** Title text read back from the retained store. */
  title: string;
  /** Image bytes resolved through the cached loader. */
  image: string;
  /** Layout props read back from the retained store. */
  layout: Record<string, string>;
}

const Demo = (props: {
  image: string;
  calls: { current: number };
  clicks: { current: number };
  lastTarget: { current: number | null };
}): View => {
  useFrame(() => {
    props.calls.current += 1;
  });
  const onClick = (payload: MygoEventPayload): void => {
    props.clicks.current += 1;
    props.lastTarget.current = payload.target;
  };
  return (
    <column direction="column" gap="8" padding="16">
      <mygoText value="ilha-mygo dashboard">ilha-mygo dashboard</mygoText>
      <row direction="row" gap="4">
        <mygoText value="counter">counter</mygoText>
        <mygoButton onClick={onClick}>press</mygoButton>
      </row>
      <image src="logo.png" width="64" height="64" data-bytes={props.image} />
    </column>
  );
};

const findByKind = (
  tree: MygoTreeNode | null,
  kind: string,
): MygoTreeNode[] => {
  if (tree === null) {
    return [];
  }
  const self = tree.kind === kind ? [tree] : [];
  return [...self, ...tree.children.flatMap((child) => findByKind(child, kind))];
};

/**
 * Paint the demo into `host` and exercise every binding: five manual loop
 * frames (loop), a dispatched button click (events), then read back the
 * retained tree (layout + text + image). The root stays mounted so the
 * server keeps serving the live tree; call `state.dispose()` to release.
 */
export const runDemo = async (
  host: SyncHost,
): Promise<{ state: RootState; tree: MygoTreeNode | null; proof: DemoProof }> => {
  host.reset();
  const image = await cachedLoad(new DemoLoader(), "logo.png");
  const calls = { current: 0 };
  const clicks = { current: 0 };
  const lastTarget: { current: number | null } = { current: null };
  const state = bootRoot(
    host,
    <Demo image={image} calls={calls} clicks={clicks} lastTarget={lastTarget} />,
    { frameloop: "demand" },
  );
  await state.ready;
  // Loop: five manual frames drive the demand-mode subscriber.
  for (let t = 100; t <= 500; t += 100) {
    state.advance(t);
  }
  // Events: dispatch a click at the mounted button's live element.
  const live = host.describe(state.root.nodeId);
  const buttons = findByKind(live, "Button");
  if (buttons.length !== 1 || typeof buttons[0]?.id !== "number") {
    throw new Error("demo button did not mount exactly once");
  }
  const el = elementFor(host, buttons[0].id as number);
  if (el === undefined || !dispatchMygoEvent(el, "click")) {
    throw new Error("demo click did not reach a handler");
  }
  const tree = host.describe(state.root.nodeId);
  const columns = findByKind(tree, "Column");
  const title =
    columns[0]?.children.flatMap((child) => findByKind(child, "Text"))[0]
      ?.props["value"] ??
    findByKind(tree, "#text")[0]?.props["text"] ??
    "";
  return {
    proof: {
      backend: host.backend,
      clickTarget: lastTarget.current,
      clicks: clicks.current,
      frames: state.frames,
      image,
      layout: {
        direction: columns[0]?.props["direction"] ?? "",
        gap: columns[0]?.props["gap"] ?? "",
        padding: columns[0]?.props["padding"] ?? "",
      },
      subscriberCalls: calls.current,
      title,
    },
    state,
    tree,
  };
};
