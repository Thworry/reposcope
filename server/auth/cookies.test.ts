import { describe, expect, it } from "vitest";

import {
  cookieNameFor,
  readSessionCookie,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from "./cookies.js";

describe("session cookies", () => {
  it("uses a __Host cookie with production protections", () => {
    const name = cookieNameFor("production");
    const value = serializeSessionCookie(name, "A".repeat(43), 28_800, true);

    expect(name).toBe("__Host-reposcope_session");
    expect(value).toContain("HttpOnly");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain("Path=/");
    expect(value).toContain("Max-Age=28800");
    expect(value).toContain("Secure");
    expect(value).not.toContain("Domain=");
  });

  it("uses the development name without Secure in HTTP development", () => {
    const name = cookieNameFor("development");
    const value = serializeSessionCookie(name, "A".repeat(43), 10, false);

    expect(name).toBe("reposcope_session");
    expect(value).not.toContain("Secure");
  });

  it("rejects duplicate, malformed, and attacker-selected cookie values", () => {
    expect(
      readSessionCookie(
        "reposcope_session=a; reposcope_session=b",
        "reposcope_session",
      ),
    ).toBeNull();
    expect(
      readSessionCookie("reposcope_session=not base64!", "reposcope_session"),
    ).toBeNull();
    expect(readSessionCookie("other=value", "reposcope_session")).toBeNull();
  });

  it("clears cookies with the same security boundary", () => {
    expect(
      serializeClearedSessionCookie("__Host-reposcope_session", true),
    ).toBe(
      "__Host-reposcope_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure",
    );
  });
});
