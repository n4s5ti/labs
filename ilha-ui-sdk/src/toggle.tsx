// Toggle (port of `@ui-sdk/solid`'s `toggle`).
import {
  toggle,
  toggleGroup as toggleGroupPrimitive,
  type ToggleGroupController,
  type ToggleGroupOptions,
  type ToggleGroupState,
  type ToggleOptions,
  type ToggleState,
} from "@ui-sdk/core/toggle";
import { createContext, context } from "ilha";
import { useToolbarScope } from "./toolbar-context.ts";
import {
  createParts,
  omit,
  provided,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

const parts = createParts(toggle, { icon: "span" });

// The group's own context, so a toggle can join a group without bundling it.
const ToggleGroupContext = createContext<PrimitiveHandle<
  typeof toggleGroupPrimitive
> | null>(null);

/**
 * A button that stays pressed. Inside a ToggleGroup, the group decides whether it's pressed.
 * @stable
 */
function Toggle(
  props: ToggleOptions &
    Omit<PartProps<"button", ToggleState>, "value" | "defaultValue" | "type" | "onChange" | "onSelect">,
) {
  const group = context(ToggleGroupContext)();
  const toolbar = useToolbarScope();
  const handle = usePrimitive(toggle, () => ({
    controller: props.controller,
    debug: props.debug,
    defaultPressed: props.defaultPressed,
    disabled: props.disabled,
    focusableWhenDisabled: props.focusableWhenDisabled,
    group: group ? () => group.api : undefined,
    onPressedChange: props.onPressedChange,
    pressed: props.pressed,
    toolbar: toolbar?.(),
    value: props.value,
  }));
  const rest = omit(
    props,
    "pressed",
    "defaultPressed",
    "onPressedChange",
    "value",
    "disabled",
    "focusableWhenDisabled",
    "controller",
    "debug",
  );
  return usePart(handle, "root", undefined, rest, "button");
}

/**
 * An icon inside a toggle. A toggle with only an icon needs an `aria-label`. Screen readers skip
 * it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const ToggleIcon = parts.Icon;

/**
 * Toggles that share one value, with one tab stop and arrow keys between them.
 * `T` is inferred from `value`, `defaultValue` or `onValueChange`.
 * @stable
 */
function ToggleGroup<T extends string = string>(
  props: ToggleGroupOptions<T> &
    Omit<PartProps<"div", ToggleGroupState<T>>, "defaultValue" | "onChange" | "onSelect">,
) {
  const toolbar = useToolbarScope();
  const group = usePrimitive(toggleGroupPrimitive, () => ({
    controller: props.controller as ToggleGroupController | undefined,
    debug: props.debug,
    defaultValue: props.defaultValue,
    deselectable: props.deselectable,
    disabled: props.disabled,
    loop: props.loop,
    multiple: props.multiple,
    onValueChange: props.onValueChange as ToggleGroupOptions["onValueChange"],
    orientation: props.orientation,
    toolbar: toolbar?.(),
    value: props.value,
  }));
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "multiple",
    "deselectable",
    "disabled",
    "orientation",
    "loop",
    "controller",
    "debug",
  );
  return provided(
    <ToggleGroupContext.Provider value={group}>
      {usePart(group, "group", undefined, rest, "div")}
    </ToggleGroupContext.Provider>,
  );
}

export {
  createToggleController,
  createToggleGroupController,
} from "@ui-sdk/core/toggle";
export type {
  ToggleApi,
  ToggleChangeOptions,
  ToggleController,
  ToggleGroupApi,
  ToggleGroupChangeOptions,
  ToggleGroupController,
  ToggleGroupOptions,
  ToggleGroupOrientation,
  ToggleGroupPrimitive,
  ToggleGroupState,
  ToggleGroupValueChangeReason,
  ToggleIconProps,
  ToggleIconState,
  ToggleOptions,
  TogglePressedChangeReason,
  TogglePrimitive,
  ToggleState,
} from "@ui-sdk/core/toggle";

export { Toggle, ToggleGroup, ToggleIcon };
