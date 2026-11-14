// ilha-fate over client state: provider, request roots, per-field view
// subscriptions and mutations, mounted headless with ilha/test.
import { describe, expect, test } from "bun:test";
import { render } from "ilha/test";
import type { View } from "ilha";
import {
  clientSchema,
  createClient,
  dataView,
  view,
} from "@nkzw/fate";

import { FateProvider, useFateClient, useFateRequest, useFateView } from "./index.ts";

type Counter = {
  __typename: "Counter";
  id: string;
  value: number;
};

type Task = {
  __typename: "Task";
  done: boolean;
  id: string;
  title: string;
};

type Board = {
  __typename: "Board";
  id: string;
  ids: string[];
};

const task = dataView<Task>("Task")({
  done: true,
  id: true,
  title: true,
});
const counter = dataView<Counter>("Counter")({ id: true, value: true });
const boardView = dataView<Board>("Board")({ id: true, ids: true });

const schema = clientSchema({
  roots: {
    board: { id: "main", type: "Board" },
    counter: { id: "main", type: "Counter" },
    t1: { id: "t1", type: "Task" },
    t2: { id: "t2", type: "Task" },
  },
  types: {
    Board: {
      defaults: (id: string | number) => ({ id, ids: ["t1", "t2"] }),
      view: boardView,
    },
    Counter: {
      defaults: (id: string | number) => ({ id, value: 0 }),
      view: counter,
    },
    Task: {
      defaults: (id: string | number) => ({ done: false, id, title: `Task ${id}` }),
      view: task,
    },
  },
});

const createTestClient = () =>
  createClient().registerClientSchema(schema, ({ mutation }) => ({
    "counter.increment": mutation("Counter", {
      resolve: ({ store }) =>
        store.update("Counter", "main", {
          value: (store.get("Counter", "main")?.value ?? 0) + 1,
        }),
    }),
    "task.toggle": mutation("Task", {
      input: { parse: (value: unknown) => value as { id: string } },
      resolve: ({ input, store }) =>
        store.update("Task", input.id, {
          done: !(store.get("Task", input.id)?.done ?? false),
        }),
    }),
  }));

type TestClient = ReturnType<typeof createTestClient>;

const CounterView = view<Counter>()({ value: true });
const BoardView = view<Board>()({ ids: true });
const TaskView = view<Task>()({ done: true, title: true });
const TitleView = view<Task>()({ title: true });
const DoneView = view<Task>()({ done: true });

const renders: Record<string, number> = {};
const count = (name: string): void => {
  renders[name] = (renders[name] ?? 0) + 1;
};

function CounterPanel(): View {
  const fate = useFateClient() as unknown as TestClient;
  count("counter");
  const result = useFateRequest({ counter: { view: CounterView } }) as {
    counter: Parameters<typeof useFateView>[1];
  };
  const data = useFateView(CounterView, result.counter) as unknown as { value: number };
  return (
    <button id="counter" onclick={() => void fate.mutations.counter.increment()}>
      Count: {data.value}
    </button>
  );
}

function TaskCard(props: { id: string }): View {
  const fate = useFateClient() as unknown as TestClient;
  count(`task-${props.id}`);
  const ref = fate.ref("Task", props.id, TaskView);
  const data = useFateView(TaskView, ref) as unknown as {
    done: boolean;
    title: string;
  };
  return (
    <li>
      <button id={`toggle-${props.id}`} onclick={() => void fate.mutations.task.toggle({ input: { id: props.id } })}>
        {data.done ? "done" : "open"} {data.title}
      </button>
    </li>
  );
}

function Board(): View {
  count("board");
  const result = useFateRequest({ board: { view: BoardView } }) as unknown as {
    board: Parameters<typeof useFateView>[1];
  };
  const data = useFateView(BoardView, result.board) as unknown as { ids: string[] };
  return (
    <ul>
      {data.ids.map((id) => (
        <TaskCard key={id} id={id} />
      ))}
    </ul>
  );
}

function TitleOnly(props: { id: string }): View {
  const fate = useFateClient() as unknown as TestClient;
  count("title-only");
  const ref = fate.ref("Task", props.id, TitleView);
  const data = useFateView(TitleView, ref) as unknown as { title: string };
  return <span id="title-only">{data.title}</span>;
}

function DoneOnly(props: { id: string }): View {
  const fate = useFateClient() as unknown as TestClient;
  count("done-only");
  const ref = fate.ref("Task", props.id, DoneView);
  const data = useFateView(DoneView, ref) as unknown as { done: boolean };
  return <span id="done-only">{data.done ? "done" : "open"}</span>;
}

const App = (props: { fate: TestClient }): View => (
  <FateProvider client={props.fate}>
    <CounterPanel />
    <CounterPanel />
    <Board />
  </FateProvider>
);

const resetRenders = (): void => {
  for (const key of Object.keys(renders)) {
    delete renders[key];
  }
};

describe("ilha-fate", () => {
  test("counter increments everywhere through the shared record", async () => {
    resetRenders();
    const fate = createTestClient();
    const ui = render(() => <App fate={fate} />);
    await ui.settled();
    expect(ui.text()).toContain("Count: 0");
    await ui.click("#counter");
    await ui.settled();
    // Both panels read the same normalized record, so both update.
    expect(ui.text().match(/Count: 1/g)?.length).toBe(2);
    expect(renders["counter"]).toBeGreaterThanOrEqual(2);
    ui.unmount();
  });

  test("task views re-render only for their selected fields", async () => {
    resetRenders();
    const fate = createTestClient();
    const ui = render(() => (
      <FateProvider client={fate}>
        <TitleOnly id="t1" />
        <DoneOnly id="t1" />
      </FateProvider>
    ));
    await ui.settled();
    expect(ui.text()).toContain("Task t1");
    const titleRenders = renders["title-only"] ?? 0;
    const doneRenders = renders["done-only"] ?? 0;
    await fate.mutations.task.toggle({ input: { id: "t1" } });
    await ui.settled();
    expect(ui.text()).toContain("done");
    // The title view never selected `done`, so it never re-rendered.
    expect(renders["title-only"]).toBe(titleRenders);
    expect(renders["done-only"]).toBeGreaterThan(doneRenders);
    ui.unmount();
  });

  test("null refs pass through without suspending", async () => {
    const fate = createTestClient();
    function Maybe(): View {
      const data = useFateView(TaskView, null);
      return <span id="maybe">{data === null ? "empty" : "full"}</span>;
    }
    const ui = render(() => (
      <FateProvider client={fate}>
        <Maybe />
      </FateProvider>
    ));
    await ui.settled();
    expect(ui.text()).toContain("empty");
    ui.unmount();
  });

  test("hooks outside the provider report the missing client", async () => {
    function Orphan(): View {
      useFateClient();
      return <span>orphan</span>;
    }
    const errors: unknown[] = [];
    const ui = render(() => <Orphan />, {
      onError: (error: unknown) => {
        errors.push(error);
      },
    });
    await ui.settled();
    expect(String(errors[0])).toContain("FateProvider");
    ui.unmount();
  });
});
