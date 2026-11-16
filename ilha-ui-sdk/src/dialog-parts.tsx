// Shared dialog parts (port of `@ui-sdk/solid`'s `dialog-parts`).
//
// Dialog and AlertDialog render the same parts over their own primitive. The
// Solid factory takes a `viewport` that renders the content inside a
// sheet-positioning wrapper; Ilha renders the backdrop and content inline, in
// place, while their slot is present (no portal: a second island would break
// context/atoms), so the factory takes only the primitive and the name. The
// `container` option is accepted and ignored for the same reason.
import type {
  AlertDialogController,
  dialog as dialogPrimitive,
  DialogBackdropState,
  DialogContentProps,
  DialogContentState,
  DialogController,
  DialogOptions,
  DialogShortcutProps,
  DialogShortcutState,
  DialogTriggerProps,
  DialogTriggerState,
} from "@ui-sdk/core/dialog";
import { atom, context, createContext } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import {
  useControllerEntry,
  useControllerTarget,
} from "./controller-target.ts";
import {
  childOf,
  createParts,
  omit,
  providePrimitive,
  renderStatic,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

type DialogContextValue = PrimitiveHandle<typeof dialogPrimitive>;

type TriggerPartProps = Omit<
  PartProps<"button", DialogTriggerState>,
  "value" | "onChange"
> &
  Omit<DialogTriggerProps, "controller">;
type ContentPartProps<Payload = unknown> = PartProps<
  "div",
  DialogContentState<Payload>
> &
  DialogContentProps;
type ShortcutPartProps = PartProps<"span", DialogShortcutState> &
  DialogShortcutProps;

// The trigger a Shortcut part sits in: its shortcut, and the dialog it opens.
// A trigger connected through a controller sits outside the dialog, so its
// dialog comes from here.
const TriggerContext = createContext<{
  shortcut: () => string | undefined;
  dialog: () => DialogContextValue | undefined;
} | null>(null);

let nextDialogPartId = 0;

// Dialog and AlertDialog render the same parts over their own primitive.
function createDialogParts(primitive: typeof dialogPrimitive, name: string) {
  const parts = createParts(primitive, {
    title: "h2",
    description: "p",
    close: "button",
  });
  // The dialog, for the parts that may find it through a controller.
  const Context = createContext<DialogContextValue | null>(null);

  function useDialog() {
    const dialog = context(Context)();
    if (!dialog) {
      throw new Error(`${name} parts must be used inside <${name}>.`);
    }
    return dialog;
  }

  function Root(props: DialogOptions & { children?: JSX.Element }) {
    const options = omit(props, "children", "container");
    const dialog = usePrimitive(primitive, () => ({ ...options }));
    useControllerEntry(() => props.controller, dialog);
    return providePrimitive(dialog, () => (
      <Context.Provider value={dialog}>
        {childOf(props) as JSX.Element}
      </Context.Provider>
    ));
  }

  function Trigger(
    props: TriggerPartProps & {
      controller?: DialogController<any, any> | AlertDialogController<any, any>;
    },
  ) {
    const dialog = useControllerTarget(
      () => props.controller,
      context(Context)(),
    );
    const rest = omit(
      props,
      "disabled",
      "focusableWhenDisabled",
      "payload",
      "shortcut",
      "controller",
    );
    // Made once: a new id each render would make a new trigger part each
    // render (core keys parts by id), resubscribing forever.
    const idBox = atom.lazy(() => `ilha-ui-sdk-${(nextDialogPartId += 1)}`, {
      snapshot: false,
    });
    const shortcut = () => props.shortcut;
    const current = dialog();
    return (
      <TriggerContext.Provider value={{ dialog, shortcut }}>
        {!current
          // Until the dialog it names mounts, a trigger outside the dialog is a plain button.
          ? renderStatic(
            "button",
            () => ({
              attrs: {},
              state: { open: false, disabled: !!props.disabled },
            }),
            {
              ...rest,
              type: "button",
              disabled: props.disabled && !props.focusableWhenDisabled,
              "aria-disabled":
                (props.disabled && props.focusableWhenDisabled) || undefined,
            },
          )
          : (() => {
            const id = idBox();
            const trigger = () => ({
              id,
              disabled: props.disabled,
              focusableWhenDisabled: props.focusableWhenDisabled,
              payload: props.payload,
              shortcut: props.shortcut,
            });
            return usePart(current, "trigger", trigger, rest, "button");
          })()}
      </TriggerContext.Provider>
    );
  }

  function Backdrop(props: PartProps<"div", DialogBackdropState>) {
    const dialog = useDialog();
    const part = () => ({});
    const open = dialog.present("backdrop", part);
    const element = usePart(dialog, "backdrop", part, props, "div");
    return open ? element : null;
  }

  function Content<Payload = unknown>(props: ContentPartProps<Payload>) {
    const dialog = useDialog();
    const content = () => ({
      initialFocus: props.initialFocus,
      finalFocus: props.finalFocus,
      keepMounted: props.keepMounted,
    });
    const rest = omit(
      props,
      "initialFocus",
      "finalFocus",
      "keepMounted",
      "container",
    );
    const open = dialog.present("content", content);
    const element = usePart(dialog, "content", content, rest, "div");
    return open ? element : null;
  }

  function Shortcut(props: ShortcutPartProps) {
    const trigger = context(TriggerContext)();
    const dialogCtx = context(Context)();
    if (!dialogCtx && !trigger) {
      throw new Error(`${name} parts must be used inside <${name}>.`);
    }
    // A trigger outside the dialog finds it through its controller only once
    // mounted, so inside one whose dialog hasn't mounted yet, there's no
    // shortcut to show, as on the server.
    const dialog = dialogCtx ?? trigger?.dialog();
    if (!dialog) {
      return null;
    }
    const shortcut = () => ({ shortcut: props.shortcut ?? trigger?.shortcut() });
    const children = childOf(props);
    const rest = {
      ...omit(props, "shortcut"),
      get children() {
        return children ?? ((state: DialogShortcutState) => state.text);
      },
    };
    return usePart(dialog, "shortcut", shortcut, rest, "span");
  }

  return {
    Root,
    Trigger,
    Backdrop,
    Content,
    Title: parts.Title,
    Description: parts.Description,
    Close: parts.Close,
    Shortcut,
  };
}

export { createDialogParts, type TriggerPartProps };
