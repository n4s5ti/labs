// A row of menus, like a desktop app's: one tab stop, arrow keys between the
// triggers and between open menus. Each `Menu` inside joins it (port of
// `@ui-sdk/solid`'s `menubar`).
import {
  menubar as menubarPrimitive,
  type MenubarOptions,
  type MenubarState,
} from "@ui-sdk/core/menubar";
import { MenubarContext } from "./menubar-context.ts";
import { omit, usePart, usePrimitive, type PartProps } from "./primitive.ts";

/**
 * A row of menus, like a desktop app's: one tab stop, arrow keys between the
 * triggers and between open menus. Each `Menu` inside joins it.
 * @stable
 */
function Menubar(props: MenubarOptions & PartProps<"div", MenubarState>) {
  const menubar = usePrimitive(menubarPrimitive, () => ({
    orientation: props.orientation,
    loop: props.loop,
    disabled: props.disabled,
    modal: props.modal,
    controller: props.controller,
    debug: props.debug,
  }));
  const rest = omit(
    props,
    "orientation",
    "loop",
    "disabled",
    "modal",
    "controller",
    "debug",
  );
  return (
    <MenubarContext.Provider value={menubar}>
      {usePart(menubar, "root", undefined, rest, "div")}
    </MenubarContext.Provider>
  );
}

export { createMenubarController } from "@ui-sdk/core/menubar";
export type {
  MenubarApi,
  MenubarController,
  MenubarMember,
  MenubarOptions,
  MenubarOrientation,
  MenubarPrimitive,
  MenubarState,
} from "@ui-sdk/core/menubar";

export { Menubar };
