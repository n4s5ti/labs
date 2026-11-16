// The menubar's context, apart from the menubar, so a menu can join one
// without bundling it (port of `@ui-sdk/solid`'s `menubar-context`).
import type { menubar } from "@ui-sdk/core/menubar";
import { createContext } from "ilha";
import type { PrimitiveHandle } from "./primitive.ts";

const MenubarContext = createContext<PrimitiveHandle<typeof menubar> | null>(
  null,
);

export { MenubarContext };
