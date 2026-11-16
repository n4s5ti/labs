// Token input (port of `@ui-sdk/solid`'s `token-input`).
//
// Tokens render where the core puts their hosts: with `renderToken`, each
// host gets its own Ilha island mounted into it (Ilha has no portal, so a
// `mount` per host stands in for Solid's `<Portal>`); without it, tokens show
// as text the core writes itself.
import {
  tokenInput as tokenInputPrimitive,
  type Token,
  type TokenInputEditorProps,
  type TokenInputEditorState,
  type TokenInputOptions,
  type TokenInputTokenState,
} from "@ui-sdk/core/token-input";
import { renderStaticHtml } from "@ui-sdk/core/renderer";
import { atom, context, createContext, mount, untrack, watch } from "ilha";
import type { JSX } from "ilha/jsx-runtime";
import { EditorContext } from "./editor-context.ts";
import { joinField, useFieldControl } from "./field-context.ts";
import {
  childOf,
  omit,
  providePrimitive,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

const TokenInputContext = createContext<PrimitiveHandle<
  typeof tokenInputPrimitive
> | null>(null);
const TokenContext = createContext<string | null>(null);

function useTokenInput() {
  const input = context(TokenInputContext)();
  if (!input) {
    throw new Error("TokenInput parts must be used inside <TokenInput>.");
  }
  return input;
}

function useTokenId(part: string) {
  const id = context(TokenContext)();
  if (!id) {
    throw new Error(`<${part}> must be used inside renderToken.`);
  }
  return id;
}

/**
 * The props of `TokenInput`.
 * @stable
 */
type TokenInputProps = TokenInputOptions & {
  children?: JSX.Element;
  /** Renders each token the core can't show as text. Without it, tokens show as their labels. */
  renderToken?: (token: Token) => JSX.Element;
};

/**
 * Text with tokens in it, like an email's recipients. Type text, pick a
 * suggestion, and the text becomes a token.
 * @stable
 */
function TokenInput(props: TokenInputProps) {
  const field = useFieldControl();
  const { children, renderToken, ...options } = props;
  const input = usePrimitive(tokenInputPrimitive, () => ({
    ...options,
    name: props.name ?? field?.name(),
    disabled: props.disabled || field?.disabled(),
  }));
  // Whether custom token islands render: set once, and again when it flips.
  const customBox = atom.lazy(() => ({ custom: false }), { snapshot: false });
  const custom = !!renderToken;
  if (customBox().custom !== custom) {
    customBox().custom = custom;
    input.api.internal.setCustom(custom);
  }
  return (
    <TokenInputContext.Provider value={input}>
      <EditorContext.Provider value={() => input.api.editor}>
        {providePrimitive(input, () => (
          <>
            {children as JSX.Element}
            {formInput(input)}
            {renderToken ? <TokenHosts input={input} renderToken={renderToken} /> : null}
          </>
        ))}
      </EditorContext.Provider>
    </TokenInputContext.Provider>
  );
}

function TokenHosts(props: {
  input: PrimitiveHandle<typeof tokenInputPrimitive>;
  renderToken: (token: Token) => JSX.Element;
}) {
  // The hosts the core reports, mounted once each.
  const hosts = atom<readonly { id: string; token: Token; host: HTMLElement }[]>(
    [],
    { snapshot: false },
  );
  watch.once(() => {
    const read = () => {
      hosts.set(props.input.api.internal.hosts());
    };
    read();
    return props.input.instance.subscribe(read);
  });
  return (
    <>
      {hosts().map((entry) => (
        <TokenHost key={entry.id} entry={entry} renderToken={props.renderToken} />
      ))}
    </>
  );
}

function TokenHost(props: {
  entry: { id: string; token: Token; host: HTMLElement };
  renderToken: (token: Token) => JSX.Element;
}) {
  watch.once(() => {
    const token = untrack(() => props.entry.token);
    const release = mount(props.entry.host, () => (
      <TokenContext.Provider value={props.entry.id}>
        {props.renderToken(token)}
      </TokenContext.Provider>
    ));
    return () => release();
  });
  return null;
}

function formInput(input: PrimitiveHandle<typeof tokenInputPrimitive>) {
  const part = input.slot("form-input");
  return part.name ? <textarea {...part} /> : null;
}

/**
 * The text you type, with the tokens in it.
 * @stable
 */
function TokenInputEditor(
  props: Omit<PartProps<"div", TokenInputEditorState>, "children"> &
    TokenInputEditorProps,
) {
  const input = useTokenInput();
  const field = useFieldControl(props);
  const part = () => ({ placeholder: props.placeholder });
  const html = renderStaticHtml(input.state.value, input.api.internal.describe);
  const children = childOf(props);
  const own = {
    ...omit(props, "placeholder"),
    innerHTML: html,
    get children() {
      return children ?? null;
    },
  };
  return usePart(input, "editor", part, joinField(field, own, "div"), "div");
}

/**
 * One token. Only renders inside `renderToken`, which names the token it is.
 * @stable
 */
function TokenInputToken(props: PartProps<"span", TokenInputTokenState>) {
  const input = useTokenInput();
  const id = useTokenId("TokenInputToken");
  return usePart(input, "token", () => ({ id, token: id }), props, "span");
}

/**
 * Removes the token. Only renders inside `renderToken`, which names the token it is.
 * @stable
 */
function TokenInputTokenRemove(props: PartProps<"span">) {
  const input = useTokenInput();
  const id = useTokenId("TokenInputTokenRemove");
  return usePart(
    input,
    "token-remove",
    () => ({ id, token: id }),
    props,
    "span",
  );
}

export {
  createTokenInputController,
  defaultCodec,
  fromText,
  toLabel,
  toText,
} from "@ui-sdk/core/token-input";
export type {
  TokenCodec,
  TokenDeletion,
  TokenInputApi,
  TokenInputChangeOptions,
  TokenInputController,
  TokenInputEditorProps,
  TokenInputEditorState,
  TokenInputOptions,
  TokenInputPrimitive,
  TokenInputTokenProps,
  TokenInputTokenState,
  TokenInputSubmitDetails,
  TokenInputValue,
  TokenInputValueChangeDetails,
  TokenInputValueChangeReason,
  TokenInsert,
  TextEditorAdapter,
  TextRange,
  Token,
  UndoStackOptions,
} from "@ui-sdk/core/token-input";

export {
  TokenInput,
  TokenInputEditor,
  type TokenInputProps,
  TokenInputToken,
  TokenInputTokenRemove,
};
