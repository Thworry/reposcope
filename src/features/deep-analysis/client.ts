import { deepAnalysisApiOrigin } from "./api-origin";
import { DeepEventSequenceGuard, isDeepAnalysisRequest } from "./guards";
import {
  DEEP_ERROR_KINDS,
  type DeepAnalysisErrorKind,
  type DeepAnalysisEvent,
  type DeepAnalysisRequest,
  type DeepReport,
} from "./model";

export type DeepSession =
  | { status: "disabled" }
  | { status: "signed-out" }
  | { status: "ready"; csrfToken: string };

export type ReadyDeepSession = Extract<DeepSession, { status: "ready" }>;

export type DeepFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface DeepClientOptions {
  apiOrigin?: URL | null;
  fetch?: DeepFetch;
  signal?: AbortSignal;
}

export interface RunDeepAnalysisOptions extends DeepClientOptions {
  signal?: AbortSignal;
}

export interface StartGitHubAuthorizationOptions {
  apiOrigin?: URL | null;
  baseUrl?: string;
  search?: string;
  navigate?: (url: string) => void;
}

const CSRF_HEADER = "X-RepoScope-CSRF";
const MAX_NDJSON_BYTES = 2 * 1024 * 1024;
const MAX_SESSION_BYTES = 64 * 1024;

/** A local, UI-safe failure. Provider response text is never retained. */
export class DeepAnalysisClientError extends Error {
  override readonly name = "DeepAnalysisClientError";

  constructor(public readonly kind: DeepAnalysisErrorKind) {
    super(kind);
  }
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const ownKeys = Object.keys(value);
  return (
    ownKeys.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isSafeCsrfToken(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    return false;
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      return false;
    }
  }
  return true;
}

function guardSession(value: unknown): DeepSession {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !Object.prototype.hasOwnProperty.call(value, "status") ||
    typeof (value as Record<string, unknown>).status !== "string"
  ) {
    throw new DeepAnalysisClientError("internal");
  }
  const record = value as Record<string, unknown>;
  if (
    (record.status === "disabled" || record.status === "signed-out") &&
    exactRecord(record, ["status"])
  ) {
    return { status: record.status };
  }
  if (
    record.status === "ready" &&
    exactRecord(record, ["status", "csrfToken"]) &&
    isSafeCsrfToken(record.csrfToken)
  ) {
    return { status: "ready", csrfToken: record.csrfToken };
  }
  throw new DeepAnalysisClientError("internal");
}

function configuredOrigin(value: URL | null | undefined): URL | null {
  const origin = value === undefined ? deepAnalysisApiOrigin() : value;
  return origin === null ? null : new URL(`${origin.origin}/`);
}

function endpoint(origin: URL | null, path: string): URL {
  if (origin === null) throw new DeepAnalysisClientError("disabled");
  return new URL(path, origin);
}

async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A failed discard must not replace the local, status-derived error.
  }
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number,
): Promise<unknown> {
  if (response.body === null) throw new DeepAnalysisClientError("internal");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximumBytes) {
        throw new DeepAnalysisClientError("internal");
      }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Preserve the validation failure.
    }
    if (error instanceof DeepAnalysisClientError) throw error;
    throw new DeepAnalysisClientError("internal");
  } finally {
    reader.releaseLock();
  }
}

/** Reads the strictly shaped browser-visible authorization state. */
export async function getDeepSession(
  options: DeepClientOptions = {},
): Promise<DeepSession> {
  const url = endpoint(configuredOrigin(options.apiOrigin), "/api/v1/session");
  const fetchImpl = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new DeepAnalysisClientError("internal");
  }
  if (response.status !== 200) {
    await discard(response);
    throw new DeepAnalysisClientError(statusError(response.status));
  }
  return guardSession(await readBoundedJson(response, MAX_SESSION_BYTES));
}

function validBasePath(value: string): boolean {
  return (
    /^\/(?:[A-Za-z0-9._-]+\/)*$/u.test(value) &&
    !value.includes("..") &&
    !value.includes("//")
  );
}

/** Starts OAuth with a return target constrained to this release's base path. */
export function startGitHubAuthorization(
  options: StartGitHubAuthorizationOptions = {},
): void {
  const origin = configuredOrigin(options.apiOrigin);
  const baseUrl = options.baseUrl ?? import.meta.env.BASE_URL;
  if (!validBasePath(baseUrl)) throw new DeepAnalysisClientError("internal");
  const search = options.search ?? window.location.search;
  if (search !== "" && !search.startsWith("?")) {
    throw new DeepAnalysisClientError("internal");
  }
  const url = endpoint(origin, "/api/v1/auth/start");
  url.searchParams.set("returnTo", `${baseUrl}${search}`);
  const navigate =
    options.navigate ??
    ((target: string) => {
      window.location.assign(target);
    });
  navigate(url.href);
}

/** Ends the ready server session; only an exact 204 is accepted. */
export async function signOutDeepSession(
  session: ReadyDeepSession,
  options: DeepClientOptions = {},
): Promise<void> {
  const url = endpoint(configuredOrigin(options.apiOrigin), "/api/v1/sign-out");
  const fetchImpl = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      headers: { [CSRF_HEADER]: session.csrfToken },
    });
  } catch {
    throw new DeepAnalysisClientError("internal");
  }
  if (response.status !== 204) {
    await discard(response);
    throw new DeepAnalysisClientError(statusError(response.status));
  }
}

function statusError(status: number): DeepAnalysisErrorKind {
  if (status === 401 || status === 403) return "signed-out";
  if (status === 409 || status === 429) return "rate-limit";
  if (status === 412) return "repository-changed";
  if (status === 400 || status === 413 || status === 422) {
    return "invalid-evidence";
  }
  if (status === 502) return "github-unavailable";
  if (status === 503) return "copilot-unavailable";
  return "internal";
}

function signalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}

function parseEventLine(
  bytes: Uint8Array,
  guard: DeepEventSequenceGuard,
): DeepAnalysisEvent {
  let line = bytes;
  if (line.at(-1) === 0x0d) line = line.subarray(0, line.byteLength - 1);
  if (line.byteLength === 0)
    throw new DeepAnalysisClientError("invalid-evidence");

  let value: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(line);
    value = JSON.parse(text) as unknown;
  } catch {
    throw new DeepAnalysisClientError("invalid-evidence");
  }
  if (!guard.accept(value)) {
    throw new DeepAnalysisClientError("invalid-evidence");
  }
  return value;
}

/** Streams one bounded, strictly sequenced expert analysis. */
export async function runDeepAnalysis(
  request: DeepAnalysisRequest,
  session: ReadyDeepSession,
  onEvent: (event: DeepAnalysisEvent) => void,
  options: RunDeepAnalysisOptions = {},
): Promise<DeepReport> {
  if (!isDeepAnalysisRequest(request)) {
    throw new DeepAnalysisClientError("invalid-evidence");
  }
  const signal = options.signal;
  if (signalAborted(signal)) {
    throw new DeepAnalysisClientError("cancelled");
  }

  const url = endpoint(
    configuredOrigin(options.apiOrigin),
    "/api/v1/deep-analysis",
  );
  const fetchImpl = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      ...(signal === undefined ? {} : { signal }),
      headers: {
        Accept: "application/x-ndjson",
        "Content-Type": "application/json",
        [CSRF_HEADER]: session.csrfToken,
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new DeepAnalysisClientError(
      signalAborted(signal) ? "cancelled" : "internal",
    );
  }

  if (response.status !== 200) {
    await discard(response);
    throw new DeepAnalysisClientError(statusError(response.status));
  }
  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLocaleLowerCase("en-US");
  if (contentType !== "application/x-ndjson") {
    await discard(response);
    throw new DeepAnalysisClientError("invalid-evidence");
  }
  if (response.body === null) {
    throw new DeepAnalysisClientError("invalid-evidence");
  }

  const reader = response.body.getReader();
  const guard = new DeepEventSequenceGuard(request);
  const partial = new Uint8Array(MAX_NDJSON_BYTES);
  let partialLength = 0;
  let totalBytes = 0;
  let finalReport: DeepReport | null = null;
  const cancelReader = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", cancelReader, { once: true });

  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > MAX_NDJSON_BYTES) {
        throw new DeepAnalysisClientError("invalid-evidence");
      }

      let lineStart = 0;
      for (let index = 0; index < result.value.byteLength; index += 1) {
        if (result.value[index] !== 0x0a) continue;
        const segment = result.value.subarray(lineStart, index);
        if (partialLength + segment.byteLength > MAX_NDJSON_BYTES) {
          throw new DeepAnalysisClientError("invalid-evidence");
        }
        const line =
          partialLength === 0
            ? segment
            : (() => {
                partial.set(segment, partialLength);
                partialLength += segment.byteLength;
                return partial.subarray(0, partialLength);
              })();
        const event = parseEventLine(line, guard);
        partialLength = 0;
        if (event.type === "complete") {
          finalReport = event.report;
        } else {
          onEvent(event);
        }
        if (event.type === "error") {
          throw new DeepAnalysisClientError(event.error.kind);
        }
        lineStart = index + 1;
      }
      const remainder = result.value.subarray(lineStart);
      if (partialLength + remainder.byteLength > MAX_NDJSON_BYTES) {
        throw new DeepAnalysisClientError("invalid-evidence");
      }
      partial.set(remainder, partialLength);
      partialLength += remainder.byteLength;
    }

    if (partialLength > 0) {
      const event = parseEventLine(partial.subarray(0, partialLength), guard);
      if (event.type === "complete") {
        finalReport = event.report;
      } else {
        onEvent(event);
      }
      if (event.type === "error") {
        throw new DeepAnalysisClientError(event.error.kind);
      }
    }
    if (!guard.finish() || finalReport === null) {
      throw new DeepAnalysisClientError("invalid-evidence");
    }
    onEvent({ type: "complete", report: finalReport });
    return finalReport;
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Preserve the protocol or cancellation error.
    }
    if (signalAborted(signal)) {
      throw new DeepAnalysisClientError("cancelled");
    }
    if (error instanceof DeepAnalysisClientError) throw error;
    throw new DeepAnalysisClientError("invalid-evidence");
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }
}

export function isDeepAnalysisErrorKind(
  value: unknown,
): value is DeepAnalysisErrorKind {
  return typeof value === "string" && DEEP_ERROR_KINDS.includes(value as never);
}
