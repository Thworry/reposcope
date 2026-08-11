import { describe, expect, it } from "vitest";

import type {
  NormalizedTree,
  NormalizedTreeFile,
  RepositoryMetadata,
} from "../analysis/model";
import {
  englishReadme,
  fetchedTextFile,
  malformedPackageJson,
  malformedPyprojectToml,
  validPackageJson,
  validPyprojectToml,
} from "../../test/fixtures/text-files";
import {
  analyzeGeneralRepository,
  readPackageJsonEvidence,
  readPyprojectTomlEvidence,
} from "./general";

const repository: RepositoryMetadata = {
  owner: "owner",
  repo: "repo",
  name: "repo",
  fullName: "owner/repo",
  url: "https://github.com/owner/repo",
  description: "Fixture",
  defaultBranch: "main",
  archived: false,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  pushedAt: "2026-08-01T00:00:00Z",
  size: 10,
  openIssuesCount: 0,
  topics: [],
  licenseSpdxId: "MIT",
};

function treeFile(path: string, index: number): NormalizedTreeFile {
  return {
    path,
    sha: index.toString(16).padStart(40, "0"),
    size: 32,
    mode: "100644",
  };
}

function tree(...paths: string[]): NormalizedTree {
  return {
    complete: true,
    files: paths.map(treeFile),
    skippedEntries: [],
  };
}

describe("structured manifest evidence", () => {
  it("reads validated package.json entry, scripts, coverage, and version facts", () => {
    expect(readPackageJsonEvidence(validPackageJson)).toEqual({
      evidence: {
        hasStructuredEntryPoint: true,
        hasRunCommand: true,
        hasBuildCommand: true,
        hasTestCommand: true,
        hasStaticCheckCommand: true,
        hasCoverageEvidence: true,
        hasManifestVersion: true,
        hasTestConfiguration: false,
      },
      failure: null,
    });
  });

  it("reads validated pyproject entry, test, static-check, coverage, and version facts", () => {
    expect(readPyprojectTomlEvidence(validPyprojectToml)).toEqual({
      evidence: {
        hasStructuredEntryPoint: true,
        hasRunCommand: false,
        hasBuildCommand: false,
        hasTestCommand: true,
        hasStaticCheckCommand: true,
        hasCoverageEvidence: true,
        hasManifestVersion: true,
        hasTestConfiguration: true,
      },
      failure: null,
    });
  });

  it("rejects malformed and hostile structured values without throwing", () => {
    expect(readPackageJsonEvidence(malformedPackageJson)).toMatchObject({
      failure: "json",
    });
    expect(readPackageJsonEvidence("[]")).toMatchObject({ failure: "json" });
    expect(readPackageJsonEvidence('{"scripts":"npm test"}')).toMatchObject({
      evidence: { hasTestCommand: false },
      failure: null,
    });
    expect(readPyprojectTomlEvidence(malformedPyprojectToml)).toMatchObject({
      failure: "toml",
    });
  });

  it("rejects placeholder versions and empty entry points", () => {
    expect(
      readPackageJsonEvidence(
        JSON.stringify({ version: "0.0.0", main: "", scripts: {} }),
      ),
    ).toMatchObject({
      evidence: {
        hasManifestVersion: false,
        hasStructuredEntryPoint: false,
      },
    });
  });

  it("keeps script-key matching case-sensitive and follows static prefixes", () => {
    expect(
      readPackageJsonEvidence(
        JSON.stringify({
          scripts: {
            Test: "vitest run",
            BUILD: "tsc",
            "lint-staged": "eslint .",
          },
        }),
      ),
    ).toMatchObject({
      evidence: {
        hasBuildCommand: false,
        hasTestCommand: false,
        hasStaticCheckCommand: true,
      },
    });
  });
});

describe("general repository evidence", () => {
  it("extracts every deterministic general rule fact from tree and text", () => {
    const inputTree = tree(
      "README.md",
      "LICENSE.md",
      "docs/CONTRIBUTING.md",
      "docs/SECURITY.md",
      ".github/CODE_OF_CONDUCT.md",
      "package.json",
      ".env.example",
      ".github/workflows/check.yml",
      ".github/dependabot.yml",
      ".github/ISSUE_TEMPLATE/bug.md",
      "pnpm-lock.yaml",
      "CHANGELOG.md",
      "examples/basic.ts",
      "src/index.ts",
      "src/worker.py",
      "src/engine.go",
      "tests/index.test.ts",
      "tests/engine_test.go",
      "src/types.d.ts",
      "dist/app.js",
      "dist/chunk.js",
      "packages/demo/node_modules/pkg/index.js",
    );
    const files = [
      fetchedTextFile("README.md", englishReadme),
      fetchedTextFile("package.json", validPackageJson, {
        category: "manifest",
      }),
      fetchedTextFile("CHANGELOG.md", "# Changes\n\n## v1.2.0\n\n- Stable"),
      fetchedTextFile("src/index.ts", "export const value = 1;", {
        language: "typescript",
        category: "source",
      }),
      fetchedTextFile("tests/index.test.ts", "test('x', () => {});", {
        language: "typescript",
        category: "test",
        isTest: true,
      }),
    ];

    expect(
      analyzeGeneralRepository({ repository, tree: inputTree, files }),
    ).toEqual({
      hasReadme: true,
      installHeading: true,
      installCommand: true,
      usageHeading: true,
      usageCommandOrExample: true,
      hasContributing: true,
      hasLicenseFile: true,
      apiLicenseDetected: true,
      hasArchitectureEvidence: true,
      readmeTopLevelSourceAreaCount: 3,
      hasManifest: true,
      hasStructuredEntryPoint: true,
      hasConventionalEntryPoint: true,
      hasRunCommand: true,
      hasBuildCommand: true,
      hasDocumentedRunCommand: false,
      hasDocumentedBuildCommand: false,
      hasExample: true,
      hasVersionHistory: true,
      hasManifestVersion: true,
      hasConfigurationEvidence: true,
      testFileCount: 2,
      supportedSourceFileCount: 4,
      hasTestConfiguration: false,
      hasCi: true,
      hasTestCommand: true,
      hasDocumentedTestCommand: false,
      hasStaticCheckCommand: true,
      hasDocumentedStaticCheckCommand: false,
      hasCoverageEvidence: true,
      hasLockfile: true,
      hasDependencyUpdates: true,
      hasIssueOrPrTemplates: true,
      hasSecurityPolicy: true,
      hasCodeOfConduct: true,
      committedGeneratedDirectoryCount: 2,
      parseFailures: [],
    });
  });

  it("isolates malformed manifests and preserves other evidence", () => {
    const files = [
      fetchedTextFile("README.md", "## 安装\n这里只是说明。"),
      fetchedTextFile("package.json", malformedPackageJson, {
        category: "manifest",
      }),
      fetchedTextFile("pyproject.toml", malformedPyprojectToml, {
        category: "manifest",
      }),
    ];

    expect(
      analyzeGeneralRepository({
        repository: { ...repository, licenseSpdxId: null },
        tree: tree("README.md", "package.json", "pyproject.toml"),
        files,
      }),
    ).toMatchObject({
      hasReadme: true,
      installHeading: true,
      installCommand: false,
      hasManifest: true,
      hasStructuredEntryPoint: false,
      apiLicenseDetected: false,
      parseFailures: [
        { path: "package.json", reason: "json" },
        { path: "pyproject.toml", reason: "toml" },
      ],
    });
  });

  it("detects README-only test/static commands and tree configuration facts", () => {
    const readme = [
      "# Repo",
      "## Usage",
      "```sh",
      "pytest",
      "ruff check .",
      "```",
    ].join("\n");
    const metrics = analyzeGeneralRepository({
      repository,
      tree: tree(
        "README.md",
        "src/main.py",
        "pytest.ini",
        "ruff.toml",
        "codecov.yml",
        "config.sample.json",
      ),
      files: [fetchedTextFile("README.md", readme)],
    });

    expect(metrics).toMatchObject({
      hasDocumentedTestCommand: true,
      hasDocumentedStaticCheckCommand: true,
      hasStaticCheckCommand: true,
      hasTestConfiguration: true,
      hasCoverageEvidence: true,
      hasConfigurationEvidence: true,
    });
  });

  it("requires conventional entry points and path examples to be fetched selections", () => {
    const metrics = analyzeGeneralRepository({
      repository,
      tree: tree("README.md", "src/index.ts", "examples/demo.ts"),
      files: [fetchedTextFile("README.md", "# Repo\n\nNo usage section.")],
    });

    expect(metrics.hasConventionalEntryPoint).toBe(false);
    expect(metrics.hasExample).toBe(false);
  });
});
