import { describe, expect, it } from "vitest";

import { extractManifestFacts } from "./manifest-facts.js";

describe("extractManifestFacts", () => {
  it("extracts only allowlisted package.json fields and never emits the whole manifest", () => {
    const text = JSON.stringify({
      name: "safe-package",
      description: "MUST NOT APPEAR",
      engines: { node: ">=24" },
      dependencies: { hono: "4.13.3" },
      scripts: { test: "vitest run" },
      privateSecret: "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB",
    });
    const facts = extractManifestFacts({
      path: "package.json",
      text,
      bytes: new TextEncoder().encode(text).byteLength,
      kind: "manifest",
    });
    const output = JSON.stringify(facts);
    expect(output).toContain("safe-package");
    expect(output).toContain("node >=24");
    expect(output).toContain("hono 4.13.3");
    expect(output).toContain("test: vitest run");
    expect(output).not.toContain("MUST NOT APPEAR");
    expect(output).not.toContain("ghp_");
  });

  it("extracts allowlisted TOML project, runtime, dependency, and entry-point facts", () => {
    const text = [
      "[project]",
      'name = "sample"',
      'requires-python = ">=3.12"',
      'dependencies = ["httpx>=0.27"]',
      "[project.scripts]",
      'sample = "sample.cli:main"',
      "[untrusted]",
      'secret = "xoxb-1234567890123456"',
    ].join("\n");
    const facts = extractManifestFacts({
      path: "pyproject.toml",
      text,
      bytes: new TextEncoder().encode(text).byteLength,
      kind: "manifest",
    });
    const output = JSON.stringify(facts);
    expect(output).toContain("sample");
    expect(output).toContain("Python >=3.12");
    expect(output).toContain("httpx>=0.27");
    expect(output).toContain("sample: sample.cli:main");
    expect(output).not.toContain("xoxb-");
  });

  it("returns no facts for malformed or non-allowlisted manifests", () => {
    expect(
      extractManifestFacts({
        path: "package.json",
        text: '{"name":',
        bytes: 8,
        kind: "manifest",
      }),
    ).toEqual([]);
    expect(
      extractManifestFacts({
        path: "config.yaml",
        text: "name: unsafe",
        bytes: 12,
        kind: "manifest",
      }),
    ).toEqual([]);
  });

  it("rejects manifests whose actual UTF-8 body exceeds the bound even if bytes lies", () => {
    const text = JSON.stringify({
      name: "oversized",
      padding: "x".repeat(256 * 1024),
    });
    expect(
      extractManifestFacts({
        path: "package.json",
        text,
        bytes: 1,
        kind: "manifest",
      }),
    ).toEqual([]);
  });
});
