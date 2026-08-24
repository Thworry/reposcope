/// <reference types="node" />

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DeepSpecialistRole } from "../features/deep-analysis/model";
import type { DeepSpecialistStatus } from "../features/deep-analysis/use-deep-analysis";
import { ExpertProgress } from "./expert-progress";

const specialists: Record<DeepSpecialistRole, DeepSpecialistStatus> = {
  product: "complete",
  "onboarding-architecture": "running",
  "trust-ecosystem": "failed",
};

describe("ExpertProgress", () => {
  it("shows five semantic stages and announces only the current stage", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ExpertProgress
        language="en"
        stage="consulting-specialists"
        specialists={specialists}
        onCancel={onCancel}
      />,
    );

    const progress = screen.getByRole("region", {
      name: "Expert panel in progress",
    });
    expect(within(progress).getAllByRole("listitem")).toHaveLength(8);
    expect(within(progress).getAllByRole("status")).toHaveLength(1);
    expect(within(progress).getByRole("status")).toHaveTextContent(
      "Consult three specialists",
    );
    expect(
      within(progress).getByText("Prepare public evidence").closest("li"),
    ).toHaveAttribute("data-status", "complete");
    const stageList = within(progress).getByRole("list", {
      name: "Expert analysis progress",
    });
    expect(
      within(stageList).getByText("Consult three specialists").closest("li"),
    ).toHaveAttribute("aria-current", "step");
    expect(
      within(progress)
        .getByText("Onboarding and broad-architecture reviewer")
        .closest("li"),
    ).toHaveAttribute("data-status", "running");

    await user.click(
      within(progress).getByRole("button", {
        name: "Cancel expert analysis",
      }),
    );
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("describes a cache hit without pretending the panel ran again", () => {
    render(
      <ExpertProgress
        language="en"
        stage="validating-sources"
        specialists={{
          product: "pending",
          "onboarding-architecture": "pending",
          "trust-ecosystem": "pending",
        }}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "A saved briefing was found. RepoScope is refreshing public facts and validating its sources.",
      ),
    ).toBeVisible();
    for (const stage of [
      "Consult three specialists",
      "Challenge the findings",
      "Edit the briefing",
    ]) {
      const item = screen.getByText(stage).closest("li");
      expect(item).toHaveAttribute("data-status", "reused");
      expect(item).toHaveTextContent("Reused saved briefing");
    }
    expect(
      screen.getByText("Validate every source").closest("li"),
    ).toHaveAttribute("aria-current", "step");
  });

  it("keeps every expert control at least 44 CSS pixels", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");

    expect(css).toMatch(
      /\.primary-action,\s*\.secondary-action\s*\{[^}]*min-height:\s*var\(--target-min\)/isu,
    );
    expect(css).toMatch(
      /\.expert-control__automatic\s*\{[^}]*min-height:\s*var\(--target-min\)/isu,
    );
  });
});
