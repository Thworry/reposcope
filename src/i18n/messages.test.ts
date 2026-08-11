import { describe, expect, it } from "vitest";

import { messages } from "./messages";
import { getInitialLanguage } from "./use-language";
import { RULE_IDS } from "../features/rules/rules";

describe("bilingual message contract", () => {
  it("keeps English and Chinese keys exhaustive and selects browser Chinese", () => {
    expect(Object.keys(messages.en).sort()).toEqual(
      Object.keys(messages["zh-CN"]).sort(),
    );
    expect(getInitialLanguage(["zh-CN", "en"], null)).toBe("zh-CN");
    expect(getInitialLanguage(["fr-BE"], null)).toBe("en");
    expect(getInitialLanguage(["en"], "zh-CN")).toBe("zh-CN");
  });

  it("contains exhaustive bilingual evidence and recommendation templates", () => {
    for (const ruleId of RULE_IDS) {
      expect(`evidence.${ruleId}` in messages.en).toBe(true);
      expect(`evidence.${ruleId}` in messages["zh-CN"]).toBe(true);
      expect(`recommendation.${ruleId}` in messages.en).toBe(true);
      expect(`recommendation.${ruleId}` in messages["zh-CN"]).toBe(true);
    }
  });
});
