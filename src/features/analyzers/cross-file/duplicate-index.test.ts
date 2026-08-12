import { describe, expect, it } from "vitest";

import type { DuplicateFile, WindowOccurrence } from "./model";
import {
  DUPLICATE_WINDOW_SIZE,
  groupExactWindows,
  minimalPeriod,
} from "./duplicate-index";

describe("cross-file duplicate index", () => {
  it("verifies equal windows exactly after hash indexing", () => {
    const files: DuplicateFile[] = [
      {
        path: "src/a.ts",
        tokens: Array.from(
          { length: DUPLICATE_WINDOW_SIZE },
          (_, index) => `left-${String(index)}`,
        ),
      },
      {
        path: "src/b.ts",
        tokens: Array.from(
          { length: DUPLICATE_WINDOW_SIZE },
          (_, index) => `right-${String(index)}`,
        ),
      },
    ];
    const occurrences: WindowOccurrence[] = [
      { fileIndex: 0, start: 0 },
      { fileIndex: 1, start: 0 },
    ];

    expect(groupExactWindows(files, occurrences)).toHaveLength(2);
  });

  it("keeps the minimal period calculation exact", () => {
    expect(minimalPeriod(["a", "b", "a", "b", "a"])).toBe(2);
  });
});
