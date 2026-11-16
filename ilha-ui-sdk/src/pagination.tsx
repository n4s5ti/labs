// Pagination (port of `@ui-sdk/solid`'s `pagination`).
//
// The Solid adapter keeps a projection of the range so a `For` over it keeps
// the links that stay, preserving the pressed link's focus. Ilha morphs
// elements in place instead, so the list renders its state directly.
import {
  pagination as paginationPrimitive,
  type PaginationLinkProps,
  type PaginationLinkState,
  type PaginationOptions,
  type PaginationState,
  type PaginationStepState,
} from "@ui-sdk/core/pagination";
import { context, createContext } from "ilha";
import {
  childOf,
  createParts,
  omit,
  renderAs,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./primitive.ts";

const parts = createParts(paginationPrimitive, { item: "li", ellipsis: "span" });

type PaginationContextValue = PrimitiveHandle<typeof paginationPrimitive> & {
  // Parts are links with `getHref`, and buttons without.
  tag: () => "a" | "button";
};

const PaginationContext = createContext<PaginationContextValue | null>(null);

function usePagination(part: string) {
  const pagination = context(PaginationContext)();
  if (!pagination) {
    throw new Error(`${part} must be used inside <Pagination>.`);
  }
  return pagination;
}

// The part's element, unless the user renders their own: a link or a button, as the pagination decides.
function tagged(
  pagination: PaginationContextValue,
  props: Record<string, any>,
) {
  return {
    ...props,
    get render() {
      return props.render ?? renderAs(pagination.tag);
    },
  };
}

/**
 * A navigation landmark around the page links. Name it with `aria-label`.
 * @stable
 */
function Pagination(
  props: PaginationOptions & PartProps<"nav", PaginationState>,
) {
  const pagination = usePrimitive(paginationPrimitive, () => ({
    page: props.page,
    defaultPage: props.defaultPage,
    onPageChange: props.onPageChange,
    pageCount: props.pageCount,
    total: props.total,
    pageSize: props.pageSize,
    siblings: props.siblings,
    boundaries: props.boundaries,
    getHref: props.getHref,
    controller: props.controller,
    debug: props.debug,
  }));
  const rest = omit(
    props,
    "page",
    "defaultPage",
    "onPageChange",
    "pageCount",
    "total",
    "pageSize",
    "siblings",
    "boundaries",
    "getHref",
    "controller",
    "debug",
  );
  // Merged, not spread: the handle's `state` is a getter.
  const paginationContext: PaginationContextValue = Object.assign(
    Object.create(pagination),
    {
      tag: () => (props.getHref ? ("a" as const) : ("button" as const)),
    },
  );
  return (
    <PaginationContext.Provider value={paginationContext}>
      {usePart(pagination, "root", undefined, rest, "nav")}
    </PaginationContext.Provider>
  );
}

/**
 * The list of pages and steps. Its children can be a function of the state,
 * whose `items` are the pages to show.
 * @stable
 */
function PaginationList(props: PartProps<"ul", PaginationState>) {
  const pagination = usePagination("PaginationList");
  return usePart(pagination, "list", undefined, props, "ul");
}

/**
 * One entry in the list, around a link, a step or an ellipsis.
 * @stable
 */
const PaginationItem = parts.Item;

/**
 * A page. The current one has `aria-current="page"`. Shows its number unless it has children.
 * @stable
 */
function PaginationLink(
  props: PartProps<"a", PaginationLinkState> & PaginationLinkProps,
) {
  const pagination = usePagination("PaginationLink");
  // Keyed by its page, which isn't a string value.
  const part = () => ({ page: props.page, id: String(props.page) });
  const kids = childOf(props);
  const rest = {
    ...tagged(pagination, omit(props, "page")),
    get children() {
      return kids ?? props.page;
    },
  };
  return usePart(pagination, "link", part, rest, "button");
}

type StepProps = PartProps<"a", PaginationStepState>;

function stepPart(
  name: "previous" | "next" | "first" | "last",
  part: string,
  props: StepProps,
) {
  const pagination = usePagination(part);
  return usePart(
    pagination,
    name,
    undefined,
    tagged(pagination, props),
    "button",
  );
}

/**
 * Goes to the previous page. `aria-disabled` on the first page, where it stays focusable.
 * @stable
 */
function PaginationPrevious(props: StepProps) {
  return stepPart("previous", "PaginationPrevious", props);
}

/**
 * Goes to the next page. `aria-disabled` on the last page, where it stays focusable.
 * @stable
 */
function PaginationNext(props: StepProps) {
  return stepPart("next", "PaginationNext", props);
}

/**
 * Goes to the first page. `aria-disabled` there.
 * @stable
 */
function PaginationFirst(props: StepProps) {
  return stepPart("first", "PaginationFirst", props);
}

/**
 * Goes to the last page. `aria-disabled` there.
 * @stable
 */
function PaginationLast(props: StepProps) {
  return stepPart("last", "PaginationLast", props);
}

/**
 * A gap in the range. Hidden from screen readers, since the links around it
 * say which pages there are. Shows "…" unless it has children.
 * @stable
 */
function PaginationEllipsis(props: Parameters<typeof parts.Ellipsis>[0]) {
  const children = childOf(props);
  return <parts.Ellipsis {...props}>{children ?? "…"}</parts.Ellipsis>;
}

export {
  createPaginationController,
  paginationRange,
} from "@ui-sdk/core/pagination";
export type {
  PaginationChangeOptions,
  PaginationController,
  PaginationLinkProps,
  PaginationLinkState,
  PaginationOptions,
  PaginationPageChangeReason,
  PaginationPrimitive,
  PaginationRangeItem,
  PaginationRangeOptions,
  PaginationState,
  PaginationStepState,
} from "@ui-sdk/core/pagination";

export {
  Pagination,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
};
