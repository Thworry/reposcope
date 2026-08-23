import { describe, expect, it } from "vitest";

import {
  DEEP_ANALYSIS_REQUEST_FIXTURE,
  DEEP_REPORT_FIXTURE,
} from "../../test/fixtures/deep-analysis";
import type { DeepAnalysisEvent, DeepReport } from "./model";
import {
  DeepEventSequenceGuard,
  isDeepAnalysisEvent,
  isDeepAnalysisRequest,
  isDeepReport,
  reportMatchesDeepRequest,
} from "./guards";

function reportFixture(): DeepReport {
  return structuredClone(DEEP_REPORT_FIXTURE);
}

function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw new Error("Missing deep-analysis fixture value");
  return value;
}

describe("isDeepAnalysisRequest", () => {
  it("accepts only exact canonical repository requests", () => {
    expect(isDeepAnalysisRequest(DEEP_ANALYSIS_REQUEST_FIXTURE)).toBe(true);
    expect(
      isDeepAnalysisRequest({ ...DEEP_ANALYSIS_REQUEST_FIXTURE, extra: true }),
    ).toBe(false);
    expect(
      isDeepAnalysisRequest({
        ...DEEP_ANALYSIS_REQUEST_FIXTURE,
        repository: {
          ...DEEP_ANALYSIS_REQUEST_FIXTURE.repository,
          owner: "bad/owner",
        },
      }),
    ).toBe(false);
    expect(
      isDeepAnalysisRequest({
        ...DEEP_ANALYSIS_REQUEST_FIXTURE,
        repository: {
          ...DEEP_ANALYSIS_REQUEST_FIXTURE.repository,
          commitSha: "A".repeat(40),
        },
      }),
    ).toBe(false);
  });
});

describe("isDeepReport", () => {
  it("accepts the complete exact fixture", () => {
    expect(isDeepReport(DEEP_REPORT_FIXTURE)).toBe(true);
  });

  it("rejects unknown keys, accessors, proxies, and sparse arrays", () => {
    expect(isDeepReport({ ...DEEP_REPORT_FIXTURE, surprise: true })).toBe(
      false,
    );

    const accessor = reportFixture();
    let reads = 0;
    Object.defineProperty(accessor.orientation, "summary", {
      enumerable: true,
      get() {
        reads += 1;
        return [];
      },
    });
    expect(isDeepReport(accessor)).toBe(false);
    expect(reads).toBe(0);

    const proxied = reportFixture();
    proxied.review = new Proxy(proxied.review, {});
    expect(isDeepReport(proxied)).toBe(false);

    const sparse = reportFixture();
    sparse.evidence = new Array(4) as DeepReport["evidence"];
    expect(isDeepReport(sparse)).toBe(false);
  });

  it("rejects unknown evidence and assertive statements without evidence", () => {
    const unknownEvidence = reportFixture();
    required(unknownEvidence.orientation.summary[0]).evidenceIds = ["ev-9999"];
    expect(isDeepReport(unknownEvidence)).toBe(false);

    expect(
      isDeepReport({
        ...DEEP_REPORT_FIXTURE,
        orientation: {
          ...DEEP_REPORT_FIXTURE.orientation,
          summary: [
            {
              text: "Definitely safe",
              provenance: "interpretation",
              confidence: "high",
              evidenceIds: [],
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it("enforces provenance, uncertainty, normalized uniqueness, and safe text", () => {
    const unsupported = reportFixture();
    required(unsupported.fit.goodFor[0]).provenance = "prediction" as never;
    expect(isDeepReport(unsupported)).toBe(false);

    const overconfidentUnknown = reportFixture();
    required(overconfidentUnknown.trust.unknowns[0]).confidence = "medium";
    expect(isDeepReport(overconfidentUnknown)).toBe(false);

    const groundedUnknown = reportFixture();
    required(groundedUnknown.trust.unknowns[0]).evidenceIds = ["ev-0001"];
    expect(isDeepReport(groundedUnknown)).toBe(true);

    const assertiveUnknown = reportFixture();
    required(assertiveUnknown.trust.unknowns[0]).provenance = "observed-fact";
    required(assertiveUnknown.trust.unknowns[0]).evidenceIds = ["ev-0001"];
    expect(isDeepReport(assertiveUnknown)).toBe(false);

    const duplicate = reportFixture();
    required(duplicate.fit.poorFor[0]).text = `  ${required(
      duplicate.fit.goodFor[0],
    ).text.normalize("NFKD")}  `;
    expect(isDeepReport(duplicate)).toBe(false);

    const unsafeUnicode = reportFixture();
    required(unsafeUnicode.workflow[0]).text =
      "Visible text\u202Ehidden direction";
    expect(isDeepReport(unsafeUnicode)).toBe(false);

    const credential = reportFixture();
    required(credential.orientation.summary[0]).text = `ghp_${"a".repeat(36)}`;
    expect(isDeepReport(credential)).toBe(false);
  });

  it("enforces caps, repository identities, canonical evidence IDs, and URLs", () => {
    const oversized = reportFixture();
    oversized.workflow = Array.from({ length: 11 }, (_, index) => ({
      text: `Workflow item ${String(index)}`,
      provenance: "observed-fact" as const,
      confidence: "high" as const,
      evidenceIds: ["ev-0001"],
    }));
    expect(isDeepReport(oversized)).toBe(false);

    const invalidIdentity = reportFixture();
    invalidIdentity.repository.owner = "example/other";
    expect(isDeepReport(invalidIdentity)).toBe(false);

    const skippedEvidenceId = reportFixture();
    required(skippedEvidenceId.evidence[1]).id = "ev-0003";
    expect(isDeepReport(skippedEvidenceId)).toBe(false);

    const crossRepositoryFile = reportFixture();
    required(crossRepositoryFile.evidence[1]).url =
      `https://github.com/other/project/blob/${"a".repeat(40)}/README.md`;
    expect(isDeepReport(crossRepositoryFile)).toBe(false);

    const alternativeRedirect = reportFixture();
    required(alternativeRedirect.evidence[3]).url =
      "https://github.com/sample/alternative?redirect=true";
    expect(isDeepReport(alternativeRedirect)).toBe(false);
  });
});

describe("reportMatchesDeepRequest", () => {
  it("matches repository identity, immutable commit, and language", () => {
    expect(
      reportMatchesDeepRequest(
        DEEP_REPORT_FIXTURE,
        DEEP_ANALYSIS_REQUEST_FIXTURE,
      ),
    ).toBe(true);
    expect(
      reportMatchesDeepRequest(DEEP_REPORT_FIXTURE, {
        ...DEEP_ANALYSIS_REQUEST_FIXTURE,
        language: "zh-CN",
      }),
    ).toBe(false);
    expect(
      reportMatchesDeepRequest(DEEP_REPORT_FIXTURE, {
        ...DEEP_ANALYSIS_REQUEST_FIXTURE,
        repository: {
          ...DEEP_ANALYSIS_REQUEST_FIXTURE.repository,
          commitSha: "b".repeat(40),
        },
      }),
    ).toBe(false);
  });
});

function validEventSequence(): DeepAnalysisEvent[] {
  return [
    { type: "stage", stage: "preparing-evidence" },
    { type: "stage", stage: "consulting-specialists" },
    { type: "specialist", role: "product", status: "started" },
    { type: "specialist", role: "product", status: "complete" },
    {
      type: "specialist",
      role: "onboarding-architecture",
      status: "started",
    },
    {
      type: "specialist",
      role: "onboarding-architecture",
      status: "complete",
    },
    { type: "specialist", role: "trust-ecosystem", status: "started" },
    { type: "specialist", role: "trust-ecosystem", status: "complete" },
    { type: "stage", stage: "challenging-findings" },
    { type: "stage", stage: "editing-briefing" },
    { type: "stage", stage: "validating-sources" },
    { type: "complete", report: reportFixture() },
  ];
}

describe("deep-analysis events", () => {
  it("validates exact individual events", () => {
    expect(
      isDeepAnalysisEvent({ type: "stage", stage: "preparing-evidence" }),
    ).toBe(true);
    expect(
      isDeepAnalysisEvent({
        type: "error",
        error: { kind: "internal", detail: "secret" },
      }),
    ).toBe(false);
    expect(
      isDeepAnalysisEvent({ type: "complete", report: reportFixture() }),
    ).toBe(true);
  });

  it("accepts an ordered sequence and exactly one terminal event", () => {
    const guard = new DeepEventSequenceGuard(DEEP_ANALYSIS_REQUEST_FIXTURE);
    for (const event of validEventSequence())
      expect(guard.accept(event)).toBe(true);
    expect(guard.terminated).toBe(true);
    expect(guard.finish()).toBe(true);
    expect(guard.accept({ type: "error", error: { kind: "internal" } })).toBe(
      false,
    );
  });

  it("accepts the preparation-to-validation cache-hit subsequence", () => {
    const guard = new DeepEventSequenceGuard(DEEP_ANALYSIS_REQUEST_FIXTURE);
    expect(guard.accept({ type: "stage", stage: "preparing-evidence" })).toBe(
      true,
    );
    expect(guard.accept({ type: "stage", stage: "validating-sources" })).toBe(
      true,
    );
    expect(guard.accept({ type: "complete", report: reportFixture() })).toBe(
      true,
    );
    expect(guard.finish()).toBe(true);
  });

  it("does not finish an unterminated stream", () => {
    const guard = new DeepEventSequenceGuard();
    expect(guard.accept({ type: "stage", stage: "preparing-evidence" })).toBe(
      true,
    );
    expect(guard.finish()).toBe(false);
  });

  it("rejects invalid stage order and specialist transitions", () => {
    const skippedStage = new DeepEventSequenceGuard();
    expect(
      skippedStage.accept({ type: "stage", stage: "consulting-specialists" }),
    ).toBe(false);

    const outsideStage = new DeepEventSequenceGuard();
    expect(
      outsideStage.accept({ type: "stage", stage: "preparing-evidence" }),
    ).toBe(true);
    expect(
      outsideStage.accept({
        type: "specialist",
        role: "product",
        status: "started",
      }),
    ).toBe(false);

    const illegalTransition = new DeepEventSequenceGuard();
    expect(
      illegalTransition.accept({ type: "stage", stage: "preparing-evidence" }),
    ).toBe(true);
    expect(
      illegalTransition.accept({
        type: "stage",
        stage: "consulting-specialists",
      }),
    ).toBe(true);
    expect(
      illegalTransition.accept({
        type: "specialist",
        role: "product",
        status: "complete",
      }),
    ).toBe(false);
    expect(
      illegalTransition.accept({
        type: "stage",
        stage: "challenging-findings",
      }),
    ).toBe(false);
  });
});
