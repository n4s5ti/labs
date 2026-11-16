// File input (port of `@ui-sdk/solid`'s `file-input`).
import {
  fileInput as fileInputPrimitive,
  type FileInputItemProps,
  type FileInputItemRemoveState,
  type FileInputItemState,
  type FileInputOptions,
  type FileInputState,
  type FileInputTriggerProps,
} from "@ui-sdk/core/file-input";
import { fileKey } from "@ui-sdk/core/renderer";
import { context, createContext } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { useControllerEntry, useControllerTarget } from "./controller-target.ts";
import { joinField, useFieldControl } from "./field-context.ts";
import {
  childOf,
  createParts,
  omit,
  renderStatic,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

const parts = createParts(fileInputPrimitive, { dropzone: "div" });

type FileInputContextValue = PrimitiveHandle<typeof fileInputPrimitive>;

const FileInputContext = createContext<FileInputContextValue | null>(null);
// The file each repetition of a list's children shows.
const FileContext = createContext<File | null>(null);

function useFileInput(part: string) {
  const fileInput = context(FileInputContext)();
  if (!fileInput) {
    throw new Error(`${part} must be used inside <FileInput>.`);
  }
  return fileInput;
}

function useItemFile(part: string, own: () => File | undefined) {
  return () => {
    const file = own() ?? context(FileContext)();
    if (!file) {
      throw new Error(
        `${part} must be used inside <FileInputList>, or be given a file.`,
      );
    }
    return file;
  };
}

type DivProps<State> = Omit<
  PartProps<"div", State>,
  "defaultValue" | "onChange" | "onSelect" | "onDrop"
>;
type ButtonProps<State> = Omit<
  PartProps<"button", State>,
  "name" | "form" | "value" | "onSelect"
>;

// Children that take the part's state are called with it. A function that
// takes nothing is a child component's accessor, and goes through as it is.
const resolve = (value: unknown, state: unknown) =>
  typeof value === "function" && (value as (...args: unknown[]) => unknown).length > 0
    ? (value as (state: unknown) => unknown)(state)
    : value;

/**
 * The root: it holds the files, and renders the hidden file input that opens
 * the picker and that a form submits.
 * @stable
 */
function FileInput(props: FileInputOptions & DivProps<FileInputState>) {
  const field = useFieldControl();
  const fileInput = usePrimitive(fileInputPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    onReject: props.onReject,
    accept: props.accept,
    multiple: props.multiple,
    directory: props.directory,
    capture: props.capture,
    maxFiles: props.maxFiles,
    maxSize: props.maxSize,
    minSize: props.minSize,
    validate: props.validate,
    name: props.name ?? field?.name(),
    form: props.form,
    required: props.required,
    disabled: props.disabled || field?.disabled(),
    announcement: props.announcement,
    controller: props.controller,
    debug: props.debug,
  }));
  useControllerEntry(() => props.controller, fileInput);
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "onReject",
    "accept",
    "multiple",
    "directory",
    "capture",
    "maxFiles",
    "maxSize",
    "minSize",
    "validate",
    "name",
    "form",
    "required",
    "disabled",
    "announcement",
    "controller",
    "debug",
  );
  const input = fileInput.slot("input");
  const hidden = <input {...input} />;
  // Content, then the hidden input, with function children resolved.
  const children = childOf(rest);
  const root = {
    ...rest,
    get children() {
      return (current: FileInputState) => (
        <>
          {resolve(children, current) as JSX.Element}
          {hidden}
        </>
      );
    },
  };
  return (
    <FileInputContext.Provider value={fileInput}>
      {usePart(fileInput, "root", undefined, root, "div")}
    </FileInputContext.Provider>
  );
}

const unconnected: FileInputState = {
  value: [],
  disabled: false,
  required: false,
  dragging: false,
};

/**
 * Opens the file picker. Inside a Field, the field's label names it with the
 * button's own text. Outside the file input, it connects through `controller`.
 * @stable
 */
function FileInputTrigger(
  props: ButtonProps<FileInputState> & FileInputTriggerProps,
) {
  const fileInput = useControllerTarget(
    () => (props as { controller?: FileInputOptions["controller"] }).controller,
    context(FileInputContext)(),
  );
  const rest = omit(props, "controller");
  const field = useFieldControl();
  const current = fileInput();
  return !current
    // Until the file input it names mounts, a trigger outside it is a plain button.
    ? renderStatic(
      "button",
      () => ({ attrs: {}, state: unconnected }),
      { type: "button", ...rest },
    )
    : usePart(
      current,
      "trigger",
      undefined,
      joinField(field, rest, "button"),
      "button",
    );
}

/**
 * Takes dropped and pasted files. Put the trigger inside it, which is how
 * keyboard and screen reader users choose files.
 * @stable
 */
const FileInputDropzone = parts.Dropzone;

/**
 * The files, as a list. Its children render once for each file, so put a
 * FileInputItem in it.
 * @stable
 */
function FileInputList(
  props: Omit<DivProps<FileInputState>, "children"> & {
    children?: JSX.Element;
  },
) {
  const fileInput = useFileInput("FileInputList");
  const children = childOf(props);
  const rest = {
    ...props,
    get children() {
      return (state: FileInputState) => (
        <>
          {(state.value as readonly File[]).map((file) => (
            <FileContext.Provider key={fileKey(file)} value={file}>
              {children as JSX.Element}
            </FileContext.Provider>
          ))}
        </>
      );
    },
  };
  return usePart(fileInput, "list", undefined, rest, "div");
}

/**
 * One file. Its render state has the file, for its name, size and preview.
 * Arrow keys move between items, and Backspace or Delete removes the focused one.
 * @stable
 */
function FileInputItem(
  props: DivProps<FileInputItemState> & Partial<FileInputItemProps>,
) {
  const fileInput = useFileInput("FileInputItem");
  const file = useItemFile("FileInputItem", () => props.file);
  const item = () => ({ file: file(), value: fileKey(file()) });
  const rest = omit(props, "file");
  const current = file();
  return (
    <FileContext.Provider value={current}>
      {usePart(fileInput, "item", item, rest, "div")}
    </FileContext.Provider>
  );
}

/**
 * Removes its item's file, or the `file` it's given. It's named "Remove <file
 * name>" unless you name it.
 * @stable
 */
function FileInputItemRemove(
  props: ButtonProps<FileInputItemRemoveState> &
    Partial<FileInputItemProps>,
) {
  const fileInput = useFileInput("FileInputItemRemove");
  const file = useItemFile("FileInputItemRemove", () => props.file);
  const item = () => ({ file: file(), value: fileKey(file()) });
  return usePart(fileInput, "item-remove", item, omit(props, "file"), "button");
}

export {
  createFileInputController,
  formatFileSize,
  relativePath,
} from "@ui-sdk/core/file-input";
export type {
  FileInputApi,
  FileInputChange,
  FileInputChangeOptions,
  FileInputController,
  FileInputDropzoneProps,
  FileInputDropzoneState,
  FileInputDropzoneTarget,
  FileInputItemProps,
  FileInputItemRemoveState,
  FileInputItemState,
  FileInputOptions,
  FileInputPasteTarget,
  FileInputPrimitive,
  FileInputState,
  FileInputTriggerProps,
  FileInputValueChangeDetails,
  FileInputValueChangeReason,
  FileLike,
  FileRejection,
  FileRejectionReason,
  FileRules,
} from "@ui-sdk/core/file-input";

export {
  FileInput,
  FileInputDropzone,
  FileInputItem,
  FileInputItemRemove,
  FileInputList,
  FileInputTrigger,
};
