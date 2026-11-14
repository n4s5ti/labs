// Fate client carried through the ilha tree (vue-fate's `FateClient`
// provider shaped for ilha context instead of Vue props).
import { createContext } from "ilha";
import type { FateClient } from "@nkzw/fate";

/** Active Fate client (set by `<FateProvider>`). */
export type FateClientLike = FateClient<any, any>;

/** Context carrying the active Fate client. */
export const FateContext = createContext<FateClientLike | null>(null);
