// Toolbar (port of `@ui-sdk/solid`'s `toolbar`).
//
// The toolbar shares its handle with the toggles inside it through
// `ToolbarContext`, so a toggle joins the toolbar without bundling it.
import {
  toolbar as toolbarPrimitive,
  type ToolbarGroupProps,
  type ToolbarGroupState,
  type ToolbarOptions,
  type ToolbarState,
} from "@ui-sdk/core/toolbar";
import { atom } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { ToolbarContext, ToolbarGroupContext } from "./toolbar-context.ts";
import {
  createParts,
  omit,
  providePrimitive,
  usePart,
  usePrimitive,
  type PartProps,
} from "./primitive.ts";

const parts = createParts(toolbarPrimitive, {
  button: "button",
  link: "a",
  input: "input",
  separator: "div",
});

/**
 * Buttons, links and inputs in a row, with one tab stop and arrow keys
 * between them.
 * @stable
 */
function Toolbar(props: ToolbarOptions & PartProps<"div", ToolbarState>) {
  const handle = usePrimitive(toolbarPrimitive, () => ({
    orientation: props.orientation,
    loop: props.loop,
    disabled: props.disabled,
    controller: props.controller,
  }));
  const rest = omit(
    props,
    "orientation",
    "loop",
    "disabled",
    "controller",
  );
  return (
    <ToolbarContext.Provider value={handle}>
      {providePrimitive(handle, () =>
        usePart(handle, "root", undefined, rest, "div"),
      )}
    </ToolbarContext.Provider>
  );
}

/**
 * A button in a toolbar. A toggle of its own, or a plain button that stays
 * in the tab order.
 * @stable
 */
const ToolbarButton = parts.Button;

/**
 * A link in a toolbar.
 * @stable
 */
const ToolbarLink = parts.Link;

/**
 * An input in a toolbar.
 * @stable
 */
const ToolbarInput = parts.Input;

let nextToolbarGroupId = 0;

/**
 * Buttons that share a label, and are disabled together.
 * @stable
 */
function ToolbarGroup(
  props: ToolbarGroupProps & Omit<PartProps<"div", ToolbarGroupState>, "disabled">,
) {
  // Made once: a new id each render would make a new group part each render
  // (core keys parts by id), resubscribing forever.
  const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextToolbarGroupId += 1)}`, {
    snapshot: false,
  });
  const id = idBox();
  const group = () => ({ id, disabled: props.disabled });
  const children = props.children as
    | JSX.Element
    | ((state: ToolbarGroupState) => JSX.Element)
    | undefined;
  const rest = {
    ...omit(props, "disabled"),
    get children() {
      return (state: ToolbarGroupState) => (
        <ToolbarGroupContext.Provider value={() => state.disabled}>
          {typeof children === "function" && (children as Function).length > 0
            ? (children as (state: ToolbarGroupState) => JSX.Element)(state)
            : (children as JSX.Element)}
        </ToolbarGroupContext.Provider>
      );
    },
  };
  return usePart(toolbarPrimitive, "group", group, rest, "div");
}

/**
 * A line between buttons.
 * @stable
 */
const ToolbarSeparator = parts.Separator;

export { createToolbarController } from "@ui-sdk/core/toolbar";
export type {
  ToolbarApi,
  ToolbarButtonProps,
  ToolbarButtonState,
  ToolbarController,
  ToolbarGroupProps,
  ToolbarGroupState,
  ToolbarInputProps,
  ToolbarInputState,
  ToolbarLinkState,
  ToolbarOptions,
  ToolbarOrientation,
  ToolbarPrimitive,
  ToolbarSeparatorState,
  ToolbarState,
} from "@ui-sdk/core/toolbar";

export {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarInput,
  ToolbarLink,
  ToolbarSeparator,
};
