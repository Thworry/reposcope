import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DimensionResult } from "../features/analysis/model";
import { DimensionScores } from "./dimension-scores";

const dimensions: DimensionResult[] = [
  { key: "maintenance", earned: 8, available: 10, score: 80, rules: [] },
  { key: "documentation", earned: 12, available: 15, score: 80, rules: [] },
  { key: "operability", earned: 14, available: 20, score: 70, rules: [] },
  { key: "readability", earned: 0, available: 0, score: null, rules: [] },
  { key: "complexity", earned: 10, available: 20, score: 50, rules: [] },
  { key: "testing", earned: 9, available: 15, score: 60, rules: [] },
];

describe("DimensionScores", () => {
  it("renders all six dimensions in canonical order with text-first values and unavailable state", () => {
    render(<DimensionScores dimensions={dimensions} language="en" />);

    const headings = screen.getAllByRole("heading", { level: 4 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Documentation and onboarding",
      "Operability evidence",
      "Code readability",
      "Complexity and structure",
      "Testing and automation",
      "Maintenance health",
    ]);
    expect(screen.getAllByText("80 / 100")).toHaveLength(2);
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(
      screen.getByRole("progressbar", {
        name: /Documentation.*80 out of 100/i,
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("progressbar", { name: /Code readability/i }),
    ).toBeNull();
  });
});
