import { describe, expect, it } from "vitest";

import {
  perfectCoverage,
  perfectCycles,
  perfectDuplicates,
  perfectGeneralMetrics,
  perfectLanguageAnalysis,
  perfectProjectBrief,
  perfectReaderReport,
  perfectRepository,
} from "../../test/fixtures/metrics";
import { buildFindings } from "../rules/findings";
import { scoreProject } from "../rules/rules";
import type { AnalysisReport, ProjectBrief, ReaderReport } from "./model";
import { isAnalysisReport } from "./guards";
import { unavailableReaderReport } from "../analyzers/reader-report";

export function validReport(): AnalysisReport & { readerReport: ReaderReport } {
  const analyzedAt = "2026-08-11T12:00:00.000Z";
  const scored = scoreProject({
    repository: perfectRepository,
    general: perfectGeneralMetrics,
    language: perfectLanguageAnalysis,
    duplicates: perfectDuplicates,
    cycles: perfectCycles,
    coverage: perfectCoverage,
    analyzedAt,
  });
  const findings = buildFindings(scored);

  return {
    rulesetVersion: "1.0.0",
    repository: {
      owner: "example",
      repo: "project",
      fullName: "example/project",
      url: "https://github.com/example/project",
      description: "fixture",
      defaultBranch: "main",
      archived: false,
      pushedAt: "2026-08-01T12:00:00.000Z",
      commitSha: "a".repeat(40),
      analyzedAt,
    },
    projectBrief: perfectProjectBrief,
    readerReport: structuredClone(perfectReaderReport),
    overall: scored.overall,
    confidence: scored.confidence,
    dimensions: scored.dimensions,
    strengths: findings.strengths,
    weaknesses: findings.weaknesses,
    coverage: perfectCoverage,
  };
}

function cloneReport(): AnalysisReport & { readerReport: ReaderReport } {
  return structuredClone(validReport());
}

function expectReaderMutationRejected(
  mutate: (reader: ReaderReport) => void,
): void {
  const report = cloneReport();
  mutate(report.readerReport);
  expect(isAnalysisReport(report)).toBe(false);
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing reader fixture value");
  return value;
}

const twoReadmeProjectBrief: ProjectBrief = {
  excerpts: [
    { source: "readme", text: "First README purpose.", path: "README.md" },
    {
      source: "readme",
      text: "Second README detail.",
      path: "README.md",
    },
  ],
  kinds: [],
  cautions: [],
};

describe("isAnalysisReport", () => {
  it("requires a canonical reader report", () => {
    const missing = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    delete missing.readerReport;
    expect(isAnalysisReport(missing)).toBe(false);

    const valid = validReport();
    expect(isAnalysisReport(valid)).toBe(true);

    valid.readerReport.reliability.status = "continue-evaluation";
    const license = valid.readerReport.reliability.signals.find(
      ({ signal }) => signal === "license",
    );
    expect(license).toBeDefined();
    if (license !== undefined) license.state = "absent";
    expect(isAnalysisReport(valid)).toBe(false);
  });

  it("rejects unknown keys at every reader report level", () => {
    const targets = [
      (reader: ReaderReport): object => reader,
      (reader: ReaderReport): object => reader.reliability,
      (reader: ReaderReport): object => required(reader.reliability.signals[0]),
      (reader: ReaderReport): object => reader.scenarios,
      (reader: ReaderReport): object => required(reader.scenarios.facts[0]),
      (reader: ReaderReport): object => reader.architecture,
      (reader: ReaderReport): object => reader.gettingStarted,
      (reader: ReaderReport): object =>
        required(reader.gettingStarted.commands[0]),
      (reader: ReaderReport): object => reader.securityPrivacy,
      (reader: ReaderReport): object => reader.maintenance,
      (reader: ReaderReport): object => reader.maintenance.activity,
      (reader: ReaderReport): object => reader.alternatives,
    ];

    for (const target of targets) {
      expectReaderMutationRejected((reader) => {
        Object.assign(target(reader), { rawSource: "hidden" });
      });
    }
  });

  it("requires canonical signal and question order without duplicates", () => {
    expectReaderMutationRejected((reader) => {
      [reader.reliability.signals[0], reader.reliability.signals[1]] = [
        required(reader.reliability.signals[1]),
        required(reader.reliability.signals[0]),
      ];
    });
    expectReaderMutationRejected((reader) => {
      reader.reliability.signals[1] = structuredClone(
        required(reader.reliability.signals[0]),
      );
    });
    expectReaderMutationRejected((reader) => {
      reader.reliability.questions.reverse();
    });
    expectReaderMutationRejected((reader) => {
      reader.reliability.questions.push(
        "release-compatibility",
        "vulnerability-process",
      );
    });
    expectReaderMutationRejected((reader) => {
      const sparse: typeof reader.reliability.questions = [];
      sparse.length = 3;
      reader.reliability.questions = sparse;
    });
  });

  it("requires exact signal provenance and canonical section subsets", () => {
    expectReaderMutationRejected((reader) => {
      required(reader.reliability.signals[0]).source = "analysis";
    });
    expectReaderMutationRejected((reader) => {
      required(reader.reliability.signals[1]).source = "github-metadata";
    });
    expectReaderMutationRejected((reader) => {
      required(reader.reliability.signals[0]).path = "README.md";
    });
    expectReaderMutationRejected((reader) => {
      reader.securityPrivacy.signals.reverse();
    });
    expectReaderMutationRejected((reader) => {
      required(reader.securityPrivacy.signals[0]).state = "absent";
    });
    expectReaderMutationRejected((reader) => {
      reader.maintenance.signals.pop();
    });
  });

  it("rejects boxed and coercible reader vocabulary values", () => {
    for (const state of [
      new String("present"),
      { toString: () => "present" },
    ]) {
      expectReaderMutationRejected((reader) => {
        const reliability = reader.reliability.signals.find(
          ({ signal }) => signal === "dependency-updates",
        );
        const maintenance = reader.maintenance.signals.find(
          ({ signal }) => signal === "dependency-updates",
        );
        expect(reliability).toBeDefined();
        expect(maintenance).toBeDefined();
        if (reliability !== undefined) Object.assign(reliability, { state });
        if (maintenance !== undefined) Object.assign(maintenance, { state });
      });
    }
    for (const disposition of [
      new String("ready"),
      { toString: () => "ready" },
    ]) {
      expectReaderMutationRejected((reader) => {
        Object.assign(required(reader.gettingStarted.commands[2]), {
          disposition,
        });
      });
    }
  });

  it("enforces reader caps and authored prose safety", () => {
    expectReaderMutationRejected((reader) => {
      reader.scenarios.facts.push(
        structuredClone(required(reader.scenarios.facts[0])),
        structuredClone(required(reader.scenarios.facts[0])),
      );
    });
    expectReaderMutationRejected((reader) => {
      reader.architecture.excerpts.push(
        structuredClone(required(reader.architecture.excerpts[0])),
        structuredClone(required(reader.architecture.excerpts[0])),
      );
    });
    expectReaderMutationRejected((reader) => {
      reader.architecture.documents = ["a.md", "b.md", "c.md", "d.md"];
    });
    expectReaderMutationRejected((reader) => {
      reader.architecture.entryPoints = [
        "a.ts",
        "b.ts",
        "c.ts",
        "d.ts",
        "e.ts",
      ];
    });
    expectReaderMutationRejected((reader) => {
      reader.architecture.sourceAreas = ["a", "b", "c", "d", "e", "f"];
    });
    expectReaderMutationRejected((reader) => {
      reader.securityPrivacy.declarations = Array.from({ length: 4 }, () =>
        structuredClone(required(reader.securityPrivacy.declarations[0])),
      );
    });
    for (const text of [
      "a".repeat(481),
      `ghp_${"a".repeat(36)}`,
      "unsafe\u0000text",
      "unsafe\u202Etext",
    ]) {
      expectReaderMutationRejected((reader) => {
        required(reader.scenarios.facts[0]).text = text;
      });
    }
  });

  it("rejects a scenario duplicated from retained purpose evidence", () => {
    const report = cloneReport();
    required(report.readerReport.scenarios.facts[0]).text =
      report.projectBrief.excerpts[0]?.text ?? "missing purpose";

    expect(isAnalysisReport(report)).toBe(false);
  });

  it("enforces text and command source/path pairings", () => {
    expectReaderMutationRejected((reader) => {
      required(reader.scenarios.facts[0]).source = "manifest";
    });
    expectReaderMutationRejected((reader) => {
      required(reader.architecture.excerpts[0]).source = "manifest";
    });
    expectReaderMutationRejected((reader) => {
      required(reader.securityPrivacy.declarations[0]).path = null;
    });
    expectReaderMutationRejected((reader) => {
      required(reader.gettingStarted.commands[0]).source = "analysis";
      required(reader.gettingStarted.commands[0]).path = null;
    });
    for (const path of [
      "../README.md",
      `docs/TOKEN=ghp_${"a".repeat(36)}.md`,
      "docs/unsafe\u202E.md",
    ]) {
      expectReaderMutationRejected((reader) => {
        required(reader.architecture.excerpts[0]).path = path;
      });
    }
  });

  it("accepts preferred nested README evidence labeled as documentation", () => {
    const report = cloneReport();
    required(report.readerReport.scenarios.facts[0]).source = "documentation";
    required(report.readerReport.scenarios.facts[0]).path = "docs/README.md";
    required(report.readerReport.gettingStarted.commands[0]).source =
      "documentation";
    required(report.readerReport.gettingStarted.commands[0]).path =
      "docs/README.md";

    expect(isAnalysisReport(report)).toBe(true);
  });

  it("enforces command vocabulary, order, disposition, and text limits", () => {
    expectReaderMutationRejected((reader) => {
      reader.gettingStarted.commands.reverse();
    });
    expectReaderMutationRejected((reader) => {
      Object.assign(required(reader.gettingStarted.commands[0]), {
        kind: "deploy",
      });
    });
    expectReaderMutationRejected((reader) => {
      reader.gettingStarted.commands.push(
        structuredClone(required(reader.gettingStarted.commands[0])),
      );
    });
    expectReaderMutationRejected((reader) => {
      required(reader.gettingStarted.commands[0]).disposition = "withheld";
    });
    expectReaderMutationRejected((reader) => {
      required(reader.gettingStarted.commands[0]).command = null;
    });
    expectReaderMutationRejected((reader) => {
      required(reader.gettingStarted.commands[0]).command = "a".repeat(161);
    });
    expectReaderMutationRejected((reader) => {
      required(reader.gettingStarted.commands[0]).command =
        `TOKEN=ghp_${"a".repeat(36)}`;
    });

    const withheld = cloneReport();
    required(withheld.readerReport.gettingStarted.commands[2]).command = null;
    required(withheld.readerReport.gettingStarted.commands[2]).disposition =
      "withheld";
    expect(isAnalysisReport(withheld)).toBe(true);
  });

  it("requires canonical sorted unique structural paths and ecosystems", () => {
    expectReaderMutationRejected((reader) => {
      reader.architecture.documents = ["docs/z.md", "docs/a.md"];
    });
    expectReaderMutationRejected((reader) => {
      reader.architecture.entryPoints = ["src/a.ts", "SRC/A.TS"];
    });
    expectReaderMutationRejected((reader) => {
      reader.architecture.sourceAreas = ["src/z", "src/a"];
    });
    expectReaderMutationRejected((reader) => {
      reader.architecture.ecosystems = ["python", "javascript-typescript"];
    });
    expectReaderMutationRejected((reader) => {
      Object.assign(reader.architecture, { ecosystems: ["brainfuck"] });
    });
  });

  it("recomputes activity, metadata signals, and every availability", () => {
    expectReaderMutationRejected((reader) => {
      reader.maintenance.activity.elapsedUtcDays = 11;
    });
    expectReaderMutationRejected((reader) => {
      reader.maintenance.activity.band = "181-365-days";
    });
    expectReaderMutationRejected((reader) => {
      reader.maintenance.openIssuesCount = Number.NaN;
    });
    expectReaderMutationRejected((reader) => {
      required(reader.reliability.signals[0]).state = "present";
      reader.reliability.status = "verify-before-use";
    });
    expectReaderMutationRejected((reader) => {
      reader.scenarios.availability = "unavailable";
    });

    const partial = cloneReport();
    partial.coverage.treeComplete = false;
    const partialScored = scoreProject({
      repository: perfectRepository,
      general: perfectGeneralMetrics,
      language: perfectLanguageAnalysis,
      duplicates: perfectDuplicates,
      cycles: perfectCycles,
      coverage: partial.coverage,
      analyzedAt: partial.repository.analyzedAt,
    });
    const partialFindings = buildFindings(partialScored);
    partial.overall = partialScored.overall;
    partial.confidence = partialScored.confidence;
    partial.dimensions = partialScored.dimensions;
    partial.strengths = partialFindings.strengths;
    partial.weaknesses = partialFindings.weaknesses;
    partial.readerReport.reliability.availability = "partial";
    partial.readerReport.scenarios.availability = "partial";
    partial.readerReport.architecture.availability = "partial";
    partial.readerReport.gettingStarted.availability = "partial";
    partial.readerReport.securityPrivacy.availability = "partial";
    partial.readerReport.maintenance.availability = "partial";
    expect(isAnalysisReport(partial)).toBe(true);
  });

  it.each([
    [180, "within-180-days", "continue-evaluation"],
    [180 + 1 / 86_400_000, "181-365-days", "verify-before-use"],
    [365, "181-365-days", "verify-before-use"],
    [366, "over-365-days", "verify-before-use"],
  ] as const)(
    "accepts the canonical raw activity boundary at %s days",
    (days, band, status) => {
      const report = cloneReport();
      report.repository.pushedAt = new Date(
        Date.parse(report.repository.analyzedAt) - days * 86_400_000,
      ).toISOString();
      report.readerReport.maintenance.activity = {
        elapsedUtcDays: days,
        band,
      };
      if (days > 180) {
        const recent = report.readerReport.reliability.signals.find(
          ({ signal }) => signal === "recent-activity",
        );
        const maintenanceRecent = report.readerReport.maintenance.signals.find(
          ({ signal }) => signal === "recent-activity",
        );
        expect(recent).toBeDefined();
        expect(maintenanceRecent).toBeDefined();
        if (recent !== undefined) recent.state = "absent";
        if (maintenanceRecent !== undefined) {
          maintenanceRecent.state = "absent";
        }
        report.readerReport.reliability.questions = [
          "license-compatibility",
          "reproduce-install-run",
          "release-compatibility",
          "runtime-data-flow",
        ];
      }
      report.readerReport.reliability.status = status;

      expect(isAnalysisReport(report)).toBe(true);
    },
  );

  it("accepts the complete metadata-only reliability state", () => {
    const report = cloneReport();
    for (const signal of report.readerReport.reliability.signals) {
      if (signal.signal !== "archived" && signal.signal !== "recent-activity") {
        signal.state = "absent";
      }
    }
    for (const subset of [
      report.readerReport.securityPrivacy.signals,
      report.readerReport.maintenance.signals,
    ]) {
      for (const signal of subset) {
        const canonical = report.readerReport.reliability.signals.find(
          ({ signal: id }) => id === signal.signal,
        );
        if (canonical !== undefined) signal.state = canonical.state;
      }
    }
    report.readerReport.reliability.status = "insufficient-evidence";
    report.readerReport.reliability.availability = "unavailable";
    report.readerReport.reliability.questions = [
      "license-compatibility",
      "reproduce-install-run",
      "vulnerability-process",
      "runtime-data-flow",
    ];
    report.readerReport.gettingStarted.commands = [];
    report.readerReport.gettingStarted.availability = "unavailable";

    expect(isAnalysisReport(report)).toBe(true);
  });

  it("accepts only the canonical unavailable reader fallback", () => {
    const report = cloneReport();
    report.readerReport = unavailableReaderReport({
      repository: structuredClone(perfectRepository),
      coverage: structuredClone(perfectCoverage),
      analyzedAt: report.repository.analyzedAt,
    });
    expect(isAnalysisReport(report)).toBe(true);

    report.readerReport.scenarios.availability = "available";
    expect(isAnalysisReport(report)).toBe(false);
  });

  it("validates alternative terms against kind, repository, order, and safety", () => {
    expectReaderMutationRejected((reader) => {
      reader.alternatives.searchTerms = ["typescript", "application"];
    });
    expectReaderMutationRejected((reader) => {
      reader.alternatives.searchTerms = ["application", "project"];
    });
    for (const term of [
      "bad term",
      "A",
      "AKIA1234567890123456",
      "a".repeat(51),
    ]) {
      expectReaderMutationRejected((reader) => {
        reader.alternatives.searchTerms = ["application", term];
      });
    }
  });

  it("is total for cyclic and throwing reader reports", () => {
    const cyclic = cloneReport();
    const facts: unknown[] = [];
    facts.push(facts);
    Object.assign(cyclic.readerReport.scenarios, { facts });
    expect(() => isAnalysisReport(cyclic)).not.toThrow();
    expect(isAnalysisReport(cyclic)).toBe(false);

    const throwing = cloneReport();
    Object.assign(throwing, {
      readerReport: new Proxy(perfectReaderReport, {
        ownKeys() {
          throw new Error("hostile reader report");
        },
      }),
    });
    expect(() => isAnalysisReport(throwing)).not.toThrow();
    expect(isAnalysisReport(throwing)).toBe(false);
  });

  it("accepts a complete internally consistent report", () => {
    expect(isAnalysisReport(validReport())).toBe(true);
  });

  it("accepts every valid project brief source and path pairing", () => {
    expect(
      isAnalysisReport({
        ...validReport(),
        projectBrief: {
          excerpts: [
            { source: "github-description", text: "Purpose", path: null },
            { source: "readme", text: "More detail", path: "README.md" },
          ],
          kinds: [
            { kind: "application", source: "manifest", path: "package.json" },
            { kind: "library", source: "tree", path: "src/lib.ts" },
            { kind: "plugin", source: "github-metadata", path: null },
          ],
          cautions: [
            { caution: "archived", source: "github-metadata", path: null },
            {
              caution: "license-evidence-absent",
              source: "analysis",
              path: null,
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("accepts every canonical excerpt source sequence", () => {
    const description = {
      source: "github-description" as const,
      text: "Repository purpose.",
      path: null,
    };
    const readme = {
      source: "readme" as const,
      text: "README purpose.",
      path: "README.md",
    };

    for (const excerpts of [
      [],
      [description],
      [readme],
      twoReadmeProjectBrief.excerpts,
      [description, readme],
    ]) {
      expect(
        isAnalysisReport({
          ...validReport(),
          projectBrief: { excerpts, kinds: [], cautions: [] },
        }),
      ).toBe(true);
    }
  });

  it("requires the exact project brief shape at every level", () => {
    const missing = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    delete missing.projectBrief;
    expect(isAnalysisReport(missing)).toBe(false);

    const unknownTopLevel = cloneReport();
    Object.assign(unknownTopLevel.projectBrief, { rawSource: "hidden" });
    expect(isAnalysisReport(unknownTopLevel)).toBe(false);

    const unknownNested = cloneReport();
    const firstExcerpt = unknownNested.projectBrief.excerpts[0];
    expect(firstExcerpt).toBeDefined();
    if (firstExcerpt === undefined) throw new Error("Missing fixture excerpt");
    Object.assign(firstExcerpt, {
      translated: true,
    });
    expect(isAnalysisReport(unknownNested)).toBe(false);
  });

  it.each([
    [
      "description with a path",
      {
        excerpts: [
          {
            source: "github-description",
            text: "Purpose",
            path: "README.md",
          },
        ],
        kinds: [],
        cautions: [],
      },
    ],
    [
      "README without a path",
      {
        excerpts: [{ source: "readme", text: "Purpose", path: null }],
        kinds: [],
        cautions: [],
      },
    ],
    [
      "manifest kind without a path",
      {
        excerpts: [],
        kinds: [{ kind: "library", source: "manifest", path: null }],
        cautions: [],
      },
    ],
    [
      "tree kind without a path",
      {
        excerpts: [],
        kinds: [{ kind: "library", source: "tree", path: null }],
        cautions: [],
      },
    ],
    [
      "metadata kind with a path",
      {
        excerpts: [],
        kinds: [
          { kind: "plugin", source: "github-metadata", path: "README.md" },
        ],
        cautions: [],
      },
    ],
    [
      "analysis kind with a path",
      {
        excerpts: [],
        kinds: [{ kind: "documentation", source: "analysis", path: "docs" }],
        cautions: [],
      },
    ],
    [
      "archived caution from analysis",
      {
        excerpts: [],
        kinds: [],
        cautions: [{ caution: "archived", source: "analysis", path: null }],
      },
    ],
    [
      "analysis caution from metadata",
      {
        excerpts: [],
        kinds: [],
        cautions: [
          {
            caution: "license-evidence-absent",
            source: "github-metadata",
            path: null,
          },
        ],
      },
    ],
    [
      "caution with a path",
      {
        excerpts: [],
        kinds: [],
        cautions: [
          {
            caution: "license-evidence-absent",
            source: "analysis",
            path: "LICENSE",
          },
        ],
      },
    ],
  ])("rejects %s", (_name, projectBrief) => {
    expect(isAnalysisReport({ ...validReport(), projectBrief })).toBe(false);
  });

  it("rejects duplicate or non-canonical project brief ordering", () => {
    for (const projectBrief of [
      {
        excerpts: [
          {
            source: "github-description",
            text: "First purpose",
            path: null,
          },
          {
            source: "github-description",
            text: "Repeated purpose",
            path: null,
          },
        ],
        kinds: [],
        cautions: [],
      },
      {
        excerpts: [
          { source: "readme", text: "Detail", path: "README.md" },
          { source: "github-description", text: "Purpose", path: null },
        ],
        kinds: [],
        cautions: [],
      },
      {
        excerpts: [],
        kinds: [
          { kind: "library", source: "manifest", path: "package.json" },
          { kind: "application", source: "manifest", path: "package.json" },
        ],
        cautions: [],
      },
      {
        excerpts: [],
        kinds: [
          { kind: "library", source: "manifest", path: "package.json" },
          { kind: "library", source: "tree", path: "src/lib.ts" },
        ],
        cautions: [],
      },
      {
        excerpts: [],
        kinds: [],
        cautions: [
          {
            caution: "license-evidence-absent",
            source: "analysis",
            path: null,
          },
          { caution: "archived", source: "github-metadata", path: null },
        ],
      },
      {
        excerpts: [],
        kinds: [],
        cautions: [
          {
            caution: "insufficient-explanation",
            source: "analysis",
            path: null,
          },
          {
            caution: "insufficient-explanation",
            source: "analysis",
            path: null,
          },
        ],
      },
    ]) {
      expect(isAnalysisReport({ ...validReport(), projectBrief })).toBe(false);
    }
  });

  it("enforces project brief item and Unicode code-point budgets", () => {
    const threeExcerpts = {
      ...structuredClone(perfectProjectBrief),
      excerpts: [
        { source: "github-description", text: "one", path: null },
        { source: "readme", text: "two", path: "README.md" },
        { source: "readme", text: "three", path: "README.md" },
      ],
    };
    expect(
      isAnalysisReport({ ...validReport(), projectBrief: threeExcerpts }),
    ).toBe(false);

    const fourKinds = {
      excerpts: [],
      kinds: [
        { kind: "application", source: "manifest", path: "package.json" },
        {
          kind: "command-line-tool",
          source: "manifest",
          path: "package.json",
        },
        { kind: "library", source: "manifest", path: "package.json" },
        { kind: "plugin", source: "manifest", path: "package.json" },
      ],
      cautions: [],
    };
    expect(
      isAnalysisReport({ ...validReport(), projectBrief: fourKinds }),
    ).toBe(false);

    const tooLong = structuredClone(perfectProjectBrief);
    const firstTooLongExcerpt = tooLong.excerpts[0];
    expect(firstTooLongExcerpt).toBeDefined();
    if (firstTooLongExcerpt === undefined) {
      throw new Error("Missing fixture excerpt");
    }
    firstTooLongExcerpt.text = "a".repeat(481);
    expect(isAnalysisReport({ ...validReport(), projectBrief: tooLong })).toBe(
      false,
    );

    const combinedTooLong = structuredClone(perfectProjectBrief);
    const firstCombinedExcerpt = combinedTooLong.excerpts[0];
    const secondCombinedExcerpt = combinedTooLong.excerpts[1];
    expect(firstCombinedExcerpt).toBeDefined();
    expect(secondCombinedExcerpt).toBeDefined();
    if (
      firstCombinedExcerpt === undefined ||
      secondCombinedExcerpt === undefined
    ) {
      throw new Error("Missing fixture excerpts");
    }
    firstCombinedExcerpt.text = "a".repeat(401);
    secondCombinedExcerpt.text = "b".repeat(400);
    expect(
      isAnalysisReport({ ...validReport(), projectBrief: combinedTooLong }),
    ).toBe(false);

    const exactAstralLimit = structuredClone(perfectProjectBrief);
    exactAstralLimit.excerpts = [
      {
        source: "github-description",
        text: "🚀".repeat(480),
        path: null,
      },
    ];
    expect(
      isAnalysisReport({ ...validReport(), projectBrief: exactAstralLimit }),
    ).toBe(true);
  });

  it("accepts 1024-character project brief paths and rejects 1025", () => {
    const exact = "r".repeat(1_024);
    const tooLong = "r".repeat(1_025);

    for (const projectBrief of [
      {
        excerpts: [{ source: "readme", text: "Purpose", path: exact }],
        kinds: [],
        cautions: [],
      },
      {
        excerpts: [],
        kinds: [{ kind: "application", source: "manifest", path: exact }],
        cautions: [],
      },
      {
        excerpts: [],
        kinds: [{ kind: "template", source: "tree", path: exact }],
        cautions: [],
      },
    ]) {
      const report = validReport();
      report.projectBrief = projectBrief as ProjectBrief;
      if (projectBrief.kinds[0]?.kind === "template") {
        report.readerReport.alternatives.searchTerms[0] = "template";
      }
      expect(isAnalysisReport(report)).toBe(true);
    }

    for (const projectBrief of [
      {
        excerpts: [{ source: "readme", text: "Purpose", path: tooLong }],
        kinds: [],
        cautions: [],
      },
      {
        excerpts: [],
        kinds: [{ kind: "application", source: "manifest", path: tooLong }],
        cautions: [],
      },
      {
        excerpts: [],
        kinds: [{ kind: "template", source: "tree", path: tooLong }],
        cautions: [],
      },
    ]) {
      expect(isAnalysisReport({ ...validReport(), projectBrief })).toBe(false);
    }
  });

  it.each([
    ["password assignment", "password=hunter2"],
    ["inline password assignment", "password=`hunter2`"],
    ["braced secret assignment", "secret={hunter2}"],
    ["GitHub token", `ghp_${"a".repeat(36)}`],
    ["PEM private key", "-----BEGIN PRIVATE KEY-----"],
  ])("rejects a %s anywhere in report purpose text", (_label, credential) => {
    const excerptReport = cloneReport();
    const firstExcerpt = excerptReport.projectBrief.excerpts[0];
    expect(firstExcerpt).toBeDefined();
    if (firstExcerpt === undefined) throw new Error("Missing fixture excerpt");
    firstExcerpt.text = `Repository purpose ${credential}`;
    expect(isAnalysisReport(excerptReport)).toBe(false);

    const descriptionReport = cloneReport();
    descriptionReport.repository.description = `Repository purpose ${credential}`;
    expect(isAnalysisReport(descriptionReport)).toBe(false);
  });

  it("rejects compatibility-equivalent credentials in outer purpose fields", () => {
    const fullwidthGitHubToken = `ｇｈｐ＿${"ａ".repeat(36)}`;
    const descriptionReport = cloneReport();
    descriptionReport.repository.description = `Purpose ${fullwidthGitHubToken}`;
    expect(isAnalysisReport(descriptionReport)).toBe(false);

    const excerptReport = cloneReport();
    const firstExcerpt = required(excerptReport.projectBrief.excerpts[0]);
    firstExcerpt.text = `Purpose ${fullwidthGitHubToken}`;
    expect(isAnalysisReport(excerptReport)).toBe(false);
  });

  it.each([
    "Documentation explains password rotation policies.",
    "OAuth token: rotate it every 90 days.",
    "Configuration field password: required for sign-in.",
    "The API key: identifies the configuration field.",
    "Password: configure it in settings.",
    "Token: generated during login.",
    "API key: provided by the user at runtime.",
    "Access token: obtained through OAuth.",
    "Private key: never leaves your device.",
    "Password: validation and rotation guidance.",
    "  Token: never log it.",
    "- API key: keep it out of source control.",
    "Token: SHA256 hashes identify values.",
    "Password: user-provided values are accepted.",
    "API key: keychain storage is recommended.",
    "Token: token-based authentication is supported.",
    "Password: passphrase requirements are documented.",
    "Secret: secret-management guidance is included.",
    "Private key: hardware-backed storage is supported.",
    "Token: base64-encoded values are accepted.",
    "API key: read-only access is sufficient.",
    "Token: user's browser stores no secrets.",
    "API key: developer's responsibility is rotation.",
    "Token: values, configuration: guidance for users.",
    "Password: rules; validation: handled by the server.",
    '{"note":"Intro, Token: values, configuration: guidance for users."}',
    '{note: "Intro, Password: rules; validation: handled by server."}',
  ])("accepts ordinary credential documentation: %s", (generic) => {
    const report = cloneReport();
    const firstExcerpt = report.projectBrief.excerpts[0];
    expect(firstExcerpt).toBeDefined();
    if (firstExcerpt === undefined) throw new Error("Missing fixture excerpt");
    report.repository.description = generic;
    firstExcerpt.text = generic;

    expect(isAnalysisReport(report)).toBe(true);
  });

  it.each([
    " token: hunter2",
    "  token: hunter2 # nested YAML",
    "- token: hunter2",
    "- password: huntersecret # list item",
    "Password: required.\ntoken: hunter2",
    "Password: required. token: hunter2",
    "Configuration guidance. token: hunter2 # local only",
    "token: hunter2\nPassword: required.",
    '{"token":"huntersecret","name":"app"}',
    "{token: huntersecret, name: app}",
    '{"token":"huntersecret","password":null}',
    '[{"token":"huntersecret","name":"app"}]',
    "token: `huntersecret` with notes",
    "{token: zircon9876, $schema: v1}",
    "{token: zircon9876, app.name: demo}",
    "{token: zircon9876, x/y: demo}",
    "{token: zircon9876, 1: app}",
    "Owner's settings are {token: zircon9876, name: app}.",
    "The user's config is [{token: zircon9876, name: app}].",
    "It's configured as {password: zircon9876, mode: local}.",
    "Developer's example {name: app, token: zircon9876}",
    'Example "{name: app, token: zircon9876}"',
    'Example: "{name: app, token: zircon9876}"',
    '"{name: app, token: zircon9876}" is the example.',
    "Example = '{name: app, token: zircon9876}'",
    'Configuration: "[{password: zircon9876, mode: local}]"',
    'password: "correct horse battery staple"',
    '{"password":"correct horse battery staple","name":"app"}',
    '{password: "correct horse battery staple", name: app}',
    'token: "hunter,secret"',
    "passphrase: 'alpha beta gamma delta'",
  ])("rejects structured YAML credential text: %s", (credential) => {
    const descriptionReport = cloneReport();
    descriptionReport.repository.description = credential;
    expect(isAnalysisReport(descriptionReport)).toBe(false);

    const excerptReport = cloneReport();
    const firstExcerpt = excerptReport.projectBrief.excerpts[0];
    expect(firstExcerpt).toBeDefined();
    if (firstExcerpt === undefined) throw new Error("Missing fixture excerpt");
    firstExcerpt.text = credential;
    expect(isAnalysisReport(excerptReport)).toBe(false);
  });

  it.each([
    ["invalid path", "Purpose", "../README.md"],
    ["bidi control", "Purpose\u202ehidden", "README.md"],
    ["malformed surrogate", "Purpose\ud800", "README.md"],
  ])("rejects project brief %s", (_name, text, path) => {
    const projectBrief = {
      excerpts: [{ source: "readme", text, path }],
      kinds: [],
      cautions: [],
    };
    expect(isAnalysisReport({ ...validReport(), projectBrief })).toBe(false);
  });

  it("is total for cyclic and throwing project brief values", () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    const cyclicReport = cloneReport();
    Object.assign(cyclicReport.projectBrief, { excerpts: cyclic });
    expect(() => isAnalysisReport(cyclicReport)).not.toThrow();
    expect(isAnalysisReport(cyclicReport)).toBe(false);

    const throwingReport = cloneReport();
    Object.assign(throwingReport, {
      projectBrief: new Proxy(perfectProjectBrief, {
        get() {
          throw new Error("hostile project brief");
        },
      }),
    });
    expect(() => isAnalysisReport(throwingReport)).not.toThrow();
    expect(isAnalysisReport(throwingReport)).toBe(false);
  });

  it.each([
    [
      "wrong ruleset",
      (report: AnalysisReport) =>
        Object.assign(report, { rulesetVersion: "2.0.0" }),
    ],
    ["missing dimension", (report: AnalysisReport) => report.dimensions.pop()],
    [
      "non-finite score",
      (report: AnalysisReport) =>
        Object.assign(report.overall, { score: Number.NaN }),
    ],
    [
      "invalid SHA",
      (report: AnalysisReport) =>
        Object.assign(report.repository, { commitSha: "main" }),
    ],
    [
      "invalid timestamp",
      (report: AnalysisReport) =>
        Object.assign(report.repository, { analyzedAt: "tomorrow" }),
    ],
    [
      "unknown source field",
      (report: AnalysisReport) =>
        Object.assign(report, { source: "remote source" }),
    ],
  ])("rejects %s", (_name, mutate) => {
    const report = cloneReport();
    mutate(report);
    expect(isAnalysisReport(report)).toBe(false);
  });

  it("rejects duplicate rule IDs and impossible points", () => {
    const duplicate = cloneReport();
    const first = duplicate.dimensions[0]?.rules[0];
    const second = duplicate.dimensions[0]?.rules[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first !== undefined && second !== undefined) second.id = first.id;
    expect(isAnalysisReport(duplicate)).toBe(false);

    const impossible = cloneReport();
    const rule = impossible.dimensions[0]?.rules[0];
    expect(rule).toBeDefined();
    if (rule !== undefined) rule.earned = rule.available + 1;
    expect(isAnalysisReport(impossible)).toBe(false);
  });

  it("accepts the ruleset's zero-point partial generated-directory state", () => {
    const analyzedAt = "2026-08-11T12:00:00.000Z";
    const scored = scoreProject({
      repository: perfectRepository,
      general: {
        ...perfectGeneralMetrics,
        committedGeneratedDirectoryCount: 1,
      },
      language: perfectLanguageAnalysis,
      duplicates: perfectDuplicates,
      cycles: perfectCycles,
      coverage: perfectCoverage,
      analyzedAt,
    });
    const findings = buildFindings(scored);
    const report = validReport();
    Object.assign(report, {
      overall: scored.overall,
      confidence: scored.confidence,
      dimensions: scored.dimensions,
      strengths: findings.strengths,
      weaknesses: findings.weaknesses,
    });
    const generatedDirectories = report.dimensions
      .flatMap((dimension) => dimension.rules)
      .find((rule) => rule.id === "maintenance.generated-directories");

    expect(generatedDirectories).toMatchObject({
      state: "partial",
      earned: 0,
      available: 1,
    });
    expect(isAnalysisReport(report)).toBe(true);
  });

  it("validates exact skipped totals independently from capped details", () => {
    const capped = cloneReport();
    capped.coverage.skippedFiles = 401;
    capped.coverage.skipped = Array.from({ length: 400 }, (_, index) => ({
      path: `excluded/file-${String(index)}.txt`,
      reason: "excluded" as const,
    }));
    expect(isAnalysisReport(capped)).toBe(true);

    const inconsistent = structuredClone(capped);
    inconsistent.coverage.skippedFiles = 399;
    expect(isAnalysisReport(inconsistent)).toBe(false);

    const missing = cloneReport();
    missing.coverage.skippedFiles = 1;
    expect(isAnalysisReport(missing)).toBe(false);

    const omittedUnsafeDetail = cloneReport();
    omittedUnsafeDetail.coverage.skippedFiles = 2;
    omittedUnsafeDetail.coverage.skipped = [];
    expect(isAnalysisReport(omittedUnsafeDetail)).toBe(true);
  });

  it("is total for cyclic hostile finding arrays", () => {
    const report = cloneReport();
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    Object.assign(report, { strengths: cyclic });

    expect(() => isAnalysisReport(report)).not.toThrow();
    expect(isAnalysisReport(report)).toBe(false);
  });

  it("is total for hostile throwing property access", () => {
    const hostile = new Proxy(validReport(), {
      ownKeys() {
        throw new Error("hostile reflection");
      },
    });

    expect(() => isAnalysisReport(hostile)).not.toThrow();
    expect(isAnalysisReport(hostile)).toBe(false);
  });
});
