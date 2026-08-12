import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ScanProgress } from "./scan-progress";

describe("ScanProgress", () => {
  it("shows the five phases and actual determinate file and byte progress", () => {
    const { rerender } = render(
      <ScanProgress
        language="en"
        progress={{
          phase: "fetching",
          completedFiles: 12,
          totalFiles: 24,
          completedBytes: 1_024,
          totalBytes: 4_096,
        }}
        onCancel={vi.fn()}
      />,
    );

    for (const label of [
      "Validate repository URL",
      "Fetch repository structure",
      "Plan inspection scope",
      "Download public text",
      "Parse and score",
    ]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(screen.getByText("12 of 24 files")).toBeVisible();
    expect(screen.getByText("1 KB of 4 KB")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "12",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      "24",
    );

    rerender(
      <ScanProgress
        language="zh-CN"
        progress={{
          phase: "analyzing",
          completedFiles: 24,
          totalFiles: 24,
          completedBytes: 4_096,
          totalBytes: 4_096,
        }}
        onCancel={vi.fn()}
      />,
    );
    for (const label of [
      "验证项目网址",
      "获取项目结构",
      "规划检查范围",
      "下载公开文本",
      "解析并评分",
    ]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(screen.getByRole("progressbar")).not.toHaveAttribute(
      "aria-valuenow",
    );
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
  });

  it("provides a named, enabled 44-pixel cancel target", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ScanProgress language="en" progress={null} onCancel={onCancel} />);

    const cancel = screen.getByRole("button", { name: "Cancel analysis" });
    expect(cancel).toBeEnabled();
    expect(cancel).toHaveClass("secondary-action");
    expect(cancel).toHaveAttribute("data-minimum-target-size", "44");
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
