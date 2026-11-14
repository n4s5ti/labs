// Client-state backend for the demo: a shared counter and a checkable
// task board, entirely in the browser. Same shape as the guide's counter
// (dataView + clientSchema + registerClientSchema), no transport, no
// codegen, no server.
import { clientSchema, createClient, dataView } from "@nkzw/fate";

export type Counter = {
  __typename: "Counter";
  id: string;
  value: number;
};

export type Task = {
  __typename: "Task";
  done: boolean;
  id: string;
  title: string;
};

export type Board = {
  __typename: "Board";
  id: string;
  ids: string[];
};

const counterView = dataView<Counter>("Counter")({ id: true, value: true });
const taskView = dataView<Task>("Task")({
  done: true,
  id: true,
  title: true,
});
const boardView = dataView<Board>("Board")({ id: true, ids: true });

const schema = clientSchema({
  roots: {
    board: { id: "main", type: "Board" },
    counter: { id: "main", type: "Counter" },
    t1: { id: "t1", type: "Task" },
    t2: { id: "t2", type: "Task" },
    t3: { id: "t3", type: "Task" },
  },
  types: {
    Board: {
      defaults: (id: string | number) => ({ id, ids: ["t1", "t2", "t3"] }),
      view: boardView,
    },
    Counter: {
      defaults: (id: string | number) => ({ id, value: 0 }),
      view: counterView,
    },
    Task: {
      defaults: (id: string | number) => ({ done: false, id, title: `Task ${id}` }),
      view: taskView,
    },
  },
});

export const createAppClient = () =>
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

export type AppClient = ReturnType<typeof createAppClient>;

declare module "@nkzw/fate" {
  interface ClientRegistration {
    client: AppClient;
  }
}
