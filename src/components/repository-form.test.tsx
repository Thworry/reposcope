import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RepositoryForm } from "./repository-form";

describe("RepositoryForm", () => {
  it("associates a visible label and helper with the native textbox", () => {
    render(
      <RepositoryForm
        language="en"
        disabled={false}
        initialValue=""
        onAnalyze={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "Public GitHub repository URL",
    });
    const describedBy = input.getAttribute("aria-describedby") ?? "";

    expect(input.tagName).toBe("INPUT");
    expect(
      screen.getByText(/exactly an owner and repository/i),
    ).toHaveAttribute("id", expect.stringMatching(/helper/u));
    expect(describedBy).toContain("helper");
  });

  it("rejects invalid input locally, links the error, and makes no request", async () => {
    const user = userEvent.setup();
    const onAnalyze = vi.fn();
    render(
      <RepositoryForm
        language="en"
        disabled={false}
        initialValue=""
        onAnalyze={onAnalyze}
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "Public GitHub repository URL",
    });
    await user.type(input, "https://example.com/not-github/repo");
    await user.click(
      screen.getByRole("button", { name: "Analyze repository" }),
    );

    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent(/github\.com\/owner\/repository/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(error.id);
    expect(input).toHaveFocus();
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it("normalizes a valid URL and submits it with Enter", async () => {
    const user = userEvent.setup();
    const onAnalyze = vi.fn();
    render(
      <RepositoryForm
        language="en"
        disabled={false}
        initialValue=""
        onAnalyze={onAnalyze}
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "Public GitHub repository URL",
    });
    await user.type(input, " github.com/Owner/Project.git ");
    await user.type(input, "{Enter}");

    expect(onAnalyze).toHaveBeenCalledOnce();
    expect(onAnalyze).toHaveBeenCalledWith({ owner: "Owner", repo: "Project" });
    expect(input).toHaveValue("https://github.com/Owner/Project");
  });

  it("offers the exact examples as fill controls", async () => {
    const user = userEvent.setup();
    const onAnalyze = vi.fn();
    render(
      <RepositoryForm
        language="zh-CN"
        disabled={false}
        initialValue=""
        onAnalyze={onAnalyze}
      />,
    );

    const issueReady = screen.getByRole("button", {
      name: "Thworry/issueready",
    });
    expect(screen.getByRole("button", { name: "psf/requests" })).toBeVisible();

    await user.click(issueReady);
    expect(
      screen.getByRole("textbox", { name: "公开 GitHub 项目网址" }),
    ).toHaveValue("https://github.com/Thworry/issueready");
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it("disables submission, input, and examples while a scan is running", () => {
    render(
      <RepositoryForm
        language="en"
        disabled
        initialValue="https://github.com/owner/repo"
        onAnalyze={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Analysis running" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Thworry/issueready" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "psf/requests" })).toBeDisabled();
  });
});
