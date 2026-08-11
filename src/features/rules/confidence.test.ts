import { describe, expect, it } from "vitest";

import { perfectCoverage } from "../../test/fixtures/metrics";
import { calculateConfidence, confidenceLabel } from "./confidence";

describe("confidence", () => {
  it("weights tree, eligible bytes, and parser bytes exactly", () => {
    expect(
      calculateConfidence({
        ...perfectCoverage,
        treeComplete: false,
        eligibleBytes: 100,
        fetchedBytes: 100,
        eligibleSourceBytes: 100,
        parsedSupportedBytes: 100,
      }),
    ).toEqual({ percent: 75, label: "medium" });
    expect(
      calculateConfidence({
        ...perfectCoverage,
        treeComplete: true,
        eligibleBytes: 100,
        fetchedBytes: 100,
        eligibleSourceBytes: 100,
        parsedSupportedBytes: 0,
      }),
    ).toEqual({ percent: 60, label: "medium" });
  });

  it.each([
    [59, "low"],
    [60, "medium"],
    [79, "medium"],
    [80, "high"],
  ] as const)(
    "uses the raw confidence threshold at %s",
    (rawPercent, label) => {
      expect(confidenceLabel(rawPercent)).toBe(label);
    },
  );

  it("rounds display without changing the raw label", () => {
    const result = calculateConfidence({
      ...perfectCoverage,
      treeComplete: true,
      eligibleBytes: 100,
      fetchedBytes: 100,
      eligibleSourceBytes: 1_000,
      parsedSupportedBytes: 499,
    });
    expect(result).toEqual({ percent: 80, label: "medium" });
  });

  it("clamps hostile counts and treats zero denominators as uncovered", () => {
    expect(
      calculateConfidence({
        ...perfectCoverage,
        treeComplete: false,
        eligibleBytes: Number.NaN,
        fetchedBytes: Number.POSITIVE_INFINITY,
        eligibleSourceBytes: -1,
        parsedSupportedBytes: 100,
      }),
    ).toEqual({ percent: 0, label: "low" });
  });
});
