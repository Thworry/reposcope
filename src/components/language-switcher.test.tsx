import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LanguageSwitcher } from "./language-switcher";

describe("LanguageSwitcher", () => {
  it("exposes persistent native pressed controls in both languages", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <LanguageSwitcher language="en" onChange={onChange} />,
    );

    expect(screen.getByRole("navigation", { name: "Language" })).toBeVisible();
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "简体中文" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "简体中文" }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("zh-CN");

    rerender(<LanguageSwitcher language="zh-CN" onChange={onChange} />);
    expect(screen.getByRole("navigation", { name: "语言" })).toBeVisible();
    expect(screen.getByRole("button", { name: "简体中文" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
