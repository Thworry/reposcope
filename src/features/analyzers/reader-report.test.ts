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

## Use cases

- Review public project evidence.
- Compare repository adoption requirements.

## Architecture

The application exposes a conventional TypeScript entry point.

## Install

\`pnpm install\`

## Usage

\`pnpm start\`

## Security

Configuration values remain outside the checked-in source.
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
    expect(report.scenarios.availability).toBe("available");
    expect(report.gettingStarted.commands.slice(0, 2)).toMatchObject([
      { kind: "install", source: "manifest", command: "npm install" },
      { kind: "run", source: "manifest", command: "npm run start" },
    ]);
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

  it("handles 100,000 tree entries and a near-limit README deterministically under two seconds", () => {
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

    expect(elapsed).toBeLessThan(2_000);
    expect(second).toEqual(first);
    expect(first.scenarios.facts.map(({ text }) => text)).toEqual([
      "Inspect bounded public evidence.",
    ]);
    expect(first.architecture.sourceAreas).toHaveLength(5);
  });
});

describe("unavailableReaderReport", () => {
  it("returns canonical empty evidence without throwing", () => {
    const report = unavailableReaderReport({
      repository: structuredClone(perfectRepository),
      coverage: { ...perfectCoverage },
      analyzedAt: ANALYZED_AT,
    });

    expect(report.reliability.status).toBe("insufficient-evidence");
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
