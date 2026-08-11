import { describe, expect, it } from "vitest";

import {
  perfectCoverage,
  perfectCycles,
  perfectDuplicates,
  perfectGeneralMetrics,
  perfectLanguageAnalysis,
  perfectRepository,
} from "../../test/fixtures/metrics";
import {
  DIMENSION_WEIGHTS,
  RULE_IDS,
  RULESET_VERSION,
  overallLabel,
  scoreProject,
  scoreRule,
} from "./rules";

type Expected = readonly [
  id: string,
  metrics: Readonly<Record<string, number | boolean | string | null>>,
  state: string,
  earned: number,
  available?: number,
];

const boundaryCases: Expected[] = [
  ["documentation.readme", { exists: true }, "passed", 3],
  ["documentation.readme", { exists: false }, "failed", 0],
  ["documentation.installation", { heading: true, command: true }, "passed", 3],
  [
    "documentation.installation",
    { heading: true, command: false },
    "partial",
    1,
  ],
  [
    "documentation.installation",
    { heading: false, command: false },
    "failed",
    0,
  ],
  ["documentation.usage", { heading: true, concrete: true }, "passed", 3],
  ["documentation.usage", { heading: true, concrete: false }, "partial", 1],
  ["documentation.usage", { heading: false, concrete: false }, "failed", 0],
  ["documentation.contributing", { exists: true }, "passed", 2],
  ["documentation.contributing", { exists: false }, "failed", 0],
  ["documentation.license", { file: true, metadata: false }, "passed", 2],
  ["documentation.license", { file: false, metadata: true }, "partial", 1],
  ["documentation.license", { file: false, metadata: false }, "failed", 0],
  ["documentation.architecture", { explicit: true, areaCount: 0 }, "passed", 2],
  [
    "documentation.architecture",
    { explicit: false, areaCount: 3 },
    "partial",
    1,
  ],
  [
    "documentation.architecture",
    { explicit: false, areaCount: 2 },
    "failed",
    0,
  ],
  ["operability.manifest", { exists: true }, "passed", 4],
  ["operability.manifest", { exists: false }, "failed", 0],
  [
    "operability.entry-point",
    { structured: true, conventional: false },
    "passed",
    4,
  ],
  [
    "operability.entry-point",
    { structured: false, conventional: true },
    "partial",
    2,
  ],
  [
    "operability.entry-point",
    { structured: false, conventional: false },
    "failed",
    0,
  ],
  ["operability.run-build", { run: true, build: true }, "passed", 4],
  ["operability.run-build", { run: true, build: false }, "partial", 2],
  ["operability.run-build", { run: false, build: false }, "failed", 0],
  ["operability.example", { concrete: true, prose: false }, "passed", 3],
  ["operability.example", { concrete: false, prose: true }, "partial", 1],
  ["operability.example", { concrete: false, prose: false }, "failed", 0],
  [
    "operability.error-handling",
    { applicable: true, count: 1, total: 20 },
    "passed",
    2,
  ],
  [
    "operability.error-handling",
    { applicable: true, count: 1, total: 21 },
    "partial",
    1,
  ],
  [
    "operability.error-handling",
    { applicable: true, count: 0, total: 20 },
    "failed",
    0,
  ],
  [
    "operability.error-handling",
    { applicable: false, count: 0, total: 0 },
    "not-applicable",
    0,
    0,
  ],
  [
    "operability.version-history",
    { history: true, manifestVersion: false },
    "passed",
    2,
  ],
  [
    "operability.version-history",
    { history: false, manifestVersion: true },
    "partial",
    1,
  ],
  [
    "operability.version-history",
    { history: false, manifestVersion: false },
    "failed",
    0,
  ],
  ["operability.configuration", { exists: true }, "passed", 1],
  ["operability.configuration", { exists: false }, "failed", 0],
  [
    "readability.median-function-length",
    { applicable: true, median: 40 },
    "passed",
    4,
  ],
  [
    "readability.median-function-length",
    { applicable: true, median: 41 },
    "partial",
    2,
  ],
  [
    "readability.median-function-length",
    { applicable: true, median: 60 },
    "partial",
    2,
  ],
  [
    "readability.median-function-length",
    { applicable: true, median: 61 },
    "failed",
    0,
  ],
  [
    "readability.p90-function-length",
    { applicable: true, p90: 80 },
    "passed",
    4,
  ],
  [
    "readability.p90-function-length",
    { applicable: true, p90: 81 },
    "partial",
    2,
  ],
  [
    "readability.p90-function-length",
    { applicable: true, p90: 120 },
    "partial",
    2,
  ],
  [
    "readability.p90-function-length",
    { applicable: true, p90: 121 },
    "failed",
    0,
  ],
  [
    "readability.large-file-ratio",
    { applicable: true, count: 1, total: 10 },
    "passed",
    4,
  ],
  [
    "readability.large-file-ratio",
    { applicable: true, count: 2, total: 10 },
    "partial",
    2,
  ],
  [
    "readability.large-file-ratio",
    { applicable: true, count: 21, total: 100 },
    "failed",
    0,
  ],
  ["readability.median-nesting", { applicable: true, median: 3 }, "passed", 3],
  ["readability.median-nesting", { applicable: true, median: 4 }, "partial", 1],
  ["readability.median-nesting", { applicable: true, median: 5 }, "failed", 0],
  [
    "readability.ambiguous-identifiers",
    { applicable: true, count: 1, total: 10 },
    "passed",
    3,
  ],
  [
    "readability.ambiguous-identifiers",
    { applicable: true, count: 2, total: 10 },
    "partial",
    1,
  ],
  [
    "readability.ambiguous-identifiers",
    { applicable: true, count: 21, total: 100 },
    "failed",
    0,
  ],
  [
    "readability.documented-exports",
    { applicable: true, count: 2, total: 10 },
    "passed",
    2,
  ],
  [
    "readability.documented-exports",
    { applicable: true, count: 1, total: 10 },
    "partial",
    1,
  ],
  [
    "readability.documented-exports",
    { applicable: true, count: 9, total: 100 },
    "failed",
    0,
  ],
  [
    "complexity.median-cyclomatic",
    { applicable: true, median: 5 },
    "passed",
    4,
  ],
  [
    "complexity.median-cyclomatic",
    { applicable: true, median: 6 },
    "partial",
    2,
  ],
  [
    "complexity.median-cyclomatic",
    { applicable: true, median: 8 },
    "partial",
    2,
  ],
  [
    "complexity.median-cyclomatic",
    { applicable: true, median: 9 },
    "failed",
    0,
  ],
  ["complexity.p90-cyclomatic", { applicable: true, p90: 15 }, "passed", 5],
  ["complexity.p90-cyclomatic", { applicable: true, p90: 16 }, "partial", 2],
  ["complexity.p90-cyclomatic", { applicable: true, p90: 25 }, "partial", 2],
  ["complexity.p90-cyclomatic", { applicable: true, p90: 26 }, "failed", 0],
  ["complexity.max-nesting", { applicable: true, max: 5 }, "passed", 3],
  ["complexity.max-nesting", { applicable: true, max: 6 }, "partial", 1],
  ["complexity.max-nesting", { applicable: true, max: 7 }, "partial", 1],
  ["complexity.max-nesting", { applicable: true, max: 8 }, "failed", 0],
  [
    "complexity.very-large-files",
    { applicable: true, count: 0, total: 100 },
    "passed",
    3,
  ],
  [
    "complexity.very-large-files",
    { applicable: true, count: 2, total: 100 },
    "partial",
    1,
  ],
  [
    "complexity.very-large-files",
    { applicable: true, count: 3, total: 100 },
    "failed",
    0,
  ],
  ["complexity.duplication", { applicable: true, ratio: 0.05 }, "passed", 3],
  [
    "complexity.duplication",
    { applicable: true, ratio: 0.050_001 },
    "partial",
    1,
  ],
  ["complexity.duplication", { applicable: true, ratio: 0.1 }, "partial", 1],
  [
    "complexity.duplication",
    { applicable: true, ratio: 0.100_001 },
    "failed",
    0,
  ],
  [
    "complexity.circular-imports",
    { applicable: true, components: 0, largest: 0 },
    "passed",
    2,
  ],
  [
    "complexity.circular-imports",
    { applicable: true, components: 1, largest: 2 },
    "partial",
    1,
  ],
  [
    "complexity.circular-imports",
    { applicable: true, components: 1, largest: 3 },
    "failed",
    0,
  ],
  ["testing.test-files", { count: 1, configuration: false }, "passed", 4],
  ["testing.test-files", { count: 0, configuration: true }, "partial", 1],
  ["testing.test-files", { count: 0, configuration: false }, "failed", 0],
  [
    "testing.test-source-ratio",
    { applicable: true, count: 1, total: 4 },
    "passed",
    3,
  ],
  [
    "testing.test-source-ratio",
    { applicable: true, count: 1, total: 5 },
    "partial",
    1,
  ],
  [
    "testing.test-source-ratio",
    { applicable: true, count: 1, total: 10 },
    "partial",
    1,
  ],
  [
    "testing.test-source-ratio",
    { applicable: true, count: 9, total: 100 },
    "failed",
    0,
  ],
  [
    "testing.test-source-ratio",
    { applicable: false, count: 0, total: 0 },
    "not-applicable",
    0,
    0,
  ],
  ["testing.ci", { exists: true }, "passed", 3],
  ["testing.ci", { exists: false }, "failed", 0],
  [
    "testing.test-command",
    { structured: true, documented: false },
    "passed",
    2,
  ],
  [
    "testing.test-command",
    { structured: false, documented: true },
    "partial",
    1,
  ],
  [
    "testing.test-command",
    { structured: false, documented: false },
    "failed",
    0,
  ],
  [
    "testing.static-check",
    { structured: true, documented: false },
    "passed",
    2,
  ],
  [
    "testing.static-check",
    { structured: false, documented: true },
    "partial",
    1,
  ],
  [
    "testing.static-check",
    { structured: false, documented: false },
    "failed",
    0,
  ],
  ["testing.coverage", { exists: true }, "passed", 1],
  ["testing.coverage", { exists: false }, "failed", 0],
  ["maintenance.activity", { archived: false, elapsedDays: 180 }, "passed", 2],
  ["maintenance.activity", { archived: false, elapsedDays: 181 }, "partial", 1],
  ["maintenance.activity", { archived: false, elapsedDays: 365 }, "partial", 1],
  ["maintenance.activity", { archived: false, elapsedDays: 366 }, "failed", 0],
  ["maintenance.activity", { archived: true, elapsedDays: 1 }, "failed", 0],
  ["maintenance.lockfile", { exists: true }, "passed", 2],
  ["maintenance.lockfile", { exists: false }, "failed", 0],
  ["maintenance.dependency-updates", { exists: true }, "passed", 1],
  ["maintenance.dependency-updates", { exists: false }, "failed", 0],
  ["maintenance.templates", { exists: true }, "passed", 1],
  ["maintenance.templates", { exists: false }, "failed", 0],
  ["maintenance.security", { exists: true }, "passed", 1],
  ["maintenance.security", { exists: false }, "failed", 0],
  ["maintenance.code-of-conduct", { exists: true }, "passed", 1],
  ["maintenance.code-of-conduct", { exists: false }, "failed", 0],
  ["maintenance.version-history", { exists: true }, "passed", 1],
  ["maintenance.version-history", { exists: false }, "failed", 0],
  ["maintenance.generated-directories", { count: 0 }, "passed", 1],
  ["maintenance.generated-directories", { count: 1 }, "partial", 0],
  ["maintenance.generated-directories", { count: 2 }, "failed", 0],
];

const boundaryRows = boundaryCases.map(
  ([id, metrics, state, earned, available]) => ({
    id,
    metrics,
    state,
    earned,
    available,
  }),
);

describe("ruleset 1.0.0", () => {
  it("freezes the exact rule IDs and dimension weights", () => {
    expect(RULESET_VERSION).toBe("1.0.0");
    expect(RULE_IDS).toHaveLength(39);
    expect(
      Object.values(DIMENSION_WEIGHTS).reduce((sum, value) => sum + value, 0),
    ).toBe(100);
  });

  it.each(boundaryRows)(
    "scores $id at a frozen boundary",
    ({ id, metrics, state, earned, available }) => {
      expect(scoreRule(id, metrics)).toMatchObject({
        id,
        state,
        earned,
        ...(available === undefined ? {} : { available }),
      });
    },
  );

  it("rejects unknown rule IDs", () => {
    expect(() => scoreRule("unknown", {})).toThrow("unknown");
  });
});

describe("project scoring", () => {
  const input = {
    repository: perfectRepository,
    general: perfectGeneralMetrics,
    language: perfectLanguageAnalysis,
    duplicates: perfectDuplicates,
    cycles: perfectCycles,
    coverage: perfectCoverage,
    analyzedAt: "2026-08-11T12:00:00Z",
  } as const;

  it("scores a perfect applicable fixture at 100", () => {
    const scored = scoreProject(input);

    expect(scored.overall).toEqual({
      score: 100,
      label: "strong",
      generalOnly: false,
      preliminary: false,
    });
    expect(
      scored.dimensions.every((dimension) => dimension.score === 100),
    ).toBe(true);
  });

  it("uses exact elapsed UTC days at 180, 181, 365, and 366", () => {
    const scoreAt = (days: number) =>
      scoreProject({
        ...input,
        repository: {
          ...perfectRepository,
          pushedAt: new Date(
            Date.parse(input.analyzedAt) - days * 86_400_000,
          ).toISOString(),
        },
      }).rules.find((rule) => rule.id === "maintenance.activity");

    expect([180, 181, 365, 366].map((days) => scoreAt(days)?.state)).toEqual([
      "passed",
      "partial",
      "partial",
      "failed",
    ]);
  });

  it("keeps deep dimensions unavailable below both parser thresholds", () => {
    const language = {
      ...perfectLanguageAnalysis,
      files: perfectLanguageAnalysis.files.slice(0, 4),
      functions: [],
    };
    const scored = scoreProject({ ...input, language });

    expect(
      scored.dimensions.find((dimension) => dimension.key === "readability")
        ?.score,
    ).toBeNull();
    expect(
      scored.dimensions.find((dimension) => dimension.key === "complexity")
        ?.score,
    ).toBeNull();
    expect(scored.overall.generalOnly).toBe(true);
    expect(scored.overall.preliminary).toBe(true);
  });

  it("applies deep rules at either five files or 2,000 parsed lines", () => {
    const fiveFiles = scoreProject(input);
    const byLines = scoreProject({
      ...input,
      language: {
        ...perfectLanguageAnalysis,
        files: perfectLanguageAnalysis.files
          .slice(0, 1)
          .map((file) => ({ ...file, logicalLines: 2_000 })),
      },
    });

    expect(
      fiveFiles.dimensions.find((dimension) => dimension.key === "readability")
        ?.score,
    ).not.toBeNull();
    expect(
      byLines.dimensions.find((dimension) => dimension.key === "complexity")
        ?.score,
    ).not.toBeNull();
  });

  it("removes not-applicable points before normalization", () => {
    const scored = scoreProject({
      ...input,
      general: { ...perfectGeneralMetrics, supportedSourceFileCount: 0 },
    });
    const testing = scored.dimensions.find(
      (dimension) => dimension.key === "testing",
    );

    expect(
      scored.rules.find((rule) => rule.id === "testing.test-source-ratio")
        ?.state,
    ).toBe("not-applicable");
    expect(testing).toMatchObject({ earned: 12, available: 12, score: 100 });
  });

  it.each([
    [49, "limited"],
    [50, "needs-attention"],
    [69, "needs-attention"],
    [70, "solid"],
    [84, "solid"],
    [85, "strong"],
  ] as const)("labels an unrounded overall score of %s", (score, label) => {
    expect(overallLabel(score)).toBe(label);
  });

  it("does not use the displayed rounded score as the label threshold", () => {
    expect(Math.round(84.6)).toBe(85);
    expect(overallLabel(84.6)).toBe("solid");
  });
});
