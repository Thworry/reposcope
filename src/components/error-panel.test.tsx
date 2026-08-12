import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorPanel } from "./error-panel";

describe("ErrorPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps invalid and ambiguous not-found failures non-retriable", () => {
    const { rerender } = render(
      <ErrorPanel error={{ kind: "invalid-url" }} language="en" />,
    );

    expect(
      screen.getByText(/valid public GitHub repository URL/i),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();

    rerender(
      <ErrorPanel error={{ kind: "not-found", status: 404 }} language="en" />,
    );
    expect(screen.getByText(/not found or is not public/i)).toBeVisible();
    expect(screen.queryByText(/deleted|private/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("shows a local rate-limit reset time, official documentation, and only enables retry after reset", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));
    const onRetry = vi.fn();

    render(
      <ErrorPanel
        error={{ kind: "rate-limit", resetAt: "2026-08-12T10:00:02.000Z" }}
        language="en"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText(/GitHub rate limit resets/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(
      screen.getByRole("link", { name: /GitHub rate-limit documentation/i }),
    ).toHaveAttribute(
      "href",
      "https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry analysis" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("uses safe typed copy for recoverable failures", () => {
    const onRetry = vi.fn();

    render(
      <ErrorPanel
        error={{ kind: "api", status: 503 }}
        language="zh-CN"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "GitHub 暂时无法完成请求",
    );
    expect(screen.queryByText("503")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重新分析" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
