import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface AppLogger {
  readonly info: (
    event: string,
    details?: Readonly<Record<string, boolean | number | string>>,
  ) => void;
  readonly error: (
    event: string,
    details?: Readonly<Record<string, boolean | number | string>>,
  ) => void;
}

export type HttpErrorKind =
  | "internal"
  | "invalid-request"
  | "not-found"
  | "origin-not-allowed"
  | "payload-too-large";

export class HttpBoundaryError extends Error {
  readonly status: ContentfulStatusCode;
  readonly kind: HttpErrorKind;

  constructor(status: ContentfulStatusCode, kind: HttpErrorKind) {
    super(kind);
    this.name = "HttpBoundaryError";
    this.status = status;
    this.kind = kind;
  }
}

export interface HttpSecurityOptions {
  readonly apiOrigin: string;
  readonly frontendOrigin: string;
  readonly logger: AppLogger;
}

export const API_BODY_LIMIT_BYTES = 64 * 1_024;

function appendVaryOrigin(headers: Headers): void {
  const vary = headers.get("Vary");
  if (vary === null) {
    headers.set("Vary", "Origin");
  } else if (!vary.split(",").some((value) => value.trim() === "Origin")) {
    headers.set("Vary", `${vary}, Origin`);
  }
}

export function installHttpSecurity(
  app: Hono,
  options: HttpSecurityOptions,
): void {
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'none'"],
      },
      crossOriginResourcePolicy: "same-site",
      strictTransportSecurity: new URL(options.apiOrigin).protocol === "https:",
      xFrameOptions: "DENY",
    }),
  );

  app.use("/api/v1/session", async (context, next) => {
    await next();
    context.header("Cache-Control", "no-store");
  });
  app.use("/api/v1/auth/*", async (context, next) => {
    await next();
    context.header("Cache-Control", "no-store");
  });

  app.use("/api/*", async (context, next) => {
    const origin = context.req.header("Origin");
    const stateChanging =
      context.req.method !== "GET" &&
      context.req.method !== "HEAD" &&
      context.req.method !== "OPTIONS";
    if (
      (origin !== undefined && origin !== options.frontendOrigin) ||
      (stateChanging && origin === undefined)
    ) {
      throw new HttpBoundaryError(403, "origin-not-allowed");
    }

    if (context.req.method === "OPTIONS") {
      context.header("Access-Control-Allow-Origin", options.frontendOrigin);
      context.header("Access-Control-Allow-Credentials", "true");
      context.header(
        "Access-Control-Allow-Methods",
        "GET, HEAD, POST, OPTIONS",
      );
      context.header(
        "Access-Control-Allow-Headers",
        "Content-Type, X-RepoScope-CSRF",
      );
      context.header("Access-Control-Max-Age", "600");
      appendVaryOrigin(context.res.headers);
      return context.body(null, 204);
    }

    await next();
    appendVaryOrigin(context.res.headers);
    if (origin === options.frontendOrigin) {
      context.header("Access-Control-Allow-Origin", options.frontendOrigin);
      context.header("Access-Control-Allow-Credentials", "true");
    }
  });

  app.use(
    "/api/*",
    bodyLimit({
      maxSize: API_BODY_LIMIT_BYTES,
      onError: (context) =>
        context.json({ error: { kind: "payload-too-large" } } as const, 413),
    }),
  );
}

export function mapHttpError(
  error: Error,
  context: Context,
  logger: AppLogger,
): Response {
  if (error instanceof HttpBoundaryError) {
    return context.json({ error: { kind: error.kind } }, error.status);
  }

  logger.error("Unhandled request error", { errorType: error.name });
  return context.json({ error: { kind: "internal" } } as const, 500);
}
