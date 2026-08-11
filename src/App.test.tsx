import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    window.localStorage.setItem("reposcope:language", "en");
  });

  it("renders a bilingual RepoScope shell", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "RepoScope 项目透视" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Simplified Chinese" }),
    );

    expect(
      screen.getByText("看懂一个公开项目的质量、复杂度与改进空间。"),
    ).toBeVisible();
  });
});
