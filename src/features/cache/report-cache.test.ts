import { beforeEach, describe, expect, it, vi } from "vitest";

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
import type {
  AnalysisReport,
  ReaderSignalId,
  ReaderSignalState,
  RepoRef,
} from "../analysis/model";
import { buildFindings } from "../rules/findings";
import { scoreProject } from "../rules/rules";
import {
  cacheKey,
  getCachedReport,
  removeCachedReport,
  setCachedReport,
} from "./report-cache";

const ref: RepoRef = { owner: "Example", repo: "Project" };
const now = Date.parse("2026-08-11T12:00:00.000Z");

function validReport(): AnalysisReport {
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
    projectBrief: structuredClone(perfectProjectBrief),
    readerReport: structuredClone(perfectReaderReport),
    overall: scored.overall,
    confidence: scored.confidence,
    dimensions: scored.dimensions,
    strengths: findings.strengths,
    weaknesses: findings.weaknesses,
    coverage: structuredClone(perfectCoverage),
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing reader fixture value");
  return value;
}

function replaceReadmePaths(report: AnalysisReport, path: string): void {
  for (const excerpt of report.projectBrief.excerpts) {
    if (excerpt.source === "readme") excerpt.path = path;
  }
  const facts = [
    ...report.readerReport.readme.overview,
    ...report.readerReport.readme.audiences,
    ...report.readerReport.readme.problems,
    ...report.readerReport.readme.useCases,
    ...report.readerReport.readme.capabilityGroups.flatMap(
      ({ facts: groupFacts }) => groupFacts,
    ),
    ...report.readerReport.readme.workflow,
    ...report.readerReport.readme.dependencies,
    ...report.readerReport.readme.limitations,
    ...report.readerReport.readme.maturity,
    ...report.readerReport.scenarios.facts,
    ...report.readerReport.architecture.excerpts,
    ...report.readerReport.securityPrivacy.declarations,
  ];
  for (const fact of facts) {
    if (fact.source === "readme") fact.path = path;
  }
  for (const command of report.readerReport.gettingStarted.commands) {
    if (command.source === "readme") command.path = path;
  }
}

describe("report cache", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round trips a validated report under a canonical key", () => {
    const report = validReport();
    report.repository.owner = ref.owner;
    report.repository.repo = ref.repo;
    report.repository.fullName = `${ref.owner}/${ref.repo}`;
    report.repository.url = `https://github.com/${ref.owner}/${ref.repo}`;
    setCachedReport(ref, report, now);
    expect(cacheKey(ref)).toBe("reposcope:v1:example/project");
    expect(getCachedReport(ref, now)).toEqual(report);
  });

  it("removes a stale report without the required project brief", () => {
    const stale = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    delete stale.projectBrief;
    sessionStorage.setItem(
      cacheKey(ref),
      JSON.stringify({ savedAt: now, report: stale }),
    );

    expect(getCachedReport(ref, now)).toBeNull();
    expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
  });

  it("removes a stale report without the required reader report", () => {
    const stale = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    delete stale.readerReport;
    sessionStorage.setItem(
      cacheKey(ref),
      JSON.stringify({ savedAt: now, report: stale }),
    );

    expect(getCachedReport(ref, now)).toBeNull();
    expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
  });

  it.each(["community", "readme"] as const)(
    "removes an old reader report without required %s evidence",
    (key) => {
      const stale = structuredClone(validReport());
      Reflect.deleteProperty(stale.readerReport, key);
      sessionStorage.setItem(
        cacheKey(ref),
        JSON.stringify({ savedAt: now, report: stale }),
      );

      expect(getCachedReport(ref, now)).toBeNull();
      expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
    },
  );

  it("round trips the maximum valid reader shape below the 2 MiB cap", () => {
    const report = validReport();
    report.repository.owner = ref.owner;
    report.repository.repo = ref.repo;
    report.repository.fullName = `${ref.owner}/${ref.repo}`;
    report.repository.url = `https://github.com/${ref.owner}/${ref.repo}`;
    report.readerReport.scenarios.facts = Array.from(
      { length: 3 },
      (_, index) => ({
        source: "readme" as const,
        path: "r".repeat(1_024),
        text: String(index).repeat(480),
      }),
    );
    report.readerReport.architecture.excerpts = Array.from(
      { length: 2 },
      (_, index) => ({
        source: "documentation" as const,
        path: `${String(index)}${"a".repeat(1_023)}`,
        text: String(index).repeat(480),
      }),
    );
    report.readerReport.securityPrivacy.declarations = Array.from(
      { length: 3 },
      (_, index) => ({
        source: "documentation" as const,
        path: `${String(index)}${"s".repeat(1_023)}`,
        text: String(index).repeat(480),
      }),
    );
    report.readerReport.architecture.documents = [
      `a${"a".repeat(1_023)}`,
      `b${"b".repeat(1_023)}`,
      `c${"c".repeat(1_023)}`,
    ];
    report.readerReport.architecture.entryPoints = [
      `a${"d".repeat(1_023)}`,
      `b${"e".repeat(1_023)}`,
      `c${"f".repeat(1_023)}`,
      `d${"g".repeat(1_023)}`,
    ];
    report.readerReport.architecture.sourceAreas = ["a", "b", "c", "d", "e"];
    report.readerReport.architecture.ecosystems = [
      "javascript-typescript",
      "python",
      "go",
      "rust",
      "java-jvm",
      "dotnet",
      "ruby",
      "php",
      "swift",
      "dart",
      "other",
    ];
    report.readerReport.gettingStarted.commands.forEach((command, index) => {
      command.command = `${String(index)}${"x".repeat(159)}`;
    });
    report.readerReport.alternatives.searchTerms = [
      "application",
      "a",
      "b",
      "c",
    ];
    const readmeFacts = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        source: "readme" as const,
        path: `README-${"r".repeat(1_012)}.md`,
        text: `${prefix}-${String(index)}-${"x".repeat(450)}`,
      }));
    report.readerReport.readme = {
      availability: "available",
      observedManifests: ["package.json"],
      overview: readmeFacts("overview", 4),
      audiences: readmeFacts("audience", 4),
      problems: readmeFacts("problem", 4),
      useCases: readmeFacts("use", 4),
      capabilityGroups: Array.from({ length: 6 }, (_, groupIndex) => ({
        label: `Capability ${String(groupIndex)}`,
        facts: readmeFacts(`capability-${String(groupIndex)}`, 6),
      })),
      workflow: readmeFacts("workflow", 8),
      dependencies: readmeFacts("dependency", 8),
      limitations: readmeFacts("limitation", 6),
      maturity: readmeFacts("maturity", 6),
      commentary: [
        "readme-substantial-overview",
        "readme-audience-or-use-cases-documented",
        "readme-capabilities-documented",
        "readme-security-data-flow-unestablished",
        "readme-external-dependencies-declared",
      ],
    };
    report.repository.archived = true;
    const state: Partial<Record<ReaderSignalId, ReaderSignalState>> = {
      archived: "present",
      "recent-activity": "absent",
      "security-policy": "absent",
    };
    for (const signal of report.readerReport.reliability.signals) {
      signal.state = state[signal.signal] ?? signal.state;
    }
    for (const subset of [
      report.readerReport.securityPrivacy.signals,
      report.readerReport.maintenance.signals,
    ]) {
      for (const signal of subset) {
        signal.state = state[signal.signal] ?? signal.state;
      }
    }
    report.readerReport.reliability.status = "verify-before-use";
    report.readerReport.reliability.questions = [
      "license-compatibility",
      "reproduce-install-run",
      "release-compatibility",
      "vulnerability-process",
    ];
    replaceReadmePaths(report, `README-${"r".repeat(1_014)}.md`);
    const serialized = JSON.stringify({ savedAt: now, report });

    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(
      2 * 1024 * 1024,
    );
    setCachedReport(ref, report, now);
    expect(getCachedReport(ref, now)).toEqual(report);
  });

  it.each([
    ["credential", `ghp_${"a".repeat(36)}`],
    ["control", "unsafe\u0000text"],
    ["directional control", "unsafe\u202Etext"],
  ])("never persists an unsafe reader %s", (_label, unsafe) => {
    const report = validReport();
    required(report.readerReport.scenarios.facts[0]).text = unsafe;

    setCachedReport(ref, report, now);
    expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
  });

  it("rejects and removes compatibility-equivalent credentials at both cache boundaries", () => {
    const fullwidthGitHubToken = `ｇｈｐ＿${"ａ".repeat(36)}`;
    const report = validReport();
    report.repository.owner = ref.owner;
    report.repository.repo = ref.repo;
    report.repository.fullName = `${ref.owner}/${ref.repo}`;
    report.repository.url = `https://github.com/${ref.owner}/${ref.repo}`;
    report.repository.description = `Purpose ${fullwidthGitHubToken}`;

    setCachedReport(ref, report, now);
    expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();

    sessionStorage.setItem(
      cacheKey(ref),
      JSON.stringify({ savedAt: now, report }),
    );
    expect(getCachedReport(ref, now)).toBeNull();
    expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
  });

  it("never persists unsafe content in any reader string category", () => {
    const credential = `ghp_${"a".repeat(36)}`;
    const mutations: Array<(report: AnalysisReport) => void> = [
      (report) => {
        required(report.readerReport.scenarios.facts[0]).text = credential;
      },
      (report) => {
        required(report.readerReport.architecture.excerpts[0]).text =
          credential;
      },
      (report) => {
        required(report.readerReport.securityPrivacy.declarations[0]).text =
          credential;
      },
      (report) => {
        required(report.readerReport.scenarios.facts[0]).path = credential;
      },
      (report) => {
        report.readerReport.architecture.documents[0] = credential;
      },
      (report) => {
        report.readerReport.architecture.entryPoints[0] = credential;
      },
      (report) => {
        report.readerReport.architecture.sourceAreas[0] = credential;
      },
      (report) => {
        required(report.readerReport.gettingStarted.commands[0]).command =
          credential;
      },
      (report) => {
        required(report.readerReport.gettingStarted.commands[0]).path =
          credential;
      },
      (report) => {
        report.readerReport.alternatives.searchTerms[1] = credential;
      },
      (report) => {
        required(report.readerReport.readme.workflow[0]).text = credential;
      },
      (report) => {
        required(report.readerReport.readme.capabilityGroups[0]).label =
          credential;
      },
    ];

    for (const mutate of mutations) {
      const report = validReport();
      mutate(report);
      setCachedReport(ref, report, now);
      expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
    }
  });

  it("validates the serialized snapshot against a hostile toJSON replacement", () => {
    const unsafe = validReport();
    required(unsafe.readerReport.scenarios.facts[0]).text =
      `ghp_${"a".repeat(36)}`;
    const poison = new Proxy(validReport(), {
      get(target, property, receiver) {
        if (property === "toJSON") return () => unsafe;
        return Reflect.get(target, property, receiver) as unknown;
      },
    });

    setCachedReport(ref, poison, now);

    expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
  });

  it("validates the serialized snapshot after a reader getter changes state", () => {
    const report = validReport();
    const safeReader = structuredClone(report.readerReport);
    const unsafeReader = structuredClone(report.readerReport);
    required(unsafeReader.scenarios.facts[0]).text = `ghp_${"a".repeat(36)}`;
    let reads = 0;
    Object.defineProperty(report, "readerReport", {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? safeReader : unsafeReader;
      },
    });

    setCachedReport(ref, report, now);

    expect(sessionStorage.getItem(cacheKey(ref))).not.toContain(
      `ghp_${"a".repeat(36)}`,
    );
  });

  it("fails closed when report serialization throws", () => {
    const poison = new Proxy(validReport(), {
      get(target, property, receiver) {
        if (property === "toJSON") {
          return () => {
            throw new Error("hostile serialization");
          };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });

    sessionStorage.setItem(cacheKey(ref), "stale");

    expect(() => {
      setCachedReport(ref, poison, now);
    }).not.toThrow();
    expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
  });

  it("keeps the maximum valid project brief below the existing 2 MiB cap", () => {
    const report = validReport();
    const maximumReadmePath = `README-${"r".repeat(1_014)}.md`;
    report.repository.owner = ref.owner;
    report.repository.repo = ref.repo;
    report.repository.fullName = `${ref.owner}/${ref.repo}`;
    report.repository.url = `https://github.com/${ref.owner}/${ref.repo}`;
    report.projectBrief = {
      excerpts: [
        {
          source: "github-description",
          text: "a".repeat(480),
          path: null,
        },
        {
          source: "readme",
          text: "b".repeat(320),
          path: maximumReadmePath,
        },
      ],
      kinds: [
        { kind: "application", source: "manifest", path: "a".repeat(1_024) },
        {
          kind: "command-line-tool",
          source: "tree",
          path: "b".repeat(1_024),
        },
        { kind: "library", source: "manifest", path: "c".repeat(1_024) },
      ],
      cautions: [
        { caution: "archived", source: "github-metadata", path: null },
        {
          caution: "insufficient-explanation",
          source: "analysis",
          path: null,
        },
        {
          caution: "license-evidence-absent",
          source: "analysis",
          path: null,
        },
        {
          caution: "entry-point-evidence-absent",
          source: "analysis",
          path: null,
        },
      ],
    };
    replaceReadmePaths(report, maximumReadmePath);
    const serialized = JSON.stringify({ savedAt: now, report });

    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(
      2 * 1024 * 1024,
    );
    setCachedReport(ref, report, now);
    expect(sessionStorage.getItem(cacheKey(ref))).toBe(serialized);
  });

  it.each([
    ["password assignment", "password=hunter2"],
    ["inline password assignment", "password=`hunter2`"],
    ["braced secret assignment", "secret={hunter2}"],
    ["GitHub token", `ghp_${"a".repeat(36)}`],
    ["PEM private key", "-----BEGIN PRIVATE KEY-----"],
  ])("never persists a report containing a %s", (_label, credential) => {
    for (const target of ["description", "excerpt"] as const) {
      const report = validReport();
      report.repository.owner = ref.owner;
      report.repository.repo = ref.repo;
      report.repository.fullName = `${ref.owner}/${ref.repo}`;
      report.repository.url = `https://github.com/${ref.owner}/${ref.repo}`;
      if (target === "description") {
        report.repository.description = `Purpose ${credential}`;
      } else {
        const firstExcerpt = report.projectBrief.excerpts[0];
        expect(firstExcerpt).toBeDefined();
        if (firstExcerpt === undefined)
          throw new Error("Missing fixture excerpt");
        firstExcerpt.text = `Purpose ${credential}`;
      }

      setCachedReport(ref, report, now);
      expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
    }
  });

  it.each([
    "  token: hunter2 # nested YAML",
    "- password: huntersecret # list item",
    "Password: required.\ntoken: hunter2",
    "token: hunter2\nPassword: required.",
    '{"token":"huntersecret","name":"app"}',
    "{token: huntersecret, name: app}",
    "{token: zircon9876, $schema: v1}",
    "{token: zircon9876, app.name: demo}",
    "Owner's settings are {token: zircon9876, name: app}.",
    'password: "correct horse battery staple"',
    '{"password":"correct horse battery staple","name":"app"}',
  ])("never persists structured YAML credential text: %s", (credential) => {
    for (const target of ["description", "excerpt"] as const) {
      const report = validReport();
      report.repository.owner = ref.owner;
      report.repository.repo = ref.repo;
      report.repository.fullName = `${ref.owner}/${ref.repo}`;
      report.repository.url = `https://github.com/${ref.owner}/${ref.repo}`;
      if (target === "description") {
        report.repository.description = credential;
      } else {
        const firstExcerpt = report.projectBrief.excerpts[0];
        expect(firstExcerpt).toBeDefined();
        if (firstExcerpt === undefined)
          throw new Error("Missing fixture excerpt");
        firstExcerpt.text = credential;
      }

      setCachedReport(ref, report, now);
      expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
    }
  });

  it.each([now + 1, now - 900_001])(
    "removes invalid saved time %s",
    (savedAt) => {
      sessionStorage.setItem(
        cacheKey(ref),
        JSON.stringify({ savedAt, report: validReport() }),
      );
      expect(getCachedReport(ref, now)).toBeNull();
      expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
    },
  );

  it("rejects wrong repository identity and oversized entries", () => {
    const wrongReport = validReport();
    wrongReport.repository.owner = "different";
    wrongReport.repository.fullName = "different/project";
    wrongReport.repository.url = "https://github.com/different/project";
    sessionStorage.setItem(
      cacheKey(ref),
      JSON.stringify({ savedAt: now, report: wrongReport }),
    );
    expect(getCachedReport(ref, now)).toBeNull();

    const huge = "x".repeat(2 * 1024 * 1024);
    sessionStorage.setItem(cacheKey(ref), huge);
    expect(getCachedReport(ref, now)).toBeNull();
  });

  it.each([
    [
      "ruleset",
      (report: AnalysisReport) => {
        Object.assign(report, { rulesetVersion: "2.0.0" });
      },
    ],
    [
      "dimension set",
      (report: AnalysisReport) => {
        report.dimensions.pop();
      },
    ],
    [
      "duplicate rule ID",
      (report: AnalysisReport) => {
        const first = report.dimensions[0]?.rules[0];
        const second = report.dimensions[0]?.rules[1];
        if (first !== undefined && second !== undefined) second.id = first.id;
      },
    ],
    [
      "non-finite count",
      (report: AnalysisReport) => {
        report.coverage.fetchedFiles = Number.POSITIVE_INFINITY;
      },
    ],
    [
      "more skipped details than the aggregate count",
      (report: AnalysisReport) => {
        report.coverage.skippedFiles = 1;
        report.coverage.skipped = [
          { path: "excluded/file.txt", reason: "excluded" },
          { path: "excluded/other.txt", reason: "excluded" },
        ];
      },
    ],
    [
      "out-of-range points",
      (report: AnalysisReport) => {
        const rule = report.dimensions[0]?.rules[0];
        if (rule !== undefined) rule.earned = rule.available + 1;
      },
    ],
    [
      "invalid enum",
      (report: AnalysisReport) => {
        Object.assign(report.confidence, { label: "certain" });
      },
    ],
    [
      "invalid path",
      (report: AnalysisReport) => {
        const reference = report.strengths[0]?.references[0];
        if (reference !== undefined) reference.path = "../source.ts";
      },
    ],
    [
      "invalid ISO timestamp",
      (report: AnalysisReport) => {
        report.repository.analyzedAt = "2026-02-31T00:00:00.000Z";
      },
    ],
    [
      "invalid commit SHA",
      (report: AnalysisReport) => {
        report.repository.commitSha = "main";
      },
    ],
    [
      "source-text field",
      (report: AnalysisReport) => {
        const rule = report.dimensions[0]?.rules[0];
        if (rule !== undefined) {
          Object.assign(rule.evidence, { sourceText: "remote source" });
        }
      },
    ],
  ])("removes a cache entry with invalid nested %s", (_name, mutate) => {
    const report = validReport();
    mutate(report);
    sessionStorage.setItem(
      cacheKey(ref),
      JSON.stringify({ savedAt: now, report }),
    );
    expect(getCachedReport(ref, now)).toBeNull();
    expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
  });

  it("degrades when storage operations throw", () => {
    const get = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    expect(getCachedReport(ref, now)).toBeNull();
    get.mockRestore();

    const set = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(() => {
      setCachedReport(ref, validReport(), now);
    }).not.toThrow();
    set.mockRestore();

    const remove = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    expect(() => {
      removeCachedReport(ref);
    }).not.toThrow();
    remove.mockRestore();
  });
});
