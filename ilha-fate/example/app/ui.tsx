// Task board over Fate client state: the request root declares what
// the screen needs, each card selects only its own fields, and toggling
// a task re-renders just that card (field-level subscriptions).
import type { View } from "ilha";
import { view } from "@nkzw/fate";

import type { AppClient, Board, Counter, Task } from "./state.ts";
import { FateProvider, useFateClient, useFateRequest, useFateView } from "../../src/index.ts";

const CounterView = view<Counter>()({ value: true });
const BoardView = view<Board>()({ ids: true });
const TaskView = view<Task>()({ done: true, title: true });

function CounterPanel(): View {
  const fate = useFateClient();
  const result = useFateRequest({ counter: { view: CounterView } }) as unknown as {
    counter: Parameters<typeof useFateView>[1];
  };
  const data = useFateView(CounterView, result.counter) as unknown as { value: number };
  return (
    <section>
      <h2>Counter</h2>
      <p>Both panels read the same normalized record.</p>
      <button id="counter-a" onclick={() => void fate.mutations.counter.increment()}>
        Count: {data.value}
      </button>
    </section>
  );
}

function SecondCounter(): View {
  const fate = useFateClient();
  const result = useFateRequest({ counter: { view: CounterView } }) as unknown as {
    counter: Parameters<typeof useFateView>[1];
  };
  const data = useFateView(CounterView, result.counter) as unknown as { value: number };
  return (
    <section>
      <h2>Same counter, second view</h2>
      <p>One store update re-renders every selected reader.</p>
      <button id="counter-b" onclick={() => void fate.mutations.counter.increment()}>
        Count: {data.value}
      </button>
    </section>
  );
}

function TaskCard(props: { id: string }): View {
  const fate = useFateClient();
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
  const result = useFateRequest({ board: { view: BoardView } }) as unknown as {
    board: Parameters<typeof useFateView>[1];
  };
  const data = useFateView(BoardView, result.board) as unknown as { ids: string[] };
  return (
    <section>
      <h2>Tasks</h2>
      <p>Toggling a task re-renders only its own card.</p>
      <ul>
        {data.ids.map((id) => (
          <TaskCard key={id} id={id} />
        ))}
      </ul>
    </section>
  );
}

export const App = (props: { fate: AppClient }): View => (
  <FateProvider client={props.fate}>
    <main>
      <h1>ilha-fate task board</h1>
      <CounterPanel />
      <SecondCounter />
      <Board />
    </main>
  </FateProvider>
);
