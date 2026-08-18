import { describe, expect, it } from "vitest";

import {
  READER_SIGNAL_IDS,
  type FetchedTextFile,
  type NormalizedTreeFile,
} from "../analysis/model";
import {
  perfectCoverage,
  perfectGeneralMetrics,
  perfectProjectBrief,
  perfectRepository,
} from "../../test/fixtures/metrics";
import {
  analyzeReaderReport,
  type ReaderReportInput,
  unavailableReaderReport,
} from "./reader-report";

const ANALYZED_AT = "2026-08-11T12:00:00.000Z";
const DAY_MS = 86_400_000;

function readerFile(
  path: string,
  text: string,
  category: "documentation" | "manifest" = "documentation",
): FetchedTextFile {
  const bytes = new TextEncoder().encode(text).byteLength;

  return {
    path,
    text,
    bytes,
    declaredSize: bytes,
    language: "none",
    category,
    isTest: false,
  };
}

function treeFile(path: string, size = 100): NormalizedTreeFile {
  return {
    path,
    sha: path.padEnd(40, "a").slice(0, 40),
    size,
    mode: "100644",
  };
}

function completeInput(): ReaderReportInput {
  const readme = readerFile(
    "README.md",
    `# Fixture

## Overview

A bounded local repository reader.

## Audience

- Repository adopters.

## Problem

- Understanding unfamiliar repositories.

## Use cases

- Review public project evidence.
- Compare repository adoption requirements.

## Features

### Reader report

- Evidence-backed project interpretation.

## Workflow

1. Fetch evidence.
2. Interpret the README.

## Architecture

The application exposes a conventional TypeScript entry point.

## Requirements

Node.js 24 or later.

## Install

\`pnpm install\`

## Usage

\`pnpm start\`

## Security

Configuration values remain outside the checked-in source.

## Limitations

Static evidence only.

## Status

Versioned methodology.
`,
  );
  const manifest = readerFile(
    "package.json",
    JSON.stringify({
      scripts: {
        start: "node dist/index.js",
        dev: "vite",
        test: "vitest",
        build: "tsc",
      },
    }),
    "manifest",
  );

  return {
    repository: {
      ...structuredClone(perfectRepository),
      topics: ["quality", "typescript"],
    },
    tree: {
      complete: true,
      skippedEntries: [],
      files: [
        treeFile("README.md", readme.bytes),
        treeFile("package.json", manifest.bytes),
        treeFile("src/index.ts"),
      ],
    },
    files: [readme, manifest],
    general: { ...perfectGeneralMetrics },
    projectBrief: structuredClone(perfectProjectBrief),
    coverage: { ...perfectCoverage },
    analyzedAt: ANALYZED_AT,
  };
}

function withReadmeText(
  input: ReaderReportInput,
  text: string,
): ReaderReportInput {
  const readme = readerFile("README.md", text);

  return {
    ...input,
    files: [readme, ...input.files.filter(({ path }) => path !== "README.md")],
    tree: {
      ...input.tree,
      files: input.tree.files.map((file) =>
        file.path === "README.md" ? treeFile("README.md", readme.bytes) : file,
      ),
    },
  };
}

function withoutOnboarding(input: ReaderReportInput): ReaderReportInput {
  return {
    ...input,
    tree: {
      ...input.tree,
      files: input.tree.files.filter(
        ({ path }) => path !== "README.md" && path !== "package.json",
      ),
    },
    files: [],
  };
}

function signalState(
  report: ReturnType<typeof analyzeReaderReport>,
  signal: (typeof READER_SIGNAL_IDS)[number],
) {
  return report.reliability.signals.find((fact) => fact.signal === signal)
    ?.state;
}

describe("analyzeReaderReport", () => {
  it("assembles the complete human-facing report in canonical order", () => {
    const report = analyzeReaderReport(completeInput());

    expect(report.community).toEqual({
      starsCount: 1_284,
      watchersCount: 37,
      forksCount: 146,
    });
    expect(report.readme).toMatchObject({
      availability: "available",
      observedManifests: ["package.json"],
      overview: [
        expect.objectContaining({ text: "A bounded local repository reader." }),
      ],
      audiences: [expect.objectContaining({ text: "Repository adopters." })],
      problems: [
        expect.objectContaining({
          text: "Understanding unfamiliar repositories.",
        }),
      ],
      useCases: [
        expect.objectContaining({ text: "Review public project evidence." }),
        expect.objectContaining({
          text: "Compare repository adoption requirements.",
        }),
      ],
      capabilityGroups: [
        {
          label: "Reader report",
          facts: [
            expect.objectContaining({
              text: "Evidence-backed project interpretation.",
            }),
          ],
        },
      ],
      workflow: [
        expect.objectContaining({ text: "Fetch evidence." }),
        expect.objectContaining({ text: "Interpret the README." }),
      ],
      dependencies: [expect.objectContaining({ text: "Node.js 24 or later." })],
      limitations: [
        expect.objectContaining({
          text: "Configuration values remain outside the checked-in source.",
        }),
        expect.objectContaining({ text: "Static evidence only." }),
      ],
      maturity: [expect.objectContaining({ text: "Versioned methodology." })],
      commentary: [
        "readme-audience-or-use-cases-documented",
        "readme-capabilities-documented",
        "readme-workflow-documented",
        "readme-external-dependencies-declared",
      ],
    });
    expect(report.reliability.status).toBe("continue-evaluation");
    expect(report.reliability.availability).toBe("available");
    expect(report.reliability.signals.map(({ signal }) => signal)).toEqual(
      READER_SIGNAL_IDS,
    );
    expect(report.scenarios.facts.map(({ text }) => text)).toEqual([
      "Review public project evidence.",
      "Compare repository adoption requirements.",
    ]);
    expect(report.architecture.excerpts.map(({ text }) => text)).toEqual([
      "The application exposes a conventional TypeScript entry point.",
    ]);
    expect(report.architecture.entryPoints).toEqual(["src/index.ts"]);
    expect(report.architecture.sourceAreas).toEqual(["src"]);
    expect(report.architecture.ecosystems).toEqual(["javascript-typescript"]);
    expect(report.gettingStarted.commands.map(({ kind }) => kind)).toEqual([
      "install",
      "run",
      "develop",
      "test",
      "build",
    ]);
    expect(report.gettingStarted.commands.slice(0, 2)).toMatchObject([
      { source: "readme", command: "pnpm install" },
      { source: "readme", command: "pnpm start" },
    ]);
    expect(report.gettingStarted.commands.slice(2)).toMatchObject([
      { source: "manifest", command: "npm run dev" },
      { source: "manifest", command: "npm run test" },
      { source: "manifest", command: "npm run build" },
    ]);
    expect(report.securityPrivacy.declarations.map(({ text }) => text)).toEqual(
      ["Configuration values remain outside the checked-in source."],
    );
    expect(report.maintenance.activity).toEqual({
      elapsedUtcDays: 10,
      band: "within-180-days",
    });
    expect(report.alternatives.searchTerms).toEqual([
      "application",
      "quality",
      "typescript",
    ]);

    const serialized = JSON.stringify(report);
    for (const forbidden of [
      '"functions"',
      '"cyclomatic"',
      '"rules"',
      '"score"',
      '"rawSource"',
      '"text":"# Fixture',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it.each([
    [180, "present", "within-180-days"],
    [181, "absent", "181-365-days"],
    [365, "absent", "181-365-days"],
    [366, "absent", "over-365-days"],
    [180 + 1 / DAY_MS, "absent", "181-365-days"],
  ] as const)(
    "uses raw elapsed UTC-day boundary %s",
    (days, activity, band) => {
      const input = completeInput();
      input.repository.pushedAt = new Date(
        Date.parse(ANALYZED_AT) - days * DAY_MS,
      ).toISOString();
      const report = analyzeReaderReport(input);

      expect(report.maintenance.activity.elapsedUtcDays).toBeCloseTo(days, 10);
      expect(report.maintenance.activity.band).toBe(band);
      expect(signalState(report, "recent-activity")).toBe(activity);
    },
  );

  it("uses the shared decisive policy for archived, license, onboarding, and verification gaps", () => {
    const archived = completeInput();
    archived.repository.archived = true;

    const unlicensed = completeInput();
    unlicensed.general.hasLicenseFile = false;
    unlicensed.general.apiLicenseDetected = false;

    const noVerification = completeInput();
    noVerification.general.testFileCount = 0;
    noVerification.general.hasCi = false;

    const ciOnly = structuredClone(noVerification);
    ciOnly.general.hasCi = true;

    expect(analyzeReaderReport(archived).reliability.status).toBe(
      "verify-before-use",
    );
    expect(analyzeReaderReport(unlicensed).reliability.status).toBe(
      "verify-before-use",
    );
    expect(
      analyzeReaderReport(withoutOnboarding(completeInput())).reliability
        .status,
    ).toBe("verify-before-use");
    expect(analyzeReaderReport(noVerification).reliability.status).toBe(
      "verify-before-use",
    );
    expect(analyzeReaderReport(ciOnly).reliability.status).toBe(
      "continue-evaluation",
    );
  });

  it.each([
    ["incomplete tree", { treeComplete: false }],
    ["selection limit", { limitReached: true }],
    ["fetch failure", { failedFiles: 1 }],
  ])("marks missing tree/file evidence unknown for %s", (_label, partial) => {
    const input = withoutOnboarding(completeInput());
    input.coverage = { ...input.coverage, ...partial };
    input.general = {
      ...input.general,
      testFileCount: 0,
      hasCi: false,
      hasTestCommand: false,
      hasDocumentedTestCommand: false,
      hasTestConfiguration: false,
    };
    const report = analyzeReaderReport(input);

    expect(report.reliability.status).toBe("insufficient-evidence");
    expect(report.reliability.availability).toBe("partial");
    expect(signalState(report, "install")).toBe("unknown");
    expect(signalState(report, "run")).toBe("unknown");
    expect(signalState(report, "tests")).toBe("unknown");
    expect(signalState(report, "ci")).toBe("unknown");
    expect(report.scenarios.availability).toBe("partial");
    expect(report.architecture.availability).toBe("partial");
    expect(report.gettingStarted.availability).toBe("partial");
    expect(report.securityPrivacy.availability).toBe("partial");
    expect(report.maintenance.availability).toBe("partial");
  });

  it("keeps positive decisive evidence present under partial coverage", () => {
    const input = completeInput();
    input.coverage = { ...input.coverage, treeComplete: false };
    const report = analyzeReaderReport(input);

    expect(report.reliability.availability).toBe("partial");
    expect(report.reliability.status).toBe("continue-evaluation");
    expect(signalState(report, "install")).toBe("present");
    expect(signalState(report, "run")).toBe("present");
    expect(signalState(report, "license")).toBe("present");
    expect(signalState(report, "tests")).toBe("present");
  });

  it.each(["package.json", "go.mod"])(
    "cross-checks a README-declared %s against complete and incomplete trees",
    (manifest) => {
      const markdown = `## Overview\n\nA repository tool.\n\n## Requirements\n\n${manifest}`;
      const missing = withReadmeText(completeInput(), markdown);
      missing.tree.files = missing.tree.files.filter(
        ({ path }) => path.toLocaleLowerCase("en-US") !== manifest,
      );
      missing.files = missing.files.filter(
        ({ path }) => path.toLocaleLowerCase("en-US") !== manifest,
      );
      const missingReport = analyzeReaderReport(missing);

      expect(missingReport.readme.observedManifests).not.toContain(manifest);
      expect(missingReport.readme.commentary).toContain(
        "readme-broad-structure-needs-verification",
      );
      expect(missingReport.readme.commentary).not.toContain(
        "readme-broad-structure-corroborated",
      );

      const observed = withReadmeText(completeInput(), markdown);
      if (manifest === "go.mod") observed.tree.files.push(treeFile("go.mod"));
      const observedReport = analyzeReaderReport(observed);

      expect(observedReport.readme.observedManifests).toContain(manifest);
      expect(observedReport.readme.commentary).toContain(
        "readme-broad-structure-corroborated",
      );
      expect(observedReport.readme.commentary).not.toContain(
        "readme-broad-structure-needs-verification",
      );

      const incomplete = structuredClone(observed);
      incomplete.tree.complete = false;
      incomplete.coverage.treeComplete = false;
      const incompleteReport = analyzeReaderReport(incomplete);

      expect(incompleteReport.readme.commentary).not.toContain(
        "readme-broad-structure-corroborated",
      );
      expect(incompleteReport.readme.commentary).not.toContain(
        "readme-broad-structure-needs-verification",
      );
    },
  );

  it("does not use an excluded dependency manifest as README corroboration", () => {
    const markdown =
      "## Overview\n\nA repository tool.\n\n## Requirements\n\npackage.json";
    const input = withReadmeText(completeInput(), markdown);
    input.tree.files = input.tree.files.filter(
      ({ path }) => path !== "package.json",
    );
    input.files = input.files.filter(({ path }) => path !== "package.json");
    input.tree.files.push(treeFile("node_modules/pkg/package.json"));

    const report = analyzeReaderReport(input);

    expect(report.readme.observedManifests).not.toContain("package.json");
    expect(report.readme.commentary).toContain(
      "readme-broad-structure-needs-verification",
    );
  });

  it.each([
    ["src/ｐａｃｋａｇｅ．ｊｓｏｎ", "fullwidth basename"],
    ["src/Package.json", "case variant"],
    ["src/cargo.toml", "noncanonical Cargo case"],
    ["src/package.json.bak", "near name"],
  ])("does not treat a tree %s (%s) as an exact observed manifest", (path) => {
    const input = withReadmeText(
      completeInput(),
      "## Overview\n\nA repository tool.\n\n## Requirements\n\npackage.json",
    );
    input.tree.files = input.tree.files.filter(
      ({ path: candidate }) => candidate !== "package.json",
    );
    input.files = input.files.filter(({ path }) => path !== "package.json");
    input.tree.files.push(treeFile(path));

    const report = analyzeReaderReport(input);

    expect(report.readme.observedManifests).toEqual([]);
    expect(report.readme.commentary).toContain(
      "readme-broad-structure-needs-verification",
    );
  });

  it.each([
    ["build.gradle", "build.gradle"],
    ["build.gradle.kts", "build.gradle.kts"],
    ["Cargo.toml", "cargo.toml"],
    ["composer.json", "composer.json"],
    ["Gemfile", "gemfile"],
    ["go.mod", "go.mod"],
    ["package.json", "package.json"],
    ["Package.swift", "package.swift"],
    ["pom.xml", "pom.xml"],
    ["pubspec.yaml", "pubspec.yaml"],
    ["pyproject.toml", "pyproject.toml"],
  ])("observes canonical raw manifest %s as serialized ID %s", (raw, id) => {
    const input = withReadmeText(
      completeInput(),
      `## Overview\n\nA repository tool.\n\n## Requirements\n\n${id}`,
    );
    input.tree.files = input.tree.files.filter(
      ({ path }) => path === "README.md" || path === "src/index.ts",
    );
    input.tree.files.push(treeFile(`src/${raw}`));
    input.files = input.files.filter(({ path }) => path === "README.md");

    expect(analyzeReaderReport(input).readme.observedManifests).toEqual([id]);
  });

  it("excludes NFKC-lookalike dependency directories from manifest observation", () => {
    const input = withReadmeText(
      completeInput(),
      "## Overview\n\nA repository tool.\n\n## Requirements\n\npackage.json",
    );
    input.tree.files = input.tree.files.filter(
      ({ path }) => path !== "package.json",
    );
    input.files = input.files.filter(({ path }) => path !== "package.json");
    input.tree.files.push(
      treeFile("ｎｏｄｅ＿ｍｏｄｕｌｅｓ/pkg/package.json"),
    );

    const report = analyzeReaderReport(input);

    expect(report.readme.observedManifests).toEqual([]);
    expect(report.readme.commentary).toContain(
      "readme-broad-structure-needs-verification",
    );
  });

  it("keeps declared manifest normalization separate from exact tree identity", () => {
    const markdown =
      "## Overview\n\nA repository tool.\n\n## Requirements\n\nｐａｃｋａｇｅ．ｊｓｏｎ";
    const nested = withReadmeText(completeInput(), markdown);
    nested.tree.files = nested.tree.files.filter(
      ({ path }) => path !== "package.json",
    );
    nested.files = nested.files.filter(({ path }) => path !== "package.json");
    nested.tree.files.push(treeFile("src/package.json"));
    const reversed = structuredClone(nested);
    reversed.tree.files.reverse();

    const report = analyzeReaderReport(nested);

    expect(report.readme.observedManifests).toEqual(["package.json"]);
    expect(report.readme.commentary).toContain(
      "readme-broad-structure-corroborated",
    );
    expect(report.readme.commentary).not.toContain(
      "readme-broad-structure-needs-verification",
    );
    expect(analyzeReaderReport(reversed)).toEqual(report);
  });

  it("uses manifest commands when the preferred README is absent", () => {
    const input = completeInput();
    input.tree.files = input.tree.files.filter(
      ({ path }) => path !== "README.md",
    );
    input.files = input.files.filter(({ path }) => path !== "README.md");
    input.projectBrief.excerpts = input.projectBrief.excerpts.filter(
      ({ source }) => source !== "readme",
    );
    const report = analyzeReaderReport(input);

    expect(report.scenarios.facts).toEqual([]);
    expect(report.readme).toMatchObject({
      availability: "unavailable",
      overview: [],
      commentary: [],
    });
    expect(report.scenarios.availability).toBe("available");
    expect(report.gettingStarted.commands.slice(0, 2)).toMatchObject([
      { kind: "install", source: "manifest", command: "npm install" },
      { kind: "run", source: "manifest", command: "npm run start" },
    ]);
  });

  it("derives README availability only from the preferred README acquisition", () => {
    const fetchedWithUnrelatedFailure = completeInput();
    fetchedWithUnrelatedFailure.coverage = {
      ...fetchedWithUnrelatedFailure.coverage,
      failedFiles: 1,
      failures: [{ path: "src/index.ts", stage: "fetch", reason: "network" }],
    };
    expect(
      analyzeReaderReport(fetchedWithUnrelatedFailure).readme.availability,
    ).toBe("available");

    const failedRootWithFetchedSecondary = completeInput();
    const secondary = readerFile(
      ".github/README.md",
      "## Overview\n\nFallback repository orientation.",
    );
    failedRootWithFetchedSecondary.tree.files.push(
      treeFile(secondary.path, secondary.bytes),
    );
    failedRootWithFetchedSecondary.files = [
      ...failedRootWithFetchedSecondary.files.filter(
        ({ path }) => path !== "README.md",
      ),
      secondary,
    ];
    failedRootWithFetchedSecondary.coverage = {
      ...failedRootWithFetchedSecondary.coverage,
      failedFiles: 1,
      failures: [{ path: "README.md", stage: "fetch", reason: "network" }],
    };
    expect(
      analyzeReaderReport(failedRootWithFetchedSecondary).readme,
    ).toMatchObject({
      availability: "partial",
      overview: [
        expect.objectContaining({
          path: ".github/README.md",
          text: "Fallback repository orientation.",
        }),
      ],
    });

    for (const kind of ["skipped", "failed"] as const) {
      const missingFetch = completeInput();
      missingFetch.files = missingFetch.files.filter(
        ({ path }) => path !== "README.md",
      );
      missingFetch.coverage = {
        ...missingFetch.coverage,
        ...(kind === "skipped"
          ? {
              skippedFiles: 1,
              skipped: [{ path: "README.md", reason: "budget" as const }],
            }
          : {
              failedFiles: 1,
              failures: [
                {
                  path: "README.md",
                  stage: "fetch" as const,
                  reason: "network" as const,
                },
              ],
            }),
      };
      expect(analyzeReaderReport(missingFetch).readme).toMatchObject({
        availability: "partial",
        overview: [],
        commentary: [],
      });
    }

    const unknownIncomplete = completeInput();
    unknownIncomplete.tree.complete = false;
    unknownIncomplete.tree.files = unknownIncomplete.tree.files.filter(
      ({ path }) => path !== "README.md",
    );
    unknownIncomplete.files = unknownIncomplete.files.filter(
      ({ path }) => path !== "README.md",
    );
    unknownIncomplete.coverage = {
      ...unknownIncomplete.coverage,
      treeComplete: false,
    };
    expect(analyzeReaderReport(unknownIncomplete).readme.availability).toBe(
      "partial",
    );

    const completeMissing = completeInput();
    completeMissing.tree.files = completeMissing.tree.files.filter(
      ({ path }) => path !== "README.md",
    );
    completeMissing.files = completeMissing.files.filter(
      ({ path }) => path !== "README.md",
    );
    completeMissing.coverage = {
      ...completeMissing.coverage,
      failedFiles: 1,
      failures: [{ path: "src/index.ts", stage: "fetch", reason: "network" }],
    };
    expect(analyzeReaderReport(completeMissing).readme.availability).toBe(
      "unavailable",
    );
  });

  it("uses the exact tree-selected README under fetched-file permutations", () => {
    const base = completeInput();
    const variant = readerFile(
      "README_a.md",
      "## Overview\n\nVariant repository orientation.",
    );
    base.tree.files.push(treeFile(variant.path, variant.bytes));

    for (const files of [
      [...base.files, variant],
      [variant, ...base.files],
      [...base.files, variant].reverse(),
    ]) {
      const report = analyzeReaderReport({ ...base, files });
      expect(report.readme.availability).toBe("available");
      expect(report.readme.overview[0]).toMatchObject({
        path: "README.md",
        text: "A bounded local repository reader.",
      });
      expect(
        report.readme.overview.some(({ path }) => path === "README_a.md"),
      ).toBe(false);
    }
  });

  it("rejects invalid community values rather than fabricating counts", () => {
    for (const key of ["starsCount", "watchersCount", "forksCount"] as const) {
      for (const invalid of [-1, 1.5, Number.POSITIVE_INFINITY]) {
        const input = completeInput();
        input.repository[key] = invalid;
        expect(() => analyzeReaderReport(input)).toThrow(RangeError);

        const repository = structuredClone(perfectRepository);
        repository[key] = invalid;
        expect(() =>
          unavailableReaderReport({
            repository,
            coverage: { ...perfectCoverage },
            analyzedAt: ANALYZED_AT,
          }),
        ).toThrow(RangeError);
      }
    }
  });

  it("collects recognized documents in path order and caps reader prose", () => {
    const input = completeInput();
    const documents = [
      readerFile(
        "docs/architecture-z.md",
        "# Architecture\n\nA later documented boundary.",
      ),
      readerFile(
        "docs/architecture-a.md",
        "# Design\n\nAn earlier documented boundary.",
      ),
      readerFile(
        "docs/security.md",
        "# Security\n\nUse the private reporting channel.",
      ),
      readerFile(
        "docs/privacy.md",
        "# Privacy\n\nRuntime data behavior requires operator review.",
      ),
    ];
    input.files = [...input.files, ...documents.reverse()];
    input.tree.files.push(
      ...documents.map((file) => treeFile(file.path, file.bytes)),
    );
    const report = analyzeReaderReport(input);

    expect(report.architecture.documents).toEqual([
      "docs/architecture-a.md",
      "docs/architecture-z.md",
    ]);
    expect(report.architecture.excerpts).toHaveLength(2);
    expect(report.architecture.excerpts[0]?.source).toBe("readme");
    expect(report.securityPrivacy.declarations).toHaveLength(3);
    expect(report.securityPrivacy.declarations.map(({ path }) => path)).toEqual(
      ["README.md", "docs/privacy.md", "docs/security.md"],
    );
  });

  it("reports an unsupported Go ecosystem without inventing commands", () => {
    const input = withoutOnboarding(completeInput());
    input.tree.files = [treeFile("go.mod"), treeFile("cmd/tool/main.go")];
    input.files = [
      readerFile("go.mod", "module example.invalid/tool", "manifest"),
    ];
    input.projectBrief = { excerpts: [], kinds: [], cautions: [] };
    input.repository.topics = [];
    input.general = {
      ...input.general,
      hasManifest: true,
      hasReadme: false,
    };
    const report = analyzeReaderReport(input);

    expect(report.architecture.ecosystems).toEqual(["go"]);
    expect(report.architecture.entryPoints).toEqual(["cmd/tool/main.go"]);
    expect(report.gettingStarted.commands).toEqual([]);
    expect(report.alternatives.searchTerms).toEqual([]);
  });

  it("normalizes, validates, sorts, and caps alternative topics", () => {
    const input = completeInput();
    input.repository.topics = [
      "TypeScript",
      "quality",
      "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "AKIA1234567890123456",
      "Ａ",
      "quality",
      "bad topic",
      "zz",
    ];

    expect(analyzeReaderReport(input).alternatives.searchTerms).toEqual([
      "application",
      "a",
      "quality",
      "typescript",
    ]);
  });

  it("does not repeat a project kind represented by its mapped search term", () => {
    const input = completeInput();
    input.projectBrief.kinds = [
      {
        kind: "command-line-tool",
        source: "manifest",
        path: "package.json",
      },
    ];
    input.repository.topics = ["command-line-tool", "cli", "tooling"];

    expect(analyzeReaderReport(input).alternatives.searchTerms).toEqual([
      "cli",
      "tooling",
    ]);
  });

  it("does not store the repository name as an alternative search term", () => {
    const input = completeInput();
    input.repository.name = "Ｐｒｏｊｅｃｔ";
    input.repository.topics = ["project", "quality"];

    expect(analyzeReaderReport(input).alternatives.searchTerms).toEqual([
      "application",
      "quality",
    ]);
  });

  it("fails closed for duplicate fetched top-level paths independent of input order", () => {
    const input = completeInput();
    input.files = [
      ...input.files,
      readerFile(
        "README.md",
        "# Duplicate\n\n## Use cases\n\n- Conflicting duplicate evidence.",
      ),
    ];
    const reversed = structuredClone(input);
    reversed.files = [...reversed.files].reverse();

    const first = analyzeReaderReport(input);
    const second = analyzeReaderReport(reversed);

    expect(second).toEqual(first);
    expect(first.scenarios.facts).toEqual([]);
    expect(
      first.gettingStarted.commands.every(
        ({ source }) => source === "manifest",
      ),
    ).toBe(true);
  });

  it("filters credential-like paths before any structural or provenance output", () => {
    const credential = `TOKEN=ghp_${"a".repeat(36)}`;
    const input = completeInput();
    const readme = readerFile(
      `.github/${credential}/README.md`,
      `## Use cases

- Hidden scenario provenance.

## Architecture

Hidden README architecture provenance.

## Install

\`npm install\`

## Security

Hidden README security provenance.
`,
    );
    const architecture = readerFile(
      `docs/architecture-${credential}.md`,
      "# Architecture\n\nHidden credential path evidence.",
    );
    const security = readerFile(
      `docs/security-${credential}.md`,
      "# Security\n\nHidden security credential path evidence.",
    );
    input.tree.files = input.tree.files.filter(
      ({ path }) => path !== "README.md",
    );
    input.tree.files.push(
      treeFile(readme.path, readme.bytes),
      treeFile(`src/${credential}/index.ts`),
      treeFile(architecture.path, architecture.bytes),
      treeFile(security.path, security.bytes),
    );
    input.files = [
      ...input.files.filter(({ path }) => path !== "README.md"),
      readme,
      architecture,
      security,
    ];

    const report = analyzeReaderReport(input);
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain(credential);
    expect(report.architecture.entryPoints).toEqual(["src/index.ts"]);
    expect(report.architecture.documents).toEqual([]);
    expect(report.architecture.sourceAreas).toEqual(["src"]);
    expect(report.architecture.excerpts).toEqual([]);
    expect(report.scenarios.facts).toEqual([]);
    expect(report.securityPrivacy.declarations).toEqual([]);
    expect(
      report.gettingStarted.commands.every(
        ({ source }) => source === "manifest",
      ),
    ).toBe(true);
  });

  it("deduplicates scenarios against retained project-purpose excerpts", () => {
    const input = completeInput();
    const readme = readerFile(
      "README.md",
      `## Use cases

- A deterministic fixture repository.
- A distinct reader scenario.
`,
    );
    input.files = [
      readme,
      ...input.files.filter(({ path }) => path !== "README.md"),
    ];
    const report = analyzeReaderReport(input);

    expect(report.scenarios.facts.map(({ text }) => text)).toEqual([
      "A distinct reader scenario.",
    ]);
  });

  it("removes purpose duplicates before applying the final three-scenario cap", () => {
    const input = completeInput();
    const readme = readerFile(
      "README.md",
      `## Use cases

- Purpose one.
- Purpose two.
- Unique one.
- Unique two.
- Unique three.
`,
    );
    input.files = [
      readme,
      ...input.files.filter(({ path }) => path !== "README.md"),
    ];
    input.projectBrief.excerpts = [
      { source: "readme", path: "README.md", text: "Purpose one." },
      { source: "readme", path: "README.md", text: "Purpose two." },
    ];

    expect(
      analyzeReaderReport(input).scenarios.facts.map(({ text }) => text),
    ).toEqual(["Unique one.", "Unique two.", "Unique three."]);
    expect(
      analyzeReaderReport(input).readme.useCases.map(({ text }) => text),
    ).toEqual(["Unique one.", "Unique two.", "Unique three."]);
  });

  it.each([
    "node_modules/pkg/package.json",
    "vendor/foo/Cargo.toml",
    "dist/lib/Package.swift",
    "third_party/a/a.csproj",
  ])("does not infer an ecosystem from excluded manifest %s", (path) => {
    const input = withoutOnboarding(completeInput());
    input.tree.files = [treeFile(path)];
    input.files = [];
    input.projectBrief = { excerpts: [], kinds: [], cautions: [] };
    input.repository.topics = [];

    expect(analyzeReaderReport(input).architecture.ecosystems).toEqual([]);
  });

  it("deduplicates normalized paths, ignores input order, and does not mutate frozen input", () => {
    const input = completeInput();
    input.tree.files.push(
      treeFile("SRC/INDEX.TS"),
      treeFile("src/features/b.ts"),
      treeFile("src/components/a.ts"),
    );
    const expected = analyzeReaderReport(structuredClone(input));
    const reversed = structuredClone(input);
    reversed.tree.files.reverse();
    reversed.files = [...reversed.files].reverse();
    reversed.repository.topics.reverse();
    const before = structuredClone(reversed);
    Object.freeze(reversed.tree.files);
    Object.freeze(reversed.files);
    Object.freeze(reversed.repository.topics);

    expect(analyzeReaderReport(reversed)).toEqual(expected);
    expect(reversed).toEqual(before);
    expect(expected.architecture.entryPoints).toEqual(["src/index.ts"]);
    expect(expected.architecture.sourceAreas).toEqual([
      "src",
      "src/components",
      "src/features",
    ]);
  });

  it("rejects invalid or future activity inputs instead of guessing a band", () => {
    const invalidDate = completeInput();
    invalidDate.analyzedAt = "invalid";
    const futurePush = completeInput();
    futurePush.repository.pushedAt = "2026-08-12T12:00:00.000Z";

    expect(() => analyzeReaderReport(invalidDate)).toThrow(RangeError);
    expect(() => analyzeReaderReport(futurePush)).toThrow(RangeError);
  });

  it(
    "handles 100,000 tree entries and a near-limit README within the configured performance ceiling",
    { timeout: 20_000 },
    () => {
      const input = completeInput();
      const readme = readerFile(
        "README.md",
        `## Use cases\n\n- Inspect bounded public evidence.\n\n${"ordinary prose\n".repeat(17_000)}`,
      );
      const bulk = Array.from({ length: 100_000 }, (_, index) =>
        treeFile(`src/area-${String(index % 100)}/file-${String(index)}.ts`),
      );
      input.files = [
        readme,
        ...input.files.filter(({ path }) => path !== "README.md"),
      ];
      input.tree.files = [
        treeFile("README.md", readme.bytes),
        treeFile("package.json", input.files[1]?.bytes ?? 0),
        treeFile("src/index.ts"),
        ...bulk,
      ];
      const reversed = structuredClone(input);
      reversed.tree.files.reverse();
      reversed.files = [...reversed.files].reverse();

      const started = performance.now();
      const first = analyzeReaderReport(input);
      const elapsed = performance.now() - started;
      const second = analyzeReaderReport(reversed);

      const performanceCeiling =
        process.env.REPOSCOPE_ISOLATED_PERF === "1" ? 2_000 : 15_000;
      expect(elapsed).toBeLessThan(performanceCeiling);
      expect(second).toEqual(first);
      expect(first.scenarios.facts.map(({ text }) => text)).toEqual([
        "Inspect bounded public evidence.",
      ]);
      expect(first.architecture.sourceAreas).toHaveLength(5);
    },
  );
});

describe("unavailableReaderReport", () => {
  it("returns canonical empty evidence without throwing", () => {
    const report = unavailableReaderReport({
      repository: structuredClone(perfectRepository),
      coverage: { ...perfectCoverage },
      analyzedAt: ANALYZED_AT,
    });

    expect(report.reliability.status).toBe("insufficient-evidence");
    expect(report.community).toEqual({
      starsCount: 1_284,
      watchersCount: 37,
      forksCount: 146,
    });
    expect(report.readme).toEqual({
      availability: "unavailable",
      observedManifests: [],
      overview: [],
      audiences: [],
      problems: [],
      useCases: [],
      capabilityGroups: [],
      workflow: [],
      dependencies: [],
      limitations: [],
      maturity: [],
      commentary: [],
    });
    expect(report.reliability.availability).toBe("unavailable");
    expect(report.reliability.signals.map(({ signal }) => signal)).toEqual(
      READER_SIGNAL_IDS,
    );
    expect(signalState(report, "install")).toBe("unknown");
    expect(signalState(report, "run")).toBe("unknown");
    expect(signalState(report, "license")).toBe("unknown");
    expect(signalState(report, "tests")).toBe("unknown");
    expect(signalState(report, "ci")).toBe("unknown");
    expect(report.reliability.questions).toEqual([
      "license-compatibility",
      "reproduce-install-run",
      "vulnerability-process",
      "runtime-data-flow",
    ]);
    expect(report.scenarios).toEqual({
      availability: "unavailable",
      facts: [],
    });
    expect(report.architecture).toMatchObject({
      availability: "unavailable",
      excerpts: [],
      documents: [],
      entryPoints: [],
      sourceAreas: [],
      ecosystems: [],
    });
    expect(report.gettingStarted).toEqual({
      availability: "unavailable",
      commands: [],
    });
    expect(report.securityPrivacy).toMatchObject({
      availability: "unavailable",
      declarations: [],
    });
    expect(report.maintenance.availability).toBe("unavailable");
    expect(report.alternatives.searchTerms).toEqual([]);

    expect(() =>
      unavailableReaderReport({
        repository: {
          ...structuredClone(perfectRepository),
          pushedAt: "invalid",
          openIssuesCount: -1,
        },
        coverage: { ...perfectCoverage },
        analyzedAt: "invalid",
      }),
    ).not.toThrow();
  });

  it.each([
    ["archived", true, "2026-08-01T12:00:00.000Z"],
    ["stale", false, "2025-01-01T12:00:00.000Z"],
  ])(
    "keeps every decisive signal unknown for an %s fallback",
    (_label, archived, pushedAt) => {
      const report = unavailableReaderReport({
        repository: {
          ...structuredClone(perfectRepository),
          archived,
          pushedAt,
        },
        coverage: { ...perfectCoverage },
        analyzedAt: ANALYZED_AT,
      });
      const decisive = new Set([
        "archived",
        "install",
        "run",
        "license",
        "recent-activity",
        "tests",
        "ci",
      ]);

      expect(report.reliability.status).toBe("insufficient-evidence");
      expect(
        report.reliability.signals
          .filter(({ signal }) => decisive.has(signal))
          .every(({ state }) => state === "unknown"),
      ).toBe(true);
      expect(report.reliability.questions).toEqual([
        "license-compatibility",
        "reproduce-install-run",
        "vulnerability-process",
        "runtime-data-flow",
      ]);
    },
  );
});
