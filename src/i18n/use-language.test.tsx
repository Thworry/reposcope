import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getInitialLanguage, useLanguage } from "./use-language";

function LanguageHarness() {
  const { language, selectLanguage } = useLanguage();

  return (
    <div>
      <output>{language}</output>
      <button
        type="button"
        onClick={() => {
          selectLanguage("en");
        }}
      >
        Select English
      </button>
      <button
        type="button"
        onClick={() => {
          selectLanguage("zh-CN");
        }}
      >
        Select Chinese
      </button>
    </div>
  );
}

describe("useLanguage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.documentElement.lang = "en";
  });

  it("ignores a stored invalid value", () => {
    expect(getInitialLanguage(["en"], "pirate")).toBe("en");
    expect(getInitialLanguage(["zh-Hans-CN"], "pirate")).toBe("zh-CN");
  });

  it("does not throw when storage reads fail", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });

    expect(() => render(<LanguageHarness />)).not.toThrow();
    expect(screen.getByText("en")).toBeVisible();
  });

  it("does not throw when storage writes fail", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });

    render(<LanguageHarness />);
    await expect(
      user.click(screen.getByRole("button", { name: "Select Chinese" })),
    ).resolves.toBeUndefined();
    expect(screen.getByText("zh-CN")).toBeVisible();
  });

  it("stores only a valid selection and synchronizes the document language", async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    render(<LanguageHarness />);
    expect(document.documentElement.lang).toBe("en");

    await user.click(screen.getByRole("button", { name: "Select Chinese" }));

    expect(setItem).toHaveBeenLastCalledWith("reposcope:language", "zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });
});
