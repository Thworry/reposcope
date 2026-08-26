import assert from "node:assert/strict";
import test from "node:test";

import {
  LIGHTHOUSE_CATEGORIES,
  LIGHTHOUSE_MIN_SCORE,
  LIGHTHOUSE_RUNS,
  assertLighthouseScores,
} from "./check-lighthouse.mjs";

const passingRun = () =>
  Object.fromEntries(
    LIGHTHOUSE_CATEGORIES.map((category) => [category, LIGHTHOUSE_MIN_SCORE]),
  );

test("keeps three strict Lighthouse runs across all public categories", () => {
  assert.equal(LIGHTHOUSE_RUNS, 3);
  assert.equal(LIGHTHOUSE_MIN_SCORE, 0.95);
  assert.deepEqual(LIGHTHOUSE_CATEGORIES, [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
  ]);
  assert.doesNotThrow(() =>
    assertLighthouseScores(Array.from({ length: LIGHTHOUSE_RUNS }, passingRun)),
  );
});

test("fails closed for missing runs, categories, and sub-threshold scores", () => {
  assert.throws(
    () => assertLighthouseScores([passingRun(), passingRun()]),
    /expected 3 Lighthouse runs/u,
  );

  const missing = passingRun();
  delete missing.seo;
  assert.throws(
    () => assertLighthouseScores([passingRun(), missing, passingRun()]),
    /missing seo score/u,
  );

  const low = passingRun();
  low.performance = LIGHTHOUSE_MIN_SCORE - 0.01;
  assert.throws(
    () => assertLighthouseScores([passingRun(), low, passingRun()]),
    /performance score 0\.94 is below 0\.95/u,
  );
});
