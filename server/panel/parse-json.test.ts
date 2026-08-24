import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  JSON_REPAIR_MAX_BYTES,
  StrictJsonObjectError,
  buildInvalidJsonRepairPayload,
  parseStrictJsonObject,
  snapshotJsonData,
} from "./parse-json.js";

describe("parseStrictJsonObject", () => {
  it("accepts one whitespace-surrounded object and returns detached data", () => {
    const parsed = parseStrictJsonObject(' \n {"ok":true,"nested":[1]}\r\n');

    expect(parsed).toEqual({ ok: true, nested: [1] });
    expect(Object.getPrototypeOf(parsed)).toBeNull();
  });

  it.each([
    "[]",
    "null",
    '"text"',
    "```json\n{}\n```",
    "result: {}",
    "{} trailing",
    "{} {}",
    "\uFEFF{}",
    '{"a":1}\u00a0',
  ])("rejects non-object envelopes: %j", (input) => {
    expect(() => parseStrictJsonObject(input)).toThrow(StrictJsonObjectError);
  });

  it("rejects invalid UTF-8, byte overflow, raw controls, and excessive depth", () => {
    expect(() =>
      parseStrictJsonObject(Uint8Array.from([0x7b, 0xc3, 0x28, 0x7d])),
    ).toThrow(StrictJsonObjectError);
    expect(() =>
      parseStrictJsonObject(Uint8Array.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])),
    ).toThrow(StrictJsonObjectError);
    expect(() => parseStrictJsonObject('{"x":"1234"}', 4)).toThrow(
      StrictJsonObjectError,
    );
    expect(() => parseStrictJsonObject('{"x":"\u0001"}')).toThrow(
      StrictJsonObjectError,
    );
    const nested = `${'{"x":'.repeat(65)}0${"}".repeat(65)}`;
    expect(() => parseStrictJsonObject(nested)).toThrow(StrictJsonObjectError);
  });

  it("rejects duplicate object keys, including equivalent escaped keys", () => {
    expect(() =>
      parseStrictJsonObject('{"role":"first","role":"last"}'),
    ).toThrow(StrictJsonObjectError);
    expect(() => parseStrictJsonObject('{"name":1,"n\\u0061me":2}')).toThrow(
      StrictJsonObjectError,
    );
  });

  it("does not invoke proxy traps or typed-array shadow accessors", () => {
    let reads = 0;
    const proxy = new Proxy(new Uint8Array(Buffer.from("{}")), {
      get() {
        reads += 1;
        throw new Error("proxy trap must not run");
      },
      getPrototypeOf() {
        reads += 1;
        throw new Error("proxy trap must not run");
      },
    });
    const shadowed = new Uint8Array(Buffer.from("{}"));
    Object.defineProperty(shadowed, "byteLength", {
      get() {
        reads += 1;
        throw new Error("shadow accessor must not run");
      },
    });

    expect(() => parseStrictJsonObject(proxy)).toThrow(StrictJsonObjectError);
    expect(parseStrictJsonObject(shadowed)).toEqual({});
    expect(buildInvalidJsonRepairPayload(proxy)).toBe(
      "[invalid output omitted]",
    );
    expect(buildInvalidJsonRepairPayload(shadowed)).toBe("{}");
    expect(reads).toBe(0);
  });
});

describe("snapshotJsonData", () => {
  it("does not invoke accessors and rejects cycles and exotic prototypes", () => {
    let reads = 0;
    const accessor = Object.defineProperty({}, "secret", {
      enumerable: true,
      get() {
        reads += 1;
        return "should-not-run";
      },
    });
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          reads += 1;
          return [];
        },
      },
    );

    expect(snapshotJsonData(accessor)).toBeNull();
    expect(snapshotJsonData(cycle)).toBeNull();
    expect(snapshotJsonData(new Date())).toBeNull();
    expect(snapshotJsonData(proxy)).toBeNull();
    expect(snapshotJsonData(JSON.parse('{"\\ud800":1}'))).toBeNull();
    expect(reads).toBe(0);
  });
});

describe("buildInvalidJsonRepairPayload", () => {
  it("filters token, assignment, and private-key material without logging it", () => {
    const githubToken = `ghp_${"a".repeat(36)}`;
    const source = [
      '{"useful":"keep",',
      `"token":"${githubToken}",`,
      '"password":"very-secret-password",',
      '"pem":"-----BEGIN PRIVATE KEY-----',
      "not-a-real-key",
      '-----END PRIVATE KEY-----"}',
    ].join("\n");
    const payload = buildInvalidJsonRepairPayload(source);

    expect(payload).not.toContain(githubToken);
    expect(payload).not.toContain("very-secret-password");
    expect(payload).not.toContain("not-a-real-key");
    expect(payload).toContain("omitted");
  });

  it("caps UTF-8 bytes without cutting a multibyte code point", () => {
    const payload = buildInvalidJsonRepairPayload(
      `{"x":"${"界".repeat(50_000)}`,
    );

    expect(Buffer.byteLength(payload, "utf8")).toBeLessThanOrEqual(
      JSON_REPAIR_MAX_BYTES,
    );
    expect(payload).toContain("[output truncated]");
    expect(payload).not.toContain("�");
  });

  it("omits invalid UTF-8 instead of passing replacement bytes to a model", () => {
    const payload = buildInvalidJsonRepairPayload(
      Uint8Array.from([0xff, 0xfe, 0xfd]),
    );

    expect(payload).toBe("[invalid output omitted]");
  });

  it.each([
    "AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwxyz1234567890ABCD",
    '{"AWS_SECRET_ACCESS_KEY":"abcdefghijklmnopqrstuvwxyz1234567890ABCD"',
    "DATABASE_URL=postgres://user:supersecret@example.test/database",
  ])(
    "fails closed for provider-prefixed credential assignments: %s",
    (source) => {
      const payload = buildInvalidJsonRepairPayload(source);

      expect(payload).toBe("[credential-bearing output omitted]");
      expect(payload).not.toContain("supersecret");
      expect(payload).not.toContain("abcdefghijklmnopqrstuvwxyz1234567890ABCD");
    },
  );
});
