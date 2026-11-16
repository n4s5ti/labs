// Shared hidden inputs for a list's root (port of `@ui-sdk/solid`'s
// `form-inputs`, minus Solid's `For`/`Show`: rows are plain maps, since
// entries are plain data).
//
// The hidden inputs that take part in a form for a list's root, like a
// select's: one for the value, or one more per value with `multiple`. The
// value input's `value` attribute is the serialized value, so reading it
// follows every value change. `multiple` is the component's prop, read as a
// getter so a change adds or removes the inputs.
import type { JSX } from "ilha/jsx-runtime";
import type { PrimitiveHandle } from "./primitive.ts";

// The core list api behind `handle`, whose serialized values submit.
type Listed = {
  api: { internal: { serialized: () => string[] } };
};

function formInputs(
  handle: PrimitiveHandle<any>,
  multiple: () => boolean | undefined,
): JSX.Element {
  const input = handle.slot("form-input");
  const serialized = (handle as unknown as Listed).api.internal.serialized();
  return (
    <>
      <input {...input} />
      {multiple()
        ? serialized.map((key) => {
          const hidden = handle.slot("value-input", () => ({
            id: key,
            value: key,
          }));
          return <input key={key} {...hidden} />;
        })
        : null}
    </>
  );
}

export { formInputs };
