import type * as Effect from "effect/Effect";
import type { View } from "ilha";

import { controller, EMOTES, STATES } from "./controller.ts";
import { waitFor } from "./scene.tsx";

/** States dropdown: mirrors the original `States` lil-gui folder. */
const StateSelect = (): View => (
  <label class="row">
    <span>State</span>
    <select
      onchange={(event) => {
        controller.pendingState = (
          event.currentTarget as HTMLSelectElement
        ).value;
      }}
    >
      {STATES.map((name) => (
        <option value={name} selected={name === controller.state}>
          {name}
        </option>
      ))}
    </select>
  </label>
);

/** Emote buttons: mirrors the original `Emotes` lil-gui folder. */
const EmoteButtons = (): View => (
  <div class="row buttons">
    {EMOTES.map((name) => (
      <button
        type="button"
        onclick={() => {
          controller.pendingEmote = name;
        }}
      >
        {name}
      </button>
    ))}
  </div>
);

/** Expression sliders: mirrors the original `Expressions` folder. */
const ExpressionSliders = (): View => (
  <div class="expressions">
    {controller.expressions.map((name, index) => (
      <label class="row">
        <span>{name}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value="0"
          oninput={(event) => {
            controller.setExpression(
              index,
              Number((event.currentTarget as HTMLInputElement).value),
            );
          }}
        />
      </label>
    ))}
  </div>
);

/**
 * Control panel. Appears once the model loads, like the original GUI
 * which `createGUI` builds inside the loader callback.
 */
export function* Overlay(): Generator<
  Effect.Effect<unknown, unknown, unknown>,
  View | undefined,
  View
> {
  yield waitFor(() => controller.loaded);
  return (
    <aside class="panel">
      <h1>Skinning + Morph</h1>
      <p class="hint">RobotExpressive via ilha-tree bindings</p>
      <StateSelect />
      <EmoteButtons />
      <ExpressionSliders />
    </aside>
  );
}
