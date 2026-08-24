import { describe, expect, it } from "vitest";

import { parseDeepAnalysisApiOrigin } from "./api-origin";

describe("parseDeepAnalysisApiOrigin", () => {
  it("keeps the feature disabled for an empty build value", () => {
    expect(parseDeepAnalysisApiOrigin("", "production")).toBeNull();
  });

  it("returns a detached canonical HTTPS origin", () => {
    const parsed = parseDeepAnalysisApiOrigin(
      "https://API.Example.test:443",
      "production",
    );

    expect(parsed?.origin).toBe("https://api.example.test");
    expect(parsed?.pathname).toBe("/");
    parsed?.searchParams.set("mutated", "yes");
    expect(
      parseDeepAnalysisApiOrigin("https://API.Example.test:443", "production")
        ?.href,
    ).toBe("https://api.example.test/");
  });

  it.each([
    "http://127.0.0.1:8787",
    "http://localhost:8787/",
    "http://[::1]:8787",
  ])("accepts canonical loopback HTTP for local validation: %s", (value) => {
    expect(parseDeepAnalysisApiOrigin(value, "production")?.protocol).toBe(
      "http:",
    );
  });

  it.each([
    " https://api.example.test",
    "https://api.example.test ",
    "http://api.example.test",
    "ftp://api.example.test",
    "https://user@api.example.test",
    "https://api.example.test/path",
    "https://api.example.test/?query=yes",
    "https://api.example.test/#fragment",
    "https://*.example.test",
    "not an origin",
  ])("rejects a non-exact or unsafe origin: %s", (value) => {
    expect(() => parseDeepAnalysisApiOrigin(value, "production")).toThrow(
      "REPOSCOPE_API_ORIGIN",
    );
  });
});
