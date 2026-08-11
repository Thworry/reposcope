import { describe, expect, it } from "vitest";

import type { DimensionKey, RuleResult } from "../analysis/model";
import { buildFindings, type ScoredProject } from "./findings";

function rule(
  id: string,
  dimension: DimensionKey,
  state: RuleResult["state"],
  earned: number,
  available: number,
  withReference = true,
): RuleResult {
  return {
    id,
    dimension,
    state,
    earned,
    available,
    evidence: { key: `evidence.${id}`, args: { value: earned } },
    recommendation: {
      key: `recommendation.${id}`,
      args: { threshold: available },
    },
    references: withReference
      ? [{ path: `${id}.ts`, startLine: 1, endLine: 2 }]
      : [],
  };
}

function project(rules: RuleResult[]): ScoredProject {
  return {
    rules,
    dimensions: [],
    overall: {
      score: 0,
      label: "limited",
      generalOnly: false,
      preliminary: false,
    },
    confidence: { percent: 100, label: "high" },
  };
}

describe("finding selection", () => {
  it("caps strengths at five and at two per dimension with stable ordering", () => {
    const findings = buildFindings(
      project([
        rule("z", "documentation", "passed", 5, 5),
        rule("a", "documentation", "passed", 5, 5),
        rule("b", "documentation", "passed", 4, 4),
        rule("c", "testing", "passed", 4, 4),
        rule("d", "maintenance", "passed", 3, 3),
        rule("e", "complexity", "passed", 2, 2),
        rule("f", "readability", "passed", 1, 1),
      ]),
    );

    expect(findings.strengths.map(({ ruleId }) => ruleId)).toEqual([
      "a",
      "z",
      "c",
      "d",
      "e",
    ]);
  });

  it("assigns high, medium, and low priorities and orders lost points then rule ID", () => {
    const findings = buildFindings(
      project([
        rule("high.four", "documentation", "failed", 0, 4),
        rule("cluster.a", "testing", "failed", 0, 3),
        rule("cluster.b", "testing", "failed", 0, 3),
        rule("medium.failed", "maintenance", "failed", 0, 1),
        rule("maintenance.passed", "maintenance", "passed", 9, 9),
        rule("medium.partial", "readability", "partial", 1, 3),
        rule("low.partial", "complexity", "partial", 1, 2),
      ]),
    );

    expect(
      findings.weaknesses.map(({ ruleId, severity }) => [ruleId, severity]),
    ).toEqual([
      ["high.four", "high"],
      ["cluster.a", "high"],
      ["cluster.b", "high"],
      ["medium.partial", "medium"],
      ["medium.failed", "medium"],
      ["low.partial", "low"],
    ]);
  });

  it("keeps only concrete, bounded, valid file references", () => {
    const unsafe = rule("unsafe", "testing", "failed", 0, 4);
    unsafe.references = [
      { path: "../escape.ts" },
      { path: "src/good.ts", startLine: 3, endLine: 2 },
      ...Array.from({ length: 30 }, (_, index) => ({
        path: `src/${String(index)}.ts`,
      })),
    ];
    const [finding] = buildFindings(project([unsafe])).weaknesses;

    expect(finding?.references).toHaveLength(20);
    expect(
      finding?.references.every(({ path }) => path.startsWith("src/")),
    ).toBe(true);
    expect(finding?.references[0]).toEqual({
      path: "src/good.ts",
      startLine: 3,
      endLine: 3,
    });
  });
});
