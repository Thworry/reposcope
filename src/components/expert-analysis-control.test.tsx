import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { UseDeepAnalysisResult } from "../features/deep-analysis/use-deep-analysis";
import { ExpertAnalysisControl } from "./expert-analysis-control";

function expertState(
  overrides: Partial<UseDeepAnalysisResult> = {},
): UseDeepAnalysisResult {
  return {
    availability: "ready",
    status: "idle",
    stage: null,
    specialists: {
      product: "pending",
      "onboarding-architecture": "pending",
      "trust-ecosystem": "pending",
    },
    report: null,
    error: null,
    authorize: vi.fn(),
    generate: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    setAutomatic: vi.fn(),
    automatic: false,
    ...overrides,
  };
}

describe("ExpertAnalysisControl", () => {
  it("renders nothing when expert analysis is not configured", () => {
    const { container } = render(
      <ExpertAnalysisControl
        language="en"
        state={expertState({ availability: "disabled" })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("requires a readable first-use disclosure before GitHub authorization", async () => {
    const user = userEvent.setup();
    const authorize = vi.fn();
    const setAutomatic = vi.fn();
    const state = expertState({
      availability: "signed-out",
      authorize,
      setAutomatic,
    });
    render(<ExpertAnalysisControl language="en" state={state} />);

    const generate = screen.getByRole("button", {
      name: "Generate expert interpretation",
    });
    await user.click(generate);

    expect(authorize).not.toHaveBeenCalled();
    const disclosure = screen.getByRole("complementary", {
      name: "Before the expert panel starts",
    });
    expect(disclosure).toHaveTextContent(/selected text.*public repository/iu);
    expect(disclosure).toHaveTextContent(/GitHub Copilot entitlement/iu);
    expect(disclosure).toHaveTextContent(/does not execute repository code/iu);
    expect(disclosure).toHaveTextContent(
      /deterministic browser report stays intact/iu,
    );
    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.classList.contains("primary-action")),
    ).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Not now" }));
    const restoredGenerate = screen.getByRole("button", {
      name: "Generate expert interpretation",
    });
    expect(restoredGenerate).toHaveFocus();

    await user.click(restoredGenerate);
    await user.click(
      screen.getByRole("button", {
        name: "Agree and continue with GitHub",
      }),
    );
    expect(setAutomatic).toHaveBeenCalledWith(true);
    expect(authorize).toHaveBeenCalledOnce();
  });

  it("uses remembered consent without reopening the first-use disclosure", async () => {
    const user = userEvent.setup();
    const authorize = vi.fn();
    const state = expertState({
      availability: "signed-out",
      automatic: true,
      authorize,
    });
    render(<ExpertAnalysisControl language="en" state={state} />);

    await user.click(
      screen.getByRole("button", {
        name: "Generate expert interpretation",
      }),
    );

    expect(authorize).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("complementary", {
        name: "Before the expert panel starts",
      }),
    ).toBeNull();
  });

  it("restores focus to the generation action after cancelling a run", async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    const running = expertState({
      status: "running",
      stage: "consulting-specialists",
      cancel,
    });
    const { rerender } = render(
      <ExpertAnalysisControl language="en" state={running} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Cancel expert analysis" }),
    );
    expect(cancel).toHaveBeenCalledOnce();

    rerender(
      <ExpertAnalysisControl language="en" state={expertState({ cancel })} />,
    );
    expect(
      screen.getByRole("button", {
        name: "Generate expert interpretation",
      }),
    ).toHaveFocus();
  });

  it("keeps the last report usable while offering a specific retry", async () => {
    const user = userEvent.setup();
    const generate = vi.fn().mockResolvedValue(undefined);
    const state = expertState({
      status: "error",
      error: "allowance-exhausted",
      generate,
    });
    render(<ExpertAnalysisControl language="en" state={state} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /Copilot allowance.*deterministic report is unchanged/iu,
    );
    await user.click(
      screen.getByRole("button", { name: "Try expert analysis again" }),
    );
    expect(generate).toHaveBeenCalledOnce();
  });

  it("labels a successful follow-up as regeneration", async () => {
    const user = userEvent.setup();
    const generate = vi.fn().mockResolvedValue(undefined);
    render(
      <ExpertAnalysisControl
        language="en"
        state={expertState({ status: "success", generate })}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Regenerate expert interpretation" }),
    );
    expect(generate).toHaveBeenCalledOnce();
  });
});
