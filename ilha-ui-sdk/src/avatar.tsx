// Avatar (port of `@ui-sdk/solid`'s `avatar`).
import { avatar } from "@ui-sdk/core/avatar";
import { createParts } from "./primitive.ts";

const parts = createParts(avatar, {
  fallback: "span",
  image: "img",
  root: "span",
});

/**
 * The root: a box for the image and its fallback.
 * @stable
 */
const Avatar = parts.Root;

/**
 * A real <img>, hidden until it loads. Every image attribute passes through,
 * like `crossorigin`, `referrerpolicy`, `srcset` and `sizes`.
 * @stable
 */
const AvatarImage = parts.Image;

/**
 * Shown while there's no loaded image, after its `delay`.
 * @stable
 */
const AvatarFallback = parts.Fallback;

export type {
  AvatarFallbackProps,
  AvatarLoadingStatus,
  AvatarLoadingStatusChangeReason,
  AvatarOptions,
  AvatarPrimitive,
  AvatarState,
} from "@ui-sdk/core/avatar";

export { Avatar, AvatarFallback, AvatarImage };
