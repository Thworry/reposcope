import type { ServerEnvironment } from "../config.js";

const PRODUCTION_COOKIE_NAME = "__Host-reposcope_session";
const DEVELOPMENT_COOKIE_NAME = "reposcope_session";
const SESSION_VALUE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function cookieNameFor(environment: ServerEnvironment): string {
  return environment === "production"
    ? PRODUCTION_COOKIE_NAME
    : DEVELOPMENT_COOKIE_NAME;
}

export function readSessionCookie(
  cookieHeader: string | undefined,
  cookieName: string,
): string | null {
  if (cookieHeader === undefined) {
    return null;
  }
  const matches: string[] = [];
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== cookieName) {
      continue;
    }
    matches.push(part.slice(separator + 1).trim());
  }
  if (matches.length !== 1 || !SESSION_VALUE_PATTERN.test(matches[0] ?? "")) {
    return null;
  }
  return matches[0] ?? null;
}

export function serializeSessionCookie(
  cookieName: string,
  sessionId: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  if (
    !SESSION_VALUE_PATTERN.test(sessionId) ||
    !Number.isSafeInteger(maxAgeSeconds) ||
    maxAgeSeconds <= 0
  ) {
    throw new Error("invalid-session-cookie");
  }
  return serialize(cookieName, sessionId, maxAgeSeconds, secure);
}

export function serializeClearedSessionCookie(
  cookieName: string,
  secure: boolean,
): string {
  return serialize(cookieName, "", 0, secure);
}

function serialize(
  cookieName: string,
  value: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  const parts = [
    `${cookieName}=${value}`,
    `Max-Age=${String(maxAgeSeconds)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}
