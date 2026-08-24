import { describe, expect, it } from "vitest";

import {
  CI_PATHS,
  COMMAND_EXECUTABLES,
  COVERAGE_CONFIG_BASENAMES,
  COVERAGE_CONFIG_PREFIXES,
  DEEP_SOURCE_EXTENSIONS,
  DEPENDENCY_UPDATE_PATHS,
  DOCUMENTATION_EXTENSIONS,
  ENVIRONMENT_EXAMPLE_BASENAMES,
  ENVIRONMENT_EXAMPLE_PATTERNS,
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
  toPathComparisonKey,
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
    expect(HEADING_PHRASES).toEqual({
      installation: {
        en: [
          "install",
          "installation",
          "setup",
          "getting started",
          "quick start",
          "prerequisites",
        ],
        "zh-CN": ["安装", "配置环境", "环境要求", "准备工作", "快速开始"],
      },
      usage: {
        en: [
          "usage",
          "use",
          "run",
          "running",
          "example",
          "examples",
          "quick start",
        ],
        "zh-CN": ["使用", "用法", "运行", "示例", "快速开始"],
      },
      architecture: {
        en: [
          "architecture",
          "structure",
          "project layout",
          "repository layout",
          "codebase",
          "code map",
        ],
        "zh-CN": [
          "架构",
          "结构",
          "项目结构",
          "目录结构",
          "代码结构",
          "代码地图",
        ],
      },
      configuration: {
        en: ["configuration", "config", "environment variables", "settings"],
        "zh-CN": ["配置", "环境变量", "设置"],
      },
    });
    expect(COMMAND_EXECUTABLES).toEqual([
      "npm",
      "npx",
      "pnpm",
      "yarn",
      "bun",
      "node",
      "deno",
      "python",
      "python3",
      "pip",
      "pip3",
      "uv",
      "poetry",
      "pytest",
      "tox",
      "make",
      "just",
      "task",
      "go",
      "cargo",
      "mvn",
      "gradle",
      "gradlew",
      "dotnet",
      "swift",
      "docker",
      "docker-compose",
    ]);
    expect(DOCUMENTATION_EXTENSIONS).toEqual([
      ".md",
      ".mdx",
      ".markdown",
      ".txt",
      ".rst",
      ".adoc",
      ".asciidoc",
    ]);
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
    expect(PACKAGE_MANIFEST_BASENAMES).toEqual([
      "package.json",
      "pyproject.toml",
      "setup.py",
      "setup.cfg",
      "requirements.txt",
      "Pipfile",
      "Cargo.toml",
      "go.mod",
      "pom.xml",
      "build.gradle",
      "build.gradle.kts",
      "composer.json",
      "Gemfile",
      "Package.swift",
      "pubspec.yaml",
      "CMakeLists.txt",
      "Makefile",
      "Taskfile.yml",
      "Taskfile.yaml",
      "justfile",
    ]);
    expect(LOCKFILE_BASENAMES).toEqual([
      "pnpm-lock.yaml",
      "package-lock.json",
      "npm-shrinkwrap.json",
      "yarn.lock",
      "bun.lock",
      "bun.lockb",
      "uv.lock",
      "poetry.lock",
      "Pipfile.lock",
      "Cargo.lock",
      "go.sum",
      "composer.lock",
      "Gemfile.lock",
      "Package.resolved",
    ]);
    expect(CI_PATHS).toEqual([
      ".gitlab-ci.yml",
      ".circleci/config.yml",
      "azure-pipelines.yml",
      "Jenkinsfile",
      ".travis.yml",
      "bitbucket-pipelines.yml",
      "appveyor.yml",
    ]);
    expect(DEPENDENCY_UPDATE_PATHS).toEqual([
      ".github/dependabot.yml",
      ".github/dependabot.yaml",
      "renovate.json",
      "renovate.json5",
      ".renovaterc",
      ".renovaterc.json",
      ".renovaterc.json5",
    ]);
    expect(ISSUE_AND_PR_TEMPLATE_PATHS).toEqual([
      ".github/ISSUE_TEMPLATE/",
      ".github/PULL_REQUEST_TEMPLATE/",
      ".github/pull_request_template.md",
    ]);
    expect(COVERAGE_CONFIG_PREFIXES).toEqual([
      "jest.config.",
      "vitest.config.",
      "nyc.config.",
    ]);
    expect(ENVIRONMENT_EXAMPLE_BASENAMES).toEqual([
      ".env.example",
      ".env.sample",
    ]);
    expect(ENVIRONMENT_EXAMPLE_PATTERNS).toEqual([
      "config.example.*",
      "config.sample.*",
      "example.config.*",
      "sample.config.*",
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
    expect(toPathComparisonKey("Src/Éclair.TS")).toBe("src/éclair.ts");

    for (const path of [
      "README",
      "LICENCE",
      "COPYING",
      "docs/CONTRIBUTING",
      ".github/SECURITY",
      "docs/CODE_OF_CONDUCT",
      "docs/CHANGES",
      "HISTORY",
      "docs/RELEASES",
      "ARCHITECTURE",
    ]) {
      expect(classifyFile(path, 100), path).toMatchObject({
        eligible: true,
        category: "documentation",
      });
    }
    for (const path of [
      "docs/README",
      "docs/LICENSE",
      "src/SECURITY",
      "README.exe",
      "NOTICE",
    ]) {
      expect(classifyFile(path, 100).eligible, path).toBe(false);
    }

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
      expect(
        classifyFile(`src/${segment}/file.ts`, 10).treeEvidence,
        segment,
      ).toBe(
        [".git", ".hg", ".svn"].includes(segment)
          ? undefined
          : "generated-directory",
      );
    }
    expect(isExcludedPath("src/VENDOR/file.ts")).toBe(true);
    expect(isExcludedPath("src/ｖｅｎｄｏｒ/main.ts")).toBe(false);
    expect(classifyFile("src/ｖｅｎｄｏｒ/main.ts", 10)).toMatchObject({
      eligible: true,
      language: "typescript",
      category: "source",
    });
    expect(isExcludedPath("src/vendorized/file.ts")).toBe(false);
    expect(classifyFile("web/app.min.js", 10).skipReason).toBe("excluded");
    expect(classifyFile("web/app-min.ts", 10).skipReason).toBe("excluded");
    expect(classifyFile("web/app.minified.js", 10).skipReason).toBe("excluded");
    expect(classifyFile("web/app-minified.ts", 10).skipReason).toBe("excluded");
    expect(classifyFile("web/min.ts", 10)).toMatchObject({
      eligible: true,
      language: "typescript",
    });
    expect(classifyFile("web/admin.ts", 10)).toMatchObject({
      eligible: true,
      language: "typescript",
    });
    expect(classifyFile("web/minimal.ts", 10)).toMatchObject({
      eligible: true,
      language: "typescript",
    });
    expect(classifyFile("web/app.js.map", 10).skipReason).toBe("binary");
    expect(classifyFile("assets/logo.png", 10).skipReason).toBe("binary");
    expect(classifyFile("notes.unknown", 10).skipReason).toBe("unsupported");
  });

  it.each([
    "test/unit.ts",
    "tests/unit.ts",
    "__tests__/unit.ts",
    "spec/unit.ts",
    "specs/unit.ts",
    "src/unit.test.ts",
    "src/unit.spec.ts",
    "python/test_unit.py",
    "python/unit_test.py",
  ])("recognizes canonical test pattern %s", (path) => {
    expect(classifyFile(path, 10)).toMatchObject({
      eligible: true,
      category: "test",
      isTest: true,
    });
  });

  it.each([
    "contest/unit.ts",
    "specimen/unit.ts",
    "src/latest.ts",
    "python/tester.py",
    "python/unit_tests.py",
  ])("does not overmatch near-test path %s", (path) => {
    expect(classifyFile(path, 10)).toMatchObject({
      eligible: true,
      category: "source",
      isTest: false,
    });
  });
});
