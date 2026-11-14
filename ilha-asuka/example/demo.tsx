// Shared demo tree: layout (column/row style props) + text + image
// (cached loader) + events (button Press) + loop (useFrame subscriber).
// `runDemo` paints it through the real ilha renderer into `host`, runs
// the layout engine, dispatches a button Press, and returns the retained
// tree plus observable proof for `/api/proof`.
import type { View } from "ilha";

import {
  bootRoot,
  cachedLoad,
  dispatchAsukaEvent,
  elementFor,
  useFrame,
} from "../src/index.ts";
import type {
  AsukaEventPayload,
  AsukaTreeNode,
  AsyncLoader,
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
  /** Handler invocations from the dispatched Press. */
  clicks: number;
  /** Last Press payload target (element handle). */
  clickTarget: number | null;
  /** Title text read back from the retained store. */
  title: string;
  /** Image source resolved through the cached loader. */
  image: string;
  /** Layout frames read back from the retained store. */
  framesByNode: Record<string, [number, number, number, number]>;
  /** Op-log length (mount ops a real host would apply). */
  ops: number;
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
  const onClick = (payload: AsukaEventPayload): void => {
    props.clicks.current += 1;
    props.lastTarget.current = payload.target;
  };
  return (
    <column direction="column" gap="8" padding="16">
      <asukaText value="ilha-asuka dashboard">ilha-asuka dashboard</asukaText>
      <row direction="row" gap="4">
        <asukaText value="counter">counter</asukaText>
        <asukaButton onClick={onClick}>press</asukaButton>
      </row>
      <image Source="logo.png" width="64" height="64" data-bytes={props.image} />
    </column>
  );
};

const findByKind = (
  tree: AsukaTreeNode | null,
  kind: string,
): AsukaTreeNode[] => {
  if (tree === null) {
    return [];
  }
  const self = tree.kind === kind ? [tree] : [];
  return [...self, ...tree.children.flatMap((child) => findByKind(child, kind))];
};

/**
 * Paint the demo into `host` and exercise every binding: five manual loop
 * frames (loop), layout through the Asuka engine, a dispatched button
 * Press (events), then read back the retained tree (layout + text +
 * image). The root stays mounted so the server keeps serving the live
 * tree; call `state.dispose()` to release.
 */
export const runDemo = async (
  host: SyncHost,
): Promise<{ state: RootState; tree: AsukaTreeNode | null; proof: DemoProof }> => {
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
  // Layout: run the Asuka engine over the mounted tree.
  host.layout(state.root.nodeId, state.size.width, state.size.height);
  // Loop: five manual frames drive the demand-mode subscriber.
  for (let t = 100; t <= 500; t += 100) {
    state.advance(t);
  }
  // Events: dispatch a Press at the mounted button's live element.
  const live = host.describe(state.root.nodeId);
  const buttons = findByKind(live, "Button");
  if (buttons.length !== 1 || typeof buttons[0]?.id !== "number") {
    throw new Error("demo button did not mount exactly once");
  }
  const el = elementFor(host, buttons[0].id as number);
  if (el === undefined || !dispatchAsukaEvent(el, "Press")) {
    throw new Error("demo Press did not reach a handler");
  }
  const tree = host.describe(state.root.nodeId);
  const views = findByKind(tree, "View");
  const title =
    findByKind(tree, "Text")[0]?.props["Text"] ??
    findByKind(tree, "View")[0]?.props["value"] ??
    "";
  const framesByNode: Record<string, [number, number, number, number]> = {};
  for (const view of views.slice(0, 3)) {
    framesByNode[`view-${view.id}`] = view.frame;
  }
  for (const text of findByKind(tree, "Text")) {
    framesByNode[`text-${text.id}`] = text.frame;
  }
  return {
    proof: {
      backend: host.backend,
      clickTarget: lastTarget.current,
      clicks: clicks.current,
      frames: state.frames,
      framesByNode,
      image,
      ops: host.ops().length,
      subscriberCalls: calls.current,
      title: String(title),
    },
    state,
    tree,
  };
};
