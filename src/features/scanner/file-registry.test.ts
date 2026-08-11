import { describe, expect, it } from "vitest";

import {
  COMMAND_EXECUTABLES,
  COVERAGE_CONFIG_BASENAMES,
  DEEP_SOURCE_EXTENSIONS,
  DEPENDENCY_UPDATE_PATHS,
  DOCUMENTATION_EXTENSIONS,
  ENVIRONMENT_EXAMPLE_BASENAMES,
  EXCLUDED_PATH_SEGMENTS,
  HEADING_PHRASES,
  ISSUE_AND_PR_TEMPLATE_PATHS,
  LOCKFILE_BASENAMES,
  PACKAGE_MANIFEST_BASENAMES,
  PRIORITY_DOCUMENT_RULES,
  RECOGNIZED_SOURCE_EXTENSIONS,
  classifyFile,
  isExcludedPath,
  isPriorityDocumentation,
} from "./file-registry";

describe("canonical file registry", () => {
  it("publishes the exact source, exclusion, heading, and command dictionaries", () => {
    expect(DEEP_SOURCE_EXTENSIONS).toEqual([
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".ts",
      ".tsx",
      ".mts",
      ".cts",
      ".py",
    ]);
    expect(RECOGNIZED_SOURCE_EXTENSIONS).toEqual([
      ...DEEP_SOURCE_EXTENSIONS,
      ".go",
      ".rs",
      ".c",
      ".h",
      ".cc",
      ".cpp",
      ".cxx",
      ".hpp",
      ".java",
      ".kt",
      ".kts",
      ".cs",
      ".fs",
      ".fsx",
      ".rb",
      ".php",
      ".swift",
      ".dart",
      ".scala",
      ".sc",
      ".sh",
      ".bash",
      ".zsh",
      ".fish",
      ".lua",
      ".r",
      ".R",
      ".ex",
      ".exs",
      ".erl",
      ".hrl",
      ".clj",
      ".cljs",
      ".hs",
      ".lhs",
      ".vue",
      ".svelte",
      ".astro",
    ]);
    expect(EXCLUDED_PATH_SEGMENTS).toEqual([
      ".git",
      ".hg",
      ".svn",
      "node_modules",
      "vendor",
      "third_party",
      "dist",
      "build",
      "out",
      "coverage",
      ".coverage",
      ".cache",
      ".next",
      ".nuxt",
      "target",
      "bin",
      "obj",
      "__pycache__",
      ".venv",
      "venv",
    ]);
    expect(HEADING_PHRASES.installation.en).toEqual([
      "install",
      "installation",
      "setup",
      "getting started",
      "quick start",
      "prerequisites",
    ]);
    expect(HEADING_PHRASES.configuration["zh-CN"]).toEqual([
      "配置",
      "环境变量",
      "设置",
    ]);
    expect(COMMAND_EXECUTABLES).toContain("docker-compose");
    expect(COMMAND_EXECUTABLES).toHaveLength(27);
    expect(DOCUMENTATION_EXTENSIONS).toContain(".md");
    expect(PRIORITY_DOCUMENT_RULES.readme).toMatchObject({
      scopes: ["", ".github"],
      prefixes: ["readme"],
      match: "begins",
    });
    expect(COVERAGE_CONFIG_BASENAMES).toEqual([
      ".coveragerc",
      "coverage.xml",
      "codecov.yml",
      "codecov.yaml",
      ".codecov.yml",
      ".codecov.yaml",
    ]);
    expect(DEPENDENCY_UPDATE_PATHS).toHaveLength(7);
    expect(ISSUE_AND_PR_TEMPLATE_PATHS).toHaveLength(3);
    expect(ENVIRONMENT_EXAMPLE_BASENAMES).toEqual([
      ".env.example",
      ".env.sample",
    ]);
  });

  it("classifies deep and recognized source without conflating unsupported code", () => {
    expect(classifyFile("src/main.ts", 1_200)).toMatchObject({
      eligible: true,
      language: "typescript",
      category: "source",
      deep: true,
      isTest: false,
    });
    expect(classifyFile("tests/test_main.py", 200)).toMatchObject({
      eligible: true,
      language: "python",
      category: "test",
      deep: true,
      isTest: true,
    });
    expect(classifyFile("cmd/server.GO", 200)).toMatchObject({
      eligible: false,
      language: "recognized-unsupported",
      category: "source",
      deep: false,
      skipReason: "unsupported",
    });
    expect(classifyFile("types/index.d.ts", 200)).toMatchObject({
      eligible: true,
      language: "typescript",
      category: "source",
      deep: false,
    });
  });

  it("recognizes canonical repository evidence case-insensitively", () => {
    for (const path of [
      "README.md",
      ".github/readme.MD",
      "LICENSE.txt",
      "docs/CONTRIBUTING.rst",
      "docs/SECURITY.md",
      ".github/CODE_OF_CONDUCT.md",
      "docs/CHANGELOG.md",
      "ARCHITECTURE.adoc",
    ]) {
      expect(classifyFile(path, 100), path).toMatchObject({
        eligible: true,
        category: "documentation",
      });
    }

    expect(isPriorityDocumentation("README.zh-CN.md")).toBe(true);
    expect(isPriorityDocumentation("docs/SECURITY_POLICY.md")).toBe(false);

    for (const path of [
      "package.json",
      "pyproject.toml",
      "Taskfile.yml",
      "Example.csproj",
      "Example.sln",
    ]) {
      expect(classifyFile(path, 100), path).toMatchObject({
        eligible: true,
        category: "manifest",
      });
    }

    for (const path of [
      ".github/workflows/ci.yml",
      ".github/dependabot.yaml",
      ".github/ISSUE_TEMPLATE/bug.yml",
      ".coveragerc",
      "vitest.config.ts",
      ".env.example",
      "config.sample.yaml",
    ]) {
      expect(classifyFile(path, 100), path).toMatchObject({
        eligible: true,
        category: "configuration",
      });
    }
  });

  it("keeps lockfiles as tree evidence without selecting their bodies", () => {
    expect(LOCKFILE_BASENAMES).toContain("pnpm-lock.yaml");
    expect(PACKAGE_MANIFEST_BASENAMES).toContain("Package.swift");
    expect(classifyFile("pnpm-lock.yaml", 10)).toMatchObject({
      eligible: false,
      language: "none",
      category: "configuration",
      treeEvidence: "lockfile",
    });
  });

  it("excludes every canonical path segment and binary/generated bodies", () => {
    for (const segment of EXCLUDED_PATH_SEGMENTS) {
      expect(isExcludedPath(`src/${segment}/file.ts`), segment).toBe(true);
      expect(
        classifyFile(`src/${segment}/file.ts`, 10).skipReason,
        segment,
      ).toBe("excluded");
    }
    expect(isExcludedPath("src/VENDOR/file.ts")).toBe(true);
    expect(isExcludedPath("src/vendorized/file.ts")).toBe(false);
    expect(classifyFile("web/app.min.js", 10).skipReason).toBe("excluded");
    expect(classifyFile("web/app.js.map", 10).skipReason).toBe("binary");
    expect(classifyFile("assets/logo.png", 10).skipReason).toBe("binary");
    expect(classifyFile("notes.unknown", 10).skipReason).toBe("unsupported");
  });
});
