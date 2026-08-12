import { describe, expect, it } from "vitest";

import type { DuplicateFile } from "./model";
import { chooseNonOverlapping, summarizeEvidence } from "./duplicate-selection";

describe("cross-file duplicate selection", () => {
  it("selects an exact whole-file match and summarizes it once", () => {
    const shared = Array.from(
      { length: 60 },
      (_, index) => `token-${String(index)}`,
    );
    const files: DuplicateFile[] = [
      { path: "src/a.ts", tokens: shared },
      { path: "src/b.ts", tokens: [...shared] },
    ];

    const { accepted, occupied } = chooseNonOverlapping(files);

    expect(accepted).toEqual([
      {
        leftFileIndex: 0,
        leftStart: 0,
        rightFileIndex: 1,
        rightStart: 0,
        length: 60,
      },
    ]);
    expect(occupied.every((file) => file.every(Boolean))).toBe(true);
    expect(summarizeEvidence(files, accepted)).toEqual([
      { leftPath: "src/a.ts", rightPath: "src/b.ts", tokenCount: 60 },
    ]);
  });
});
