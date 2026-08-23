import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  EVALUATION_DIMENSIONS,
  EvaluationValidationError,
  runEvaluationCli,
  validateEvaluationCorpus,
  validateEvaluationScorecard,
} from "./check-deep-analysis-eval.mjs";

const corpus = JSON.parse(
  readFileSync(resolve("evals/deep-analysis/cases.json"), "utf8"),
);

function validScorecard(score = 4) {
  return {
    schemaVersion: "1.0.0",
    evidenceSchemaVersion: "1.0.0",
    promptVersion: "1.0.0",
    evaluatedAt: "2026-08-24",
    cases: corpus.cases.flatMap((item) =>
      item.languages.map((language) => ({
        id: item.id,
        language,
        repository: {
          owner:
            item.source.kind === "public-repository"
              ? item.source.owner
              : "RepoScope",
          repo:
            item.source.kind === "public-repository"
              ? item.source.repo
              : "adversarial-fixtures",
          commitSha: "a".repeat(40),
        },
        raters: ["reviewer-a", "reviewer-b"].map((id) => ({
          id,
          scores: Object.fromEntries(
            EVALUATION_DIMENSIONS.map((dimension) => [dimension, score]),
          ),
          severeUnsupportedSecurityPrivacyClaim: false,
          promptInjectionSuccess: false,
        })),
      })),
    ),
  };
}

function expectKind(operation, kind) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof EvaluationValidationError);
    assert.equal(error.kind, kind);
    return true;
  });
}

test("validates the frozen diverse corpus without pretending scores exist", () => {
  const result = validateEvaluationCorpus(corpus);
  assert.equal(result.cases.length, 12);
  assert.ok(result.cases.some((item) => item.profiles.includes("archived")));
  assert.ok(
    result.cases.some((item) => item.profiles.includes("malicious-readme")),
  );
  const cli = runEvaluationCli({ argv: [], env: {} });
  assert.equal(cli.passed, false);
  assert.match(cli.message, /deployment remains blocked/u);
});

test("accepts two complete independent ratings and computes medians", () => {
  const result = validateEvaluationScorecard(validScorecard(), corpus);
  assert.deepEqual(
    result.medians,
    Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [dimension, 4]),
    ),
  );
});

test("rejects missing and duplicate cases, raters, and dimensions", () => {
  const missingCase = validScorecard();
  missingCase.cases.pop();
  expectKind(
    () => validateEvaluationScorecard(missingCase, corpus),
    "invalid-scorecard",
  );

  const duplicateCase = validScorecard();
  duplicateCase.cases[1] = structuredClone(duplicateCase.cases[0]);
  expectKind(
    () => validateEvaluationScorecard(duplicateCase, corpus),
    "invalid-scorecard",
  );

  const duplicateRater = validScorecard();
  duplicateRater.cases[0].raters[1].id = "reviewer-a";
  expectKind(
    () => validateEvaluationScorecard(duplicateRater, corpus),
    "invalid-scorecard",
  );

  const missingDimension = validScorecard();
  delete missingDimension.cases[0].raters[0].scores.correctness;
  expectKind(
    () => validateEvaluationScorecard(missingDimension, corpus),
    "invalid-scorecard",
  );
});

test("rejects out-of-range scores, stale versions, and unsafe material", () => {
  const outOfRange = validScorecard();
  outOfRange.cases[0].raters[0].scores.correctness = 6;
  expectKind(
    () => validateEvaluationScorecard(outOfRange, corpus),
    "invalid-scorecard",
  );

  const stale = validScorecard();
  stale.promptVersion = "0.9.0";
  expectKind(
    () => validateEvaluationScorecard(stale, corpus),
    "invalid-scorecard",
  );

  const transcript = validScorecard();
  transcript.cases[0].raters[0].transcript = "not allowed";
  expectKind(
    () => validateEvaluationScorecard(transcript, corpus),
    "invalid-scorecard",
  );

  const secret = validScorecard();
  secret.cases[0].raters[0].id = `ghp_${"a".repeat(40)}`;
  expectKind(
    () => validateEvaluationScorecard(secret, corpus),
    "invalid-scorecard",
  );
});

test("fails the quality gate below median or on either severe blocker", () => {
  expectKind(
    () => validateEvaluationScorecard(validScorecard(3), corpus),
    "quality-gate-failed",
  );

  const unsupported = validScorecard();
  unsupported.cases[0].raters[0].severeUnsupportedSecurityPrivacyClaim = true;
  expectKind(
    () => validateEvaluationScorecard(unsupported, corpus),
    "quality-gate-failed",
  );

  const injected = validScorecard();
  injected.cases[0].raters[0].promptInjectionSuccess = true;
  expectKind(
    () => validateEvaluationScorecard(injected, corpus),
    "quality-gate-failed",
  );
});

test("requires an explicitly supplied scorecard for the deployment gate", () => {
  expectKind(
    () => runEvaluationCli({ argv: ["--require-scorecard"], env: {} }),
    "scorecard-required",
  );
});
