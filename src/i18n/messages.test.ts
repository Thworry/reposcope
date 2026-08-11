import { describe, expect, it } from "vitest";

import { messages } from "./messages";
import { getInitialLanguage } from "./use-language";

describe("bilingual message contract", () => {
  it("keeps English and Chinese keys exhaustive and selects browser Chinese", () => {
    expect(Object.keys(messages.en).sort()).toEqual(
      Object.keys(messages["zh-CN"]).sort(),
    );
    expect(getInitialLanguage(["zh-CN", "en"], null)).toBe("zh-CN");
    expect(getInitialLanguage(["fr-BE"], null)).toBe("en");
    expect(getInitialLanguage(["en"], "zh-CN")).toBe("zh-CN");
  });
});
