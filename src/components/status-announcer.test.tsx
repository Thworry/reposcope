import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusAnnouncer } from "./status-announcer";

describe("StatusAnnouncer", () => {
  it("announces only the latest distinct status in one polite live region", () => {
    const { rerender } = render(
      <StatusAnnouncer message="Download public text" />,
    );

    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveAttribute("aria-atomic", "true");
    expect(liveRegion).toHaveTextContent("Download public text");

    rerender(<StatusAnnouncer message="Download public text" />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getAllByText("Download public text")).toHaveLength(1);

    rerender(<StatusAnnouncer message="Parse and score" />);
    expect(screen.getByRole("status")).toHaveTextContent("Parse and score");
    expect(screen.queryByText("Download public text")).not.toBeInTheDocument();
  });
});
