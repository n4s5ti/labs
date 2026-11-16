/**
 * Worker port of the `@oh-my-pi/pi-utils` names the agent loop imports.
 *
 * Pure functions are faithful ports of the implementations in
 * `packages/utils/src/` (same behavior, no `Buffer`/`Bun`/`node:` use).
 * `logger` is console-backed. Everything process-, terminal-, or
 * filesystem-shaped is a throwing stub — the loop path must never reach
 * it on a worker; if it does, the error says so.
 */

function isJsonRecord(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function structuredCloneJSON<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (isJsonRecord(value) || Array.isArray(value)) {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to JSON round-trip.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneJsonNode(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJsonNode);
  if (!isJsonRecord(value)) return structuredCloneJSON(value);
  const out: Record<string, unknown> = {};
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    const child = cloneJsonNode((value as Record<string, unknown>)[key]);
    if (key === "__proto__") {
      Object.defineProperty(out, key, { value: child, enumerable: true, writable: true, configurable: true });
    } else {
      out[key] = child;
    }
  }
  return out;
}

export function cloneJsonTree<T>(value: T): T {
  return cloneJsonNode(value) as T;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function stringProperty(value: object, key: string): string | undefined {
  const field = Object.getOwnPropertyDescriptor(value, key)?.value;
  return typeof field === "string" ? field : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

const CONTROL_RE = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/g;
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

export function sanitizeText(text: string): string {
  const wellFormed = text.toWellFormed().replaceAll("\ufffd", "");
  CONTROL_RE.lastIndex = 0;
  if (CONTROL_RE.exec(wellFormed) === null && !wellFormed.includes("")) return wellFormed;
  const stripped = wellFormed.replace(ANSI_RE, "");
  CONTROL_RE.lastIndex = 0;
  return stripped.replace(CONTROL_RE, "");
}

export function sanitizeTextDeep(value: unknown): unknown {
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = sanitizeTextDeep(item);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? out : value;
  }
  if (isRecord(value)) {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const next = sanitizeTextDeep(value[key]);
      if (next !== value[key]) changed = true;
      out[key] = next;
    }
    return changed ? out : value;
  }
  return value;
}

export function materializeString(text: string): string {
  // Workers strings need no flattening; identity preserves the contract.
  return text;
}

export function stringifyJson(value: unknown, space?: string | number): string | undefined {
  try {
    return JSON.stringify(value, undefined, space);
  } catch {
    return JSON.stringify(value, (_key, nested) => (typeof nested === "bigint" ? Number(nested) : nested), space);
  }
}

export function untilAborted<T>(signal: AbortSignal | undefined | null, pr: Promise<T> | (() => Promise<T>)): Promise<T> {
  if (!signal) return typeof pr === "function" ? pr() : pr;
  if (signal.aborted) {
    if (typeof pr !== "function") void pr.catch(() => {});
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    (typeof pr === "function" ? pr() : pr).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

type LogMethod = (message: string, ...args: unknown[]) => void;

export interface WorkerLogger {
  readonly debug: LogMethod;
  readonly info: LogMethod;
  readonly warn: LogMethod;
  readonly error: LogMethod;
}

function logMethod(level: "debug" | "info" | "warn" | "error"): LogMethod {
  return (message, ...args) => {
    console[level]("[omp]", message, ...args);
  };
}

export const logger: WorkerLogger = {
  debug: logMethod("debug"),
  info: logMethod("info"),
  warn: logMethod("warn"),
  error: logMethod("error"),
};

/** Anything below is process/terminal/filesystem-shaped: unreachable on workers. */
function unreachable(name: string): never {
  throw new Error(`${name} is unavailable in the worker runtime (no process, terminal, or local fs)`);
}

export const $env: Record<string, string | undefined> = new Proxy(
  {},
  { get: (_target, property) => (typeof property === "string" ? undefined : undefined) },
);
export const $otelEnv: Record<string, string | undefined> = {};

export function $flag(_name: string, def = false): boolean {
  // Workers read config from the `env` binding, not `process.env`;
  // the stub `$env` above is always empty, so flags take their default.
  return def;
}

export function getLogsDir(): string {
  // No user log dir in an isolate; callers use it for debug dumps only.
  return "/tmp";
}

// Pure deep modules re-exported verbatim (each imports only
// `node:timers/promises` or nothing — both worker-safe).
export { classifyJsonPrefix, parseJsonWithRepair } from "@oh-my-pi/pi-utils/json-parse";
export { escapeXmlText } from "@oh-my-pi/pi-utils/sanitize-text";
export { extractRetryHint, isRetryableError, isUnexpectedSocketCloseMessage } from "@oh-my-pi/pi-utils/fetch-retry";
export { isEnoent } from "@oh-my-pi/pi-utils/fs-error";
export { isBunTestRuntime } from "@oh-my-pi/pi-utils/test-runtime";

export function wrapFetchForExtraCa<T extends (...args: never[]) => unknown>(_fetch: T, _init?: unknown): T {
  // Custom CA bundles are files on disk; isolates terminate TLS at the
  // platform instead. Identity is the correct worker behavior.
  return _fetch;
}
export const prompt: (...args: unknown[]) => Promise<never> = async () => unreachable("prompt()");
export const ptree: Record<string, (...args: unknown[]) => never> = new Proxy(
  {},
  {
    get: () => () => unreachable("ptree"),
  },
);
export const procmgr: Record<string, (...args: unknown[]) => never> = new Proxy(
  {},
  {
    get: () => () => unreachable("procmgr"),
  },
);
export function withLoopPhase<T>(_phase: string, fn: () => T): T {
  return fn();
}
type HttpErrorLike = {
  message?: string;
  name?: string;
  status?: number | string;
  statusCode?: number | string;
  response?: { status?: number | string };
  cause?: unknown;
};

const STATUS_MESSAGE_PATTERNS = [
  /\berror\s*[:=]\s*(\d{3})\b/i,
  /error\s*\((\d{3})\)/i,
  /status\s*[:=]?\s*(\d{3})/i,
  /\bhttp\s*(\d{3})\b/i,
  /\b(\d{3})\s*(?:status|error)\b/i,
] as const;

function extractStatusFromMessage(message: string): number | undefined {
  for (const pattern of STATUS_MESSAGE_PATTERNS) {
    const match = pattern.exec(message);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value >= 100 && value <= 599) return value;
  }
  return undefined;
}

function extractInternal(error: unknown, depth: number): number | undefined {
  if (!error || typeof error !== "object" || depth > 2) return undefined;
  const info = error as HttpErrorLike;
  const rawStatus = info.status ?? info.statusCode ?? info.response?.status;
  let status: number | undefined;
  if (typeof rawStatus === "number" && Number.isFinite(rawStatus)) {
    status = rawStatus;
  } else if (typeof rawStatus === "string") {
    const parsed = Number(rawStatus);
    if (Number.isFinite(parsed)) status = parsed;
  }
  if (status !== undefined && status >= 100 && status <= 599) return status;
  if (info.message) {
    const extracted = extractStatusFromMessage(info.message);
    if (extracted !== undefined) return extracted;
  }
  if (info.cause) return extractInternal(info.cause, depth + 1);
  return undefined;
}

export function extractHttpStatusFromError(error: unknown): number | undefined {
  return extractInternal(error, 0);
}

export function parseImageMetadata(_header: Uint8Array): null {
  // Image byte-sniffing needs the bytes, which arrive through tool results
  // already decoded; header-only probing has no worker caller on this path.
  return null;
}
