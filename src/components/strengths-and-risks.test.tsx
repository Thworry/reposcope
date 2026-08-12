import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Improvement, Strength } from "../features/analysis/model";
import { StrengthsAndRisks } from "./strengths-and-risks";

function strength(ruleId: string, dimension: Strength["dimension"]): Strength {
  return {
    ruleId,
    dimension,
    evidence: { key: "evidence.documentation.readme", args: { exists: true } },
    references: [],
  };
}

function weakness(
  ruleId: string,
  severity: Improvement["severity"],
  lostPoints: number,
): Improvement {
  return {
    ruleId,
    dimension: "documentation",
    severity,
    lostPoints,
    evidence: {
      key: "evidence.documentation.installation",
      args: { heading: '<script>alert("x")</script>', command: false },
    },
    recommendation: {
      key: "recommendation.documentation.installation",
      args: {},
    },
    references: [{ path: "README.md", startLine: 4 }],
  };
}

describe("StrengthsAndRisks", () => {
  it("defensively caps strengths and orders improvements by priority", () => {
    const strengths = [
      strength("documentation.a", "documentation"),
      strength("documentation.b", "documentation"),
      strength("documentation.c", "documentation"),
      strength("testing.a", "testing"),
      strength("testing.b", "testing"),
      strength("maintenance.a", "maintenance"),
    ];
    const weaknesses = [
      weakness("documentation.low", "low", 1),
      weakness("documentation.high", "high", 4),
      weakness("documentation.medium", "medium", 2),
    ];

    render(
      <StrengthsAndRisks
        strengths={strengths}
        weaknesses={weaknesses}
        language="en"
      />,
    );

    expect(screen.getAllByRole("listitem", { name: /strength/i })).toHaveLength(
      5,
    );
    expect(screen.queryByText("documentation.c")).toBeNull();
    expect(
      screen
        .getAllByRole("listitem", { name: /improvement/i })
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("documentation.high"),
      expect.stringContaining("documentation.medium"),
      expect.stringContaining("documentation.low"),
    ]);
    expect(
      screen.getAllByText('<script>alert("x")</script>', { exact: false })[0],
    ).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
  });
});
