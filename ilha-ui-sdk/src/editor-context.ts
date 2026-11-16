// Editor adapter context (port of `@ui-sdk/solid`'s `editor-context`).
//
// The text editor a trigger menu types in: the menu takes it as its `editor`
// option, or inherits it from here, so a menu wrapped around an editor of its
// own just works.
import type { TextEditorAdapter } from "@ui-sdk/core/trigger-menu";
import { createContext } from "ilha";

const EditorContext = createContext<() => TextEditorAdapter | undefined>(
  () => undefined,
);

export { EditorContext };
export type { TextEditorAdapter };
