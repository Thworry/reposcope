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
        hasTestCommand: false,
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

  it("requires field-specific non-empty package and Python entry targets", () => {
    expect(
      readPackageJsonEvidence(
        JSON.stringify({
          main: {},
          module: [],
          browser: { client: false },
          bin: { cli: 1 },
          exports: { ".": [null, "", { browser: "./browser.js" }] },
        }),
      ),
    ).toMatchObject({ evidence: { hasStructuredEntryPoint: true } });
    expect(
      readPackageJsonEvidence(
        JSON.stringify({
          main: {},
          module: [],
          browser: { client: false },
          bin: { cli: 1 },
          exports: [null, "", { invalid: 1 }],
        }),
      ),
    ).toMatchObject({ evidence: { hasStructuredEntryPoint: false } });
    expect(
      readPyprojectTomlEvidence(
        '[project.scripts]\nvalid = "pkg.cli:main"\ninvalid = 3',
      ),
    ).toMatchObject({ evidence: { hasStructuredEntryPoint: true } });
    expect(
      readPyprojectTomlEvidence('[project.scripts]\ninvalid = 3\nempty = ""'),
    ).toMatchObject({ evidence: { hasStructuredEntryPoint: false } });
  });

  it("fails closed on deeply nested and overly wide export targets", () => {
    const deep = `{"exports":${"[".repeat(5_000)}"./index.js"${"]".repeat(5_000)}}`;
    const wideEntries = Array.from(
      { length: 9_000 },
      (_, index) => `"k${String(index)}":null`,
    ).join(",");
    const wide = `{"exports":{${wideEntries}}}`;

    expect(new TextEncoder().encode(deep).byteLength).toBeLessThan(256 * 1024);
    expect(new TextEncoder().encode(wide).byteLength).toBeLessThan(256 * 1024);
    expect(readPackageJsonEvidence(deep)).toMatchObject({
      evidence: { hasStructuredEntryPoint: false },
      failure: "json",
    });
    expect(readPackageJsonEvidence(wide)).toMatchObject({
      evidence: { hasStructuredEntryPoint: false },
      failure: "json",
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
      usageCommand: false,
      usageConcreteExample: true,
      usageCommandOrExample: true,
      usageProseDescription: false,
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

  it("does not treat a documented command alone as a concrete example", () => {
    const metrics = analyzeGeneralRepository({
      repository,
      tree: tree("README.md"),
      files: [fetchedTextFile("README.md", "## Usage\n```sh\nnpm test\n```")],
    });

    expect(metrics.usageCommandOrExample).toBe(true);
    expect(metrics.hasExample).toBe(false);
  });

  it("distinguishes an empty Usage heading from explanatory Usage prose", () => {
    const headingOnly = analyzeGeneralRepository({
      repository,
      tree: tree("README.md"),
      files: [fetchedTextFile("README.md", "## Usage")],
    });
    const prose = analyzeGeneralRepository({
      repository,
      tree: tree("README.md"),
      files: [
        fetchedTextFile(
          "README.md",
          "## Usage\nRun the scanner against a public repository URL.",
        ),
      ],
    });

    expect(headingOnly.usageProseDescription).toBe(false);
    expect(prose.usageProseDescription).toBe(true);
  });

  it("ignores every positive fact below excluded generated/dependency paths", () => {
    const inputTree = tree(
      "README.md",
      "package.json",
      "vendor/package.json",
      "vendor/pnpm-lock.yaml",
      "vendor/codecov.yml",
      "vendor/pytest.ini",
      "vendor/ruff.toml",
      "vendor/.env.example",
      "vendor/examples/demo.ts",
      "vendor/src/index.ts",
      "dist/app.js",
      "build/app.js",
      ".venv/app.py",
    );
    const metrics = analyzeGeneralRepository({
      repository,
      tree: inputTree,
      files: [
        fetchedTextFile("README.md", "# Repo"),
        fetchedTextFile("package.json", '{"scripts":{}}', {
          category: "manifest",
        }),
        fetchedTextFile("vendor/package.json", malformedPackageJson, {
          category: "manifest",
        }),
        fetchedTextFile("vendor/examples/demo.ts", "scan('repo');", {
          language: "typescript",
          category: "source",
        }),
        fetchedTextFile("vendor/src/index.ts", "export const x = 1;", {
          language: "typescript",
          category: "source",
        }),
      ],
    });

    expect(metrics).toMatchObject({
      hasReadme: true,
      hasManifest: true,
      hasStructuredEntryPoint: false,
      hasConventionalEntryPoint: false,
      hasExample: false,
      hasConfigurationEvidence: false,
      hasTestConfiguration: false,
      hasStaticCheckCommand: false,
      hasCoverageEvidence: false,
      hasLockfile: false,
      testFileCount: 0,
      supportedSourceFileCount: 0,
      committedGeneratedDirectoryCount: 4,
      parseFailures: [],
    });
  });

  it.each([
    ["npm test", false, false, true, false],
    ["npm run lint", false, false, false, true],
    ["npm run typecheck", false, false, false, true],
    ["pnpm run test", false, false, true, false],
    ["pnpm lint", false, false, false, true],
    ["pnpm type-check", false, false, false, true],
    ["yarn test", false, false, true, false],
    ["yarn run test", false, false, true, false],
    ["yarn lint", false, false, false, true],
    ["yarn typecheck", false, false, false, true],
    ["bun test", false, false, true, false],
    ["bun run test", false, false, true, false],
    ["bun lint", false, false, false, true],
    ["bun run typecheck", false, false, false, true],
    ["npm run dev", true, false, false, false],
    ["pnpm run build", false, true, false, false],
    ["pytest", false, false, true, false],
    ["tox", false, false, true, false],
    ["nox", false, false, true, false],
    ["python -m unittest", false, false, true, false],
    ["python3 -m pytest", false, false, true, false],
    ["unittest", false, false, true, false],
    ["python -m tox", false, false, true, false],
    ["python -m nox", false, false, true, false],
    ["ruff check .", false, false, false, true],
    ["python -m ruff check .", false, false, false, true],
    ["python -m black --check .", false, false, false, true],
    ["python -m pip install pkg", false, false, false, false],
    ["python --version", false, false, false, false],
    ["python", false, false, false, false],
    ["python script.py", true, false, false, false],
    ["python runner.py -m pytest", true, false, false, false],
    ["node app.js", true, false, false, false],
    ["node --test", false, false, true, false],
    ["node --version", false, false, false, false],
    ["node", false, false, false, false],
    ["deno run app.ts", true, false, false, false],
    ["deno test", false, false, true, false],
    ["deno --version", false, false, false, false],
    ["go run .", true, false, false, false],
    ["go build ./...", false, true, false, false],
    ["go test ./...", false, false, true, false],
    ["cargo run", true, false, false, false],
    ["cargo build", false, true, false, false],
    ["cargo test", false, false, true, false],
    ["mvn exec:java", true, false, false, false],
    ["mvn package", false, true, false, false],
    ["mvn test", false, false, true, false],
    ["gradlew run", true, false, false, false],
    ["gradle build", false, true, false, false],
    ["gradle test", false, false, true, false],
    ["./gradlew test", false, false, true, false],
    ["dotnet run", true, false, false, false],
    ["dotnet build", false, true, false, false],
    ["dotnet test", false, false, true, false],
    ["swift run", true, false, false, false],
    ["swift build", false, true, false, false],
    ["swift test", false, false, true, false],
    ["docker run image", true, false, false, false],
    ["docker build .", false, true, false, false],
    ["docker-compose up", true, false, false, false],
    ["docker-compose build", false, true, false, false],
    ["docker compose build", false, true, false, false],
    ["black --check .", false, false, false, true],
  ])(
    "classifies documented command %s without cross-granting",
    (command, run, build, test, staticCheck) => {
      const metrics = analyzeGeneralRepository({
        repository,
        tree: tree("README.md"),
        files: [
          fetchedTextFile(
            "README.md",
            `## Usage\n\`\`\`sh\n${command}\n\`\`\``,
          ),
        ],
      });

      expect({
        run: metrics.hasDocumentedRunCommand,
        build: metrics.hasDocumentedBuildCommand,
        test: metrics.hasDocumentedTestCommand,
        staticCheck: metrics.hasDocumentedStaticCheckCommand,
      }).toEqual({ run, build, test, staticCheck });
    },
  );
});
