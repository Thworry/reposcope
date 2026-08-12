import { describe, expect, it } from "vitest";

import type { DuplicateFile } from "./model";
import { prepareDuplicateCandidateSources } from "./duplicate-candidates";

describe("cross-file duplicate candidate sources", () => {
  it("keeps source topology bounded by exact window groups", () => {
    const files: DuplicateFile[] = Array.from(
      { length: 3 },
      (_, fileIndex) => ({
        path: `src/file-${String(fileIndex)}.ts`,
        tokens: [
          ...Array.from(
            { length: 59 },
            (_, tokenIndex) => `shared-${String(tokenIndex)}`,
          ),
          `unique-${String(fileIndex)}`,
        ],
      }),
    );
    const occupied = files.map((file) =>
      Array.from({ length: file.tokens.length }, () => false),
    );
    const fileCanMatch = files.map(() => true);
    let prepared = 0;

    const sources = prepareDuplicateCandidateSources(
      files,
      occupied,
      fileCanMatch,
      {
        onCandidateSourcesPrepared: (count) => {
          prepared = count;
        },
      },
    );

    expect(sources).toHaveLength(prepared);
    expect(prepared).toBeLessThanOrEqual(10);
  });
});
