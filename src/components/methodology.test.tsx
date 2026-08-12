import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Methodology } from "./methodology";

describe("Methodology", () => {
  it("renders one complete, versioned methodology region with weights and thresholds", () => {
    render(<Methodology rulesetVersion="1.0.0" language="en" />);

    const region = screen.getByRole("region", { name: "Methodology" });
    expect(region).toHaveAttribute("id", "methodology");
    expect(screen.getAllByRole("region", { name: "Methodology" })).toHaveLength(
      1,
    );
    expect(region).toHaveTextContent("Documentation and onboarding: 15");
    expect(region).toHaveTextContent("Complexity and structure: 20");
    expect(region).toHaveTextContent("85–100");
    expect(region).toHaveTextContent("80–100");
    expect(region).toHaveTextContent("Binary, minified, vendored, generated");
    expect(region).toHaveTextContent("do not prove that software works");
    expect(
      screen.getByRole("link", {
        name: "Read the complete versioned methodology",
      }),
    ).toHaveAttribute("rel", "noopener noreferrer");
  });
});
