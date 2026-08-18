import { describe, expect, it } from "vitest";

import { perfectReaderReport } from "../../test/fixtures/metrics";
import * as readerReportPolicy from "./reader-report-policy";
import {
  READER_ACTIVITY_BANDS,
  READER_AVAILABILITY,
  READER_COMMAND_KINDS,
  READER_COMMENTARY_IDS,
  READER_ECOSYSTEMS,
  READER_QUESTION_IDS,
  READER_SIGNAL_IDS,
  RELIABILITY_STATUSES,
  type ReaderQuestionId,
  type ReaderSignalFact,
  type ReaderSignalId,
  type ReaderSignalState,
} from "./model";
import {
  PRACTICAL_IDS,
  VERIFY_IDS,
  WORTH_NOTING_IDS,
  activityBand,
  activityState,
  deriveReaderAvailability,
  deriveReadmeAvailability,
  deriveReaderQuestions,
  deriveReliabilityStatus,
} from "./reader-report-policy";

type SignalStates = Partial<Record<ReaderSignalId, ReaderSignalState>>;

function signalFacts(states: SignalStates): ReaderSignalFact[] {
  return READER_SIGNAL_IDS.map((signal) => ({
    signal,
    state: states[signal] ?? "absent",
    source:
      signal === "archived" || signal === "recent-activity"
        ? "github-metadata"
        : "analysis",
    path: null,
  }));
}

const complete = {
  archived: "absent",
  install: "present",
  run: "present",
  license: "present",
  "recent-activity": "present",
  tests: "present",
  ci: "absent",
} as const;

describe("reader report reliability policy", () => {
  it("freezes the exact reader-report vocabulary", () => {
    const vocabularies = [
      [READER_AVAILABILITY, ["available", "partial", "unavailable"]],
      [
        RELIABILITY_STATUSES,
        ["continue-evaluation", "verify-before-use", "insufficient-evidence"],
      ],
      [
        READER_SIGNAL_IDS,
        [
          "archived",
          "install",
          "run",
          "license",
          "recent-activity",
          "tests",
          "ci",
          "coverage",
          "security-policy",
          "version-history",
          "contributing",
          "issue-templates",
          "dependency-updates",
          "configuration",
        ],
      ],
      [
        READER_QUESTION_IDS,
        [
          "license-compatibility",
          "reproduce-install-run",
          "runtime-data-flow",
          "vulnerability-process",
          "release-compatibility",
        ],
      ],
      [READER_COMMAND_KINDS, ["install", "run", "develop", "test", "build"]],
      [
        READER_ECOSYSTEMS,
        [
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
        ],
      ],
      [
        READER_ACTIVITY_BANDS,
        ["within-180-days", "181-365-days", "over-365-days"],
      ],
    ] as const;

    for (const [actual, expected] of vocabularies) {
      expect(actual).toEqual(expected);
      expect(Object.isFrozen(actual)).toBe(true);
    }
  });

  it.each([
    [complete, "continue-evaluation"],
    [{ ...complete, archived: "present" }, "verify-before-use"],
    [{ ...complete, license: "absent" }, "verify-before-use"],
    [{ ...complete, install: "absent" }, "verify-before-use"],
    [{ ...complete, run: "absent" }, "verify-before-use"],
    [{ ...complete, "recent-activity": "absent" }, "verify-before-use"],
    [{ ...complete, tests: "absent", ci: "absent" }, "verify-before-use"],
    [{ ...complete, license: "unknown" }, "insufficient-evidence"],
    [{ ...complete, tests: "unknown", ci: "absent" }, "insufficient-evidence"],
    [{ ...complete, tests: "absent", ci: "unknown" }, "insufficient-evidence"],
  ] as const)("derives %s", (states, expected) => {
    expect(deriveReliabilityStatus(signalFacts(states))).toBe(expected);
  });

  it("accepts either tests or CI as a meaningful automated verification path", () => {
    expect(
      deriveReliabilityStatus(
        signalFacts({ ...complete, tests: "absent", ci: "present" }),
      ),
    ).toBe("continue-evaluation");
  });

  it("does not let optional coverage or security-policy signals promote status", () => {
    expect(
      deriveReliabilityStatus(
        signalFacts({
          ...complete,
          coverage: "absent",
          "security-policy": "absent",
        }),
      ),
    ).toBe("continue-evaluation");
  });

  it("treats metadata-only repositories as insufficient evidence", () => {
    expect(
      deriveReliabilityStatus(
        signalFacts({ archived: "absent", "recent-activity": "present" }),
      ),
    ).toBe("insufficient-evidence");
  });

  it("treats a missing decisive signal as unknown evidence", () => {
    const withoutLicense = signalFacts(complete).filter(
      ({ signal }) => signal !== "license",
    );

    expect(deriveReliabilityStatus(withoutLicense)).toBe(
      "insufficient-evidence",
    );
  });

  it("preserves canonical signal order", () => {
    expect(signalFacts(complete).map(({ signal }) => signal)).toEqual(
      READER_SIGNAL_IDS,
    );
  });

  it("provides a canonical complete reader-report fixture", () => {
    expect(
      perfectReaderReport.reliability.signals.map(({ signal }) => signal),
    ).toEqual(READER_SIGNAL_IDS);
    expect(
      perfectReaderReport.gettingStarted.commands.map(({ kind }) => kind),
    ).toEqual(READER_COMMAND_KINDS);
    expect(perfectReaderReport.scenarios.facts.length).toBeLessThanOrEqual(3);
    expect(perfectReaderReport.reliability.status).toBe("continue-evaluation");
    expect(perfectReaderReport.alternatives.searchTerms).toEqual([
      "application",
      "repository-analysis",
      "typescript",
    ]);
    expect(
      perfectReaderReport.alternatives.searchTerms.every((term) =>
        /^[a-z0-9][a-z0-9-]{0,49}$/u.test(term),
      ),
    ).toBe(true);

    for (const fact of perfectReaderReport.reliability.signals) {
      const metadataSignal =
        fact.signal === "archived" || fact.signal === "recent-activity";
      expect(fact.source).toBe(metadataSignal ? "github-metadata" : "analysis");
      expect(fact.path).toBeNull();
    }
  });

  it.each([
    [180, "present"],
    [181, "absent"],
    [365, "absent"],
    [366, "absent"],
  ] as const)(
    "uses the existing exact UTC activity boundary at %i days",
    (days, expected) => {
      expect(activityState(days, false)).toBe(expected);
    },
  );

  it("treats archived repositories as inactive inside the 180-day window", () => {
    expect(activityState(0, true)).toBe("absent");
  });

  it("uses fractional exact UTC days without rounding", () => {
    const oneMillisecondInDays = 1 / 86_400_000;

    expect(activityState(179.5, false)).toBe("present");
    expect(activityState(180 - oneMillisecondInDays, false)).toBe("present");
    expect(activityState(180 + oneMillisecondInDays, false)).toBe("absent");
    expect(activityBand(179.5)).toBe("within-180-days");
    expect(activityBand(180 + oneMillisecondInDays)).toBe("181-365-days");
    expect(activityBand(365 + oneMillisecondInDays)).toBe("over-365-days");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "fails closed for invalid elapsed days: %s",
    (elapsedUtcDays) => {
      expect(activityState(elapsedUtcDays, false)).toBe("unknown");
      expect(() => activityBand(elapsedUtcDays)).toThrow(RangeError);
    },
  );

  it.each([
    [180, "within-180-days"],
    [181, "181-365-days"],
    [365, "181-365-days"],
    [366, "over-365-days"],
  ] as const)("bands %i exact UTC days", (days, expected) => {
    expect(activityBand(days)).toBe(expected);
  });

  it.each([
    [0, true, "unavailable"],
    [1, true, "available"],
    [0, false, "partial"],
    [1, false, "partial"],
  ] as const)(
    "derives %s items with complete=%s as %s",
    (itemCount, coverageComplete, expected) => {
      expect(deriveReaderAvailability(itemCount, coverageComplete)).toBe(
        expected,
      );
    },
  );

  it.each([
    [
      { ...complete, "security-policy": "present" },
      ["license-compatibility", "reproduce-install-run", "runtime-data-flow"],
    ],
    [
      { ...complete, "security-policy": "absent" },
      [
        "license-compatibility",
        "reproduce-install-run",
        "vulnerability-process",
        "runtime-data-flow",
      ],
    ],
    [
      {
        ...complete,
        archived: "present",
        "security-policy": "absent",
      },
      [
        "license-compatibility",
        "reproduce-install-run",
        "release-compatibility",
        "vulnerability-process",
      ],
    ],
    [
      {
        ...complete,
        "recent-activity": "absent",
        "security-policy": "present",
      },
      [
        "license-compatibility",
        "reproduce-install-run",
        "release-compatibility",
        "runtime-data-flow",
      ],
    ],
  ] as const)(
    "derives prioritized verification questions for %s",
    (states, expected) => {
      expect(
        deriveReaderQuestions(
          deriveReliabilityStatus(signalFacts(states)),
          signalFacts(states),
        ),
      ).toEqual(expected);
    },
  );

  it("returns only canonical, unique questions and caps them at four", () => {
    const questions = deriveReaderQuestions(
      "insufficient-evidence",
      signalFacts({
        archived: "present",
        "recent-activity": "absent",
        "security-policy": "unknown",
      }),
    );
    const canonicalQuestions: readonly ReaderQuestionId[] = READER_QUESTION_IDS;

    expect(questions).toHaveLength(4);
    expect(new Set(questions).size).toBe(questions.length);
    expect(
      questions.every((question) => canonicalQuestions.includes(question)),
    ).toBe(true);
    expect(questions).toEqual([
      "license-compatibility",
      "reproduce-install-run",
      "release-compatibility",
      "vulnerability-process",
    ]);
  });
});

describe("README interpretation policy", () => {
  it("freezes exact raw manifest names separately from normalized serialized IDs", () => {
    const expected = {
      "build.gradle": "build.gradle",
      "build.gradle.kts": "build.gradle.kts",
      "Cargo.toml": "cargo.toml",
      "composer.json": "composer.json",
      Gemfile: "gemfile",
      "go.mod": "go.mod",
      "package.json": "package.json",
      "Package.swift": "package.swift",
      "pom.xml": "pom.xml",
      "pubspec.yaml": "pubspec.yaml",
      "pyproject.toml": "pyproject.toml",
    } as const;
    const policy = readerReportPolicy as unknown as {
      READER_CONVENTIONAL_MANIFEST_RAW_NAME_TO_ID?: unknown;
      observedReaderConventionalManifest(value: string): string | null;
      readerConventionalManifest(value: string): string | null;
    };

    expect(policy.READER_CONVENTIONAL_MANIFEST_RAW_NAME_TO_ID).toEqual(
      expected,
    );
    expect(
      Object.isFrozen(policy.READER_CONVENTIONAL_MANIFEST_RAW_NAME_TO_ID),
    ).toBe(true);
    for (const [rawName, id] of Object.entries(expected)) {
      expect(policy.observedReaderConventionalManifest(rawName)).toBe(id);
    }
    expect(policy.observedReaderConventionalManifest("cargo.toml")).toBeNull();
    expect(
      policy.observedReaderConventionalManifest("Package.json"),
    ).toBeNull();
    expect(
      policy.observedReaderConventionalManifest("Ｐａｃｋａｇｅ．ｊｓｏｎ"),
    ).toBeNull();
    expect(policy.readerConventionalManifest("ＣＡＲＧＯ．ＴＯＭＬ")).toBe(
      "cargo.toml",
    );
  });

  it("freezes the exact commentary vocabulary and canonical groups", () => {
    expect(READER_COMMENTARY_IDS).toEqual([
      "readme-substantial-overview",
      "readme-audience-or-use-cases-documented",
      "readme-capabilities-documented",
      "readme-workflow-documented",
      "readme-onboarding-documented",
      "readme-limitations-documented",
      "readme-maturity-documented",
      "readme-broad-structure-corroborated",
      "readme-security-data-flow-unestablished",
      "readme-limitations-unestablished",
      "readme-maturity-unestablished",
      "readme-broad-structure-needs-verification",
      "readme-external-dependencies-declared",
    ]);
    expect(WORTH_NOTING_IDS).toEqual(READER_COMMENTARY_IDS.slice(0, 8));
    expect(VERIFY_IDS).toEqual(READER_COMMENTARY_IDS.slice(8, 12));
    expect(PRACTICAL_IDS).toEqual(READER_COMMENTARY_IDS.slice(12));
    expect(Object.isFrozen(READER_COMMENTARY_IDS)).toBe(true);
    expect(Object.isFrozen(WORTH_NOTING_IDS)).toBe(true);
    expect(Object.isFrozen(VERIFY_IDS)).toBe(true);
    expect(Object.isFrozen(PRACTICAL_IDS)).toBe(true);
  });

  it.each([
    ["missing", 0, "unavailable"],
    ["missing", 5, "unavailable"],
    ["incomplete", 0, "partial"],
    ["incomplete", 5, "partial"],
    ["fetched", 0, "unavailable"],
    ["fetched", 5, "available"],
  ] as const)(
    "derives %s with %i safe facts as %s",
    (preferredReadmeState, safeFactCount, expected) => {
      expect(
        deriveReadmeAvailability({ preferredReadmeState, safeFactCount }),
      ).toBe(expected);
    },
  );
});
