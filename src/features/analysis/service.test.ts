import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  perfectCoverage,
  perfectCycles,
  perfectDuplicates,
  perfectGeneralMetrics,
  perfectLanguageAnalysis,
  perfectRepository,
} from "../../test/fixtures/metrics";
import { buildFindings } from "../rules/findings";
import { scoreProject } from "../rules/rules";
import type { AnalysisReport } from "./model";
import { analyzeRepository } from "./service";

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
    overall: scored.overall,
    confidence: scored.confidence,
    dimensions: scored.dimensions,
    strengths: findings.strengths,
    weaknesses: findings.weaknesses,
    coverage: perfectCoverage,
  };
}

describe("analyzeRepository", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("uses a fresh cache unless forced and stores validated success", async () => {
    const report = validReport();
    const runner = vi.fn(() => ({
      promise: Promise.resolve(report),
      cancel: vi.fn(),
    }));
    await expect(
      analyzeRepository(
        { owner: "example", repo: "project" },
        { runner, nowMs: () => 1_000 },
      ),
    ).resolves.toEqual(report);
    expect(runner).toHaveBeenLastCalledWith(
      { owner: "example", repo: "project" },
      { analyzedAt: "1970-01-01T00:00:01.000Z" },
    );
    await analyzeRepository(
      { owner: "EXAMPLE", repo: "PROJECT" },
      { runner, nowMs: () => 1_001 },
    );
    expect(runner).toHaveBeenCalledOnce();
    await analyzeRepository(
      { owner: "example", repo: "project" },
      { force: true, runner, nowMs: () => 1_002 },
    );
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid internal clock before starting a worker", async () => {
    const runner = vi.fn();

    await expect(
      analyzeRepository(
        { owner: "example", repo: "project" },
        { runner, nowMs: () => Number.NaN },
      ),
    ).rejects.toMatchObject({ detail: { kind: "worker" } });
    expect(runner).not.toHaveBeenCalled();
  });

  it("preserves caller aborts and cancels the worker", async () => {
    const cancel = vi.fn();
    const runner = vi.fn(() => ({
      promise: new Promise<never>(() => undefined),
      cancel,
    }));
    const controller = new AbortController();
    const promise = analyzeRepository(
      { owner: "example", repo: "project" },
      { signal: controller.signal, runner },
    );
    controller.abort(new DOMException("stop", "AbortError"));
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
