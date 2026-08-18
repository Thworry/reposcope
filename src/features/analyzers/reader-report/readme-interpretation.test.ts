import { describe, expect, it } from "vitest";

import {
  READER_COMMENTARY_IDS,
  type ReaderCommentaryId,
  type ReaderConventionalManifest,
  type ReaderReadmeProfile,
  type ReaderTextFact,
} from "../../analysis/model";
import type { ReaderMarkdownReadmeEvidence } from "./markdown";
import { README_PROFILE_CAPS } from "./readme-policy";
import {
  buildReadmeProfile,
  deriveReadmeCommentary,
  type BuildReadmeProfileInput,
  type ReaderReadmeCorroboration,
} from "./readme-interpretation";

function fact(
  text: string,
  path: string | null = "README.md",
  source: ReaderTextFact["source"] = "readme",
): ReaderTextFact {
  return { source, path, text };
}

function group(label: string, ...facts: ReaderTextFact[]) {
  return { label, facts };
}

function evidence(
  overrides: Partial<ReaderMarkdownReadmeEvidence> = {},
): ReaderMarkdownReadmeEvidence {
  return {
    overview: [],
    audiences: [],
    problems: [],
    useCases: [],
    capabilityGroups: [],
    workflow: [],
    dependencies: [],
    limitations: [],
    maturity: [],
    ...overrides,
  };
}

function profileWith(
  overrides: Partial<ReaderReadmeProfile> = {},
): ReaderReadmeProfile {
  return {
    availability: "available",
    observedManifests: [],
    overview: [],
    audiences: [],
    problems: [],
    useCases: [],
    capabilityGroups: [],
    workflow: [],
    dependencies: [],
    limitations: [],
    maturity: [],
    commentary: [],
    ...overrides,
  };
}

function corroboration(
  overrides: Partial<ReaderReadmeCorroboration> = {},
): ReaderReadmeCorroboration {
  return {
    productShapeObserved: false,
    ecosystemsObserved: false,
    treeComplete: false,
    observedManifests: [],
    readmeCommandKinds: [],
    securityPrivacyFactCount: 1,
    ...overrides,
  };
}

function input(
  overrides: Partial<BuildReadmeProfileInput> = {},
): BuildReadmeProfileInput {
  return {
    preferredReadmeState: "fetched",
    evidencePath: "README.md",
    evidence: evidence(),
    purposeKeys: new Set<string>(),
    corroboration: corroboration(),
    ...overrides,
  };
}

describe("deriveReadmeCommentary", () => {
  it("matches the explicit multi-trigger commentary decision table", () => {
    const profile = profileWith({
      overview: [fact("A complete overview."), fact("A second overview fact.")],
      capabilityGroups: [group("Planning", fact("Worldbuilding"))],
      workflow: [fact("Plan"), fact("Draft")],
      dependencies: [fact("Node.js 24")],
    });

    expect(
      deriveReadmeCommentary(
        profile,
        corroboration({
          productShapeObserved: true,
          ecosystemsObserved: true,
          treeComplete: true,
          securityPrivacyFactCount: 0,
        }),
      ),
    ).toEqual([
      "readme-substantial-overview",
      "readme-capabilities-documented",
      "readme-workflow-documented",
      "readme-security-data-flow-unestablished",
      "readme-limitations-unestablished",
      "readme-maturity-unestablished",
      "readme-external-dependencies-declared",
    ]);
  });

  it.each([
    [
      "readme-substantial-overview",
      profileWith({ overview: [fact("First"), fact("Second")] }),
      corroboration(),
    ],
    [
      "readme-audience-or-use-cases-documented",
      profileWith({ useCases: [fact("Review a repository")] }),
      corroboration(),
    ],
    [
      "readme-capabilities-documented",
      profileWith({ capabilityGroups: [group("Planning", fact("Draft"))] }),
      corroboration(),
    ],
    [
      "readme-workflow-documented",
      profileWith({ workflow: [fact("Plan"), fact("Draft")] }),
      corroboration(),
    ],
    [
      "readme-onboarding-documented",
      profileWith({ dependencies: [fact("Node.js 24")] }),
      corroboration({ readmeCommandKinds: ["install"] }),
    ],
    [
      "readme-limitations-documented",
      profileWith({ limitations: [fact("Preview only")] }),
      corroboration(),
    ],
    [
      "readme-maturity-documented",
      profileWith({ maturity: [fact("Beta")] }),
      corroboration(),
    ],
    [
      "readme-broad-structure-corroborated",
      profileWith({ overview: [fact("A repository tool")] }),
      corroboration({
        productShapeObserved: true,
        ecosystemsObserved: true,
        treeComplete: true,
      }),
    ],
    [
      "readme-security-data-flow-unestablished",
      profileWith({ limitations: [fact("Limited")], maturity: [fact("Beta")] }),
      corroboration({ securityPrivacyFactCount: 0 }),
    ],
    [
      "readme-limitations-unestablished",
      profileWith({ maturity: [fact("Beta")] }),
      corroboration(),
    ],
    [
      "readme-maturity-unestablished",
      profileWith({ limitations: [fact("Limited")] }),
      corroboration(),
    ],
    [
      "readme-broad-structure-needs-verification",
      profileWith({ overview: [fact("A repository tool")] }),
      corroboration({ treeComplete: true }),
    ],
    [
      "readme-external-dependencies-declared",
      profileWith({ dependencies: [fact("Node.js 24")] }),
      corroboration(),
    ],
  ] as const)(
    "has an isolated decision-table row for %s",
    (expected, profile, context) => {
      expect(deriveReadmeCommentary(profile, context)).toContain(expected);
    },
  );

  it("uses actual README install, run, or develop command evidence for onboarding", () => {
    const profile = profileWith({
      workflow: [fact("Plan")],
      dependencies: [fact("Node.js 24")],
    });

    expect(deriveReadmeCommentary(profile, corroboration())).not.toContain(
      "readme-onboarding-documented",
    );
    for (const kind of ["install", "run", "develop"] as const) {
      expect(
        deriveReadmeCommentary(
          profile,
          corroboration({ readmeCommandKinds: [kind] }),
        ),
      ).toContain("readme-onboarding-documented");
    }
    for (const kind of ["test", "build"] as const) {
      expect(
        deriveReadmeCommentary(
          profile,
          corroboration({ readmeCommandKinds: [kind] }),
        ),
      ).not.toContain("readme-onboarding-documented");
    }
  });

  it("uses root README security/privacy evidence instead of limitations as a proxy", () => {
    const profile = profileWith({ limitations: [fact("A known limitation")] });

    expect(
      deriveReadmeCommentary(
        profile,
        corroboration({ securityPrivacyFactCount: 0 }),
      ),
    ).toContain("readme-security-data-flow-unestablished");
    expect(
      deriveReadmeCommentary(
        profile,
        corroboration({ securityPrivacyFactCount: 1 }),
      ),
    ).not.toContain("readme-security-data-flow-unestablished");
  });

  it("does not claim onboarding or workflow from use cases and dependencies", () => {
    const commentary = deriveReadmeCommentary(
      profileWith({
        useCases: [fact("Evaluate public repositories")],
        dependencies: [fact("Node.js 24")],
      }),
      corroboration(),
    );

    expect(commentary).toContain("readme-audience-or-use-cases-documented");
    expect(commentary).not.toContain("readme-workflow-documented");
    expect(commentary).not.toContain("readme-onboarding-documented");
  });

  it("keeps overview-only and no-requirements commentary conservative", () => {
    const commentary = deriveReadmeCommentary(
      profileWith({ overview: [fact("A short overview")] }),
      corroboration(),
    );

    expect(commentary).toEqual([
      "readme-limitations-unestablished",
      "readme-maturity-unestablished",
    ]);
    expect(commentary).not.toContain("readme-external-dependencies-declared");
  });

  it("cross-checks exact conventional manifests before broad corroboration", () => {
    const absentStructure = profileWith({
      overview: [fact("A repository tool")],
    });
    const manifestClaim = (observedManifests: ReaderConventionalManifest[]) =>
      profileWith({
        dependencies: [fact("package.json")],
        observedManifests,
      });

    expect(
      deriveReadmeCommentary(
        absentStructure,
        corroboration({ treeComplete: true }),
      ),
    ).toContain("readme-broad-structure-needs-verification");
    expect(
      deriveReadmeCommentary(absentStructure, corroboration()),
    ).not.toContain("readme-broad-structure-needs-verification");
    expect(
      deriveReadmeCommentary(
        manifestClaim([]),
        corroboration({
          treeComplete: true,
          productShapeObserved: true,
          ecosystemsObserved: true,
        }),
      ),
    ).toContain("readme-broad-structure-needs-verification");
    expect(
      deriveReadmeCommentary(
        manifestClaim(["package.json"]),
        corroboration({
          treeComplete: true,
          productShapeObserved: true,
          ecosystemsObserved: true,
        }),
      ),
    ).toContain("readme-broad-structure-corroborated");
    const incompleteManifest = deriveReadmeCommentary(
      manifestClaim(["package.json"]),
      corroboration({
        productShapeObserved: true,
        ecosystemsObserved: true,
        treeComplete: false,
      }),
    );
    expect(incompleteManifest).not.toContain(
      "readme-broad-structure-needs-verification",
    );
    expect(incompleteManifest).not.toContain(
      "readme-broad-structure-corroborated",
    );
    expect(
      deriveReadmeCommentary(
        profileWith({ dependencies: [fact("Install package.json first")] }),
        corroboration({
          treeComplete: true,
          productShapeObserved: true,
          ecosystemsObserved: true,
        }),
      ),
    ).toContain("readme-broad-structure-corroborated");
  });

  it.each(["package.json", "go.mod"] as const)(
    "keeps exact %s manifest cross-checking stable under observed-order reversal",
    (manifest) => {
      const observedManifests: ReaderConventionalManifest[] = [
        "go.mod",
        "package.json",
      ];
      const profile = profileWith({
        dependencies: [fact(manifest)],
        observedManifests,
      });
      const reversed = profileWith({
        ...profile,
        observedManifests: [...observedManifests].reverse(),
      });
      const context = corroboration({
        treeComplete: true,
        productShapeObserved: true,
        ecosystemsObserved: true,
      });

      expect(deriveReadmeCommentary(reversed, context)).toEqual(
        deriveReadmeCommentary(profile, context),
      );
      expect(deriveReadmeCommentary(profile, context)).toContain(
        "readme-broad-structure-corroborated",
      );
    },
  );

  it("keeps canonical commentary stable when evidence and context sets are reversed", () => {
    const forward = profileWith({
      overview: [fact("First"), fact("Second")],
      audiences: [fact("Writers")],
      dependencies: [fact("package.json"), fact("Node.js 24")],
      limitations: [fact("Preview")],
      maturity: [fact("Beta")],
    });
    const reverse = profileWith({
      ...forward,
      overview: [...forward.overview].reverse(),
      audiences: [...forward.audiences].reverse(),
      dependencies: [...forward.dependencies].reverse(),
      commentary: [],
    });
    const first = deriveReadmeCommentary(
      forward,
      corroboration({
        treeComplete: true,
        productShapeObserved: true,
        ecosystemsObserved: true,
        readmeCommandKinds: ["install", "run"],
      }),
    );
    const second = deriveReadmeCommentary(
      reverse,
      corroboration({
        treeComplete: true,
        productShapeObserved: true,
        ecosystemsObserved: true,
        readmeCommandKinds: ["run", "install"],
      }),
    );

    expect(second).toEqual(first);
    expect(first.every((id) => READER_COMMENTARY_IDS.includes(id))).toBe(true);
    expect(new Set(first).size).toBe(first.length);
    expect(first.length).toBeLessThanOrEqual(8);
  });

  it("returns no commentary for missing or empty partial README evidence", () => {
    expect(
      deriveReadmeCommentary(
        profileWith({ availability: "unavailable" }),
        corroboration({ securityPrivacyFactCount: 0, treeComplete: true }),
      ),
    ).toEqual([]);
    expect(
      deriveReadmeCommentary(
        profileWith({ availability: "partial" }),
        corroboration({ securityPrivacyFactCount: 0, treeComplete: true }),
      ),
    ).toEqual([]);
  });
});

describe("buildReadmeProfile", () => {
  it.each([
    ["missing", 0, "unavailable"],
    ["missing", 1, "unavailable"],
    ["fetched", 0, "unavailable"],
    ["fetched", 1, "available"],
    ["incomplete", 0, "partial"],
    ["incomplete", 1, "partial"],
  ] as const)(
    "builds %s with %i facts as %s",
    (preferredReadmeState, factCount, expected) => {
      const result = buildReadmeProfile(
        input({
          preferredReadmeState,
          evidence: evidence({
            overview: Array.from({ length: factCount }, (_, index) =>
              fact(`Overview ${String(index + 1)}`),
            ),
          }),
        }),
      );

      expect(result.availability).toBe(expected);
    },
  );

  it("returns canonical empty profiles for missing and empty partial README states", () => {
    const emptyArrays = {
      observedManifests: [],
      overview: [],
      audiences: [],
      problems: [],
      useCases: [],
      capabilityGroups: [],
      workflow: [],
      dependencies: [],
      limitations: [],
      maturity: [],
      commentary: [],
    };

    expect(
      buildReadmeProfile(
        input({
          preferredReadmeState: "missing",
          evidence: evidence({ overview: [fact("Must be ignored")] }),
        }),
      ),
    ).toEqual({ availability: "unavailable", ...emptyArrays });
    expect(
      buildReadmeProfile(
        input({ preferredReadmeState: "incomplete", evidence: evidence() }),
      ),
    ).toEqual({ availability: "partial", ...emptyArrays });
  });

  it("retains acquired safe facts for a partial README", () => {
    const result = buildReadmeProfile(
      input({
        preferredReadmeState: "incomplete",
        evidence: evidence({
          overview: [fact("A partial overview")],
          limitations: [fact("Scanning stopped early")],
        }),
      }),
    );

    expect(result.availability).toBe("partial");
    expect(result.overview.map(({ text }) => text)).toEqual([
      "A partial overview",
    ]);
    expect(result.limitations.map(({ text }) => text)).toEqual([
      "Scanning stopped early",
    ]);
  });

  it("normalizes purpose keys and excludes them before every profile cap", () => {
    const result = buildReadmeProfile(
      input({
        purposeKeys: new Set(["Ｐｒｉｍａｒｙ purpose"]),
        evidence: evidence({
          overview: [
            fact("Primary purpose"),
            fact("Overview one"),
            fact("Overview two"),
            fact("Overview three"),
            fact("Overview four"),
          ],
          useCases: [
            fact("Ｐｒｉｍａｒｙ purpose"),
            fact("Use one"),
            fact("Use two"),
            fact("Use three"),
            fact("Use four"),
          ],
          audiences: [fact("Primary purpose"), fact("Maintainers")],
          problems: [fact("Ｐｒｉｍａｒｙ purpose"), fact("Hard adoption")],
          capabilityGroups: [
            group("Core", fact("Primary purpose"), fact("Safe capability")),
          ],
          workflow: [fact("Primary purpose"), fact("Inspect evidence")],
          dependencies: [fact("Primary purpose"), fact("Node.js 24")],
          limitations: [fact("Primary purpose"), fact("Static only")],
          maturity: [fact("Primary purpose"), fact("Versioned")],
        }),
      }),
    );

    expect(result.overview.map(({ text }) => text)).toEqual([
      "Overview one",
      "Overview two",
      "Overview three",
      "Overview four",
    ]);
    expect(result.useCases.map(({ text }) => text)).toEqual([
      "Use one",
      "Use two",
      "Use three",
      "Use four",
    ]);
    expect(result.audiences.map(({ text }) => text)).toEqual(["Maintainers"]);
    expect(result.problems.map(({ text }) => text)).toEqual(["Hard adoption"]);
    expect(result.capabilityGroups).toEqual([
      group("Core", fact("Safe capability")),
    ]);
    expect(result.workflow.map(({ text }) => text)).toEqual([
      "Inspect evidence",
    ]);
    expect(result.dependencies.map(({ text }) => text)).toEqual(["Node.js 24"]);
    expect(result.limitations.map(({ text }) => text)).toEqual(["Static only"]);
    expect(result.maturity.map(({ text }) => text)).toEqual(["Versioned"]);
  });

  it("deduplicates facts globally and merges duplicate capability labels in policy order", () => {
    const result = buildReadmeProfile(
      input({
        evidence: evidence({
          overview: [fact("Shared  fact")],
          audiences: [fact("Shared fact"), fact("Maintainers")],
          capabilityGroups: [
            group("Ｐｌａｎｎｉｎｇ", fact("Shared fact"), fact("Draft")),
            group("Planning", fact("Review"), fact("Draft")),
          ],
          workflow: [fact("Review"), fact("Publish")],
        }),
      }),
    );

    expect(result.overview.map(({ text }) => text)).toEqual(["Shared  fact"]);
    expect(result.audiences.map(({ text }) => text)).toEqual(["Maintainers"]);
    expect(result.capabilityGroups).toEqual([
      group("Ｐｌａｎｎｉｎｇ", fact("Draft"), fact("Review")),
    ]);
    expect(result.workflow.map(({ text }) => text)).toEqual(["Publish"]);
  });

  it("deduplicates capability labels against purpose, facts, and their own group", () => {
    const result = buildReadmeProfile(
      input({
        purposeKeys: new Set(["Ｐｕｒｐｏｓｅ label"]),
        evidence: evidence({
          overview: [fact("Existing overview")],
          capabilityGroups: [
            group("Purpose label", fact("Excluded by purpose")),
            group("Ｅｘｉｓｔｉｎｇ overview", fact("Excluded by overview")),
            group(
              "Core label",
              ...Array.from({ length: 6 }, () => fact("Ｃｏｒｅ label")),
              fact("Retained capability"),
            ),
          ],
          workflow: [fact("Core label"), fact("Retained workflow")],
        }),
      }),
    );

    expect(result.capabilityGroups).toEqual([
      group("Core label", fact("Retained capability")),
    ]);
    expect(result.workflow.map(({ text }) => text)).toEqual([
      "Retained workflow",
    ]);
  });

  it("retains facts only from the selected evidence path", () => {
    const result = buildReadmeProfile(
      input({
        evidencePath: "README-guide.md",
        evidence: evidence({
          overview: [
            fact("Selected", "README-guide.md"),
            fact("Mixed", "README.md"),
          ],
          workflow: [fact("Also mixed", ".github/README.md")],
        }),
      }),
    );

    expect(result.overview).toEqual([fact("Selected", "README-guide.md")]);
    expect(result.workflow).toEqual([]);
  });

  it("normalizes and orders bounded observed conventional manifests", () => {
    const result = buildReadmeProfile(
      input({
        evidence: evidence({ overview: [fact("Repository overview")] }),
        corroboration: corroboration({
          observedManifests: [
            "PACKAGE.JSON",
            "go.mod",
            "requirements.txt",
            "ｇｏ．ｍｏｄ",
          ],
        }),
      }),
    );

    expect(result.observedManifests).toEqual(["go.mod", "package.json"]);
  });

  it("reapplies every frozen cap without mutating document order", () => {
    const facts = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) =>
        fact(`${prefix} ${String(index + 1)}`),
      );
    const result = buildReadmeProfile(
      input({
        evidence: evidence({
          overview: facts("Overview", 5),
          audiences: facts("Audience", 5),
          problems: facts("Problem", 5),
          useCases: facts("Use", 5),
          capabilityGroups: Array.from({ length: 7 }, (_, index) =>
            group(
              `Group ${String(index + 1)}`,
              ...facts(`Capability ${String(index + 1)}`, 7),
            ),
          ),
          workflow: facts("Step", 9),
          dependencies: facts("Dependency", 9),
          limitations: facts("Limitation", 7),
          maturity: facts("Maturity", 7),
        }),
      }),
    );

    expect(result.overview).toHaveLength(README_PROFILE_CAPS.overview);
    expect(result.audiences).toHaveLength(README_PROFILE_CAPS.audiences);
    expect(result.problems).toHaveLength(README_PROFILE_CAPS.problems);
    expect(result.useCases).toHaveLength(README_PROFILE_CAPS.useCases);
    expect(result.capabilityGroups).toHaveLength(
      README_PROFILE_CAPS.capabilityGroups,
    );
    expect(
      result.capabilityGroups.every(
        ({ facts }) => facts.length === README_PROFILE_CAPS.capabilityFacts,
      ),
    ).toBe(true);
    expect(result.workflow).toHaveLength(README_PROFILE_CAPS.workflow);
    expect(result.dependencies).toHaveLength(README_PROFILE_CAPS.dependencies);
    expect(result.limitations).toHaveLength(README_PROFILE_CAPS.limitations);
    expect(result.maturity).toHaveLength(README_PROFILE_CAPS.maturity);
    expect(result.workflow[0]?.text).toBe("Step 1");
  });

  it("filters noncanonical README source/path pairs before availability and output", () => {
    const result = buildReadmeProfile(
      input({
        evidencePath: ".github/README.md",
        evidence: evidence({
          overview: [
            fact("Canonical", ".github/README.md"),
            fact("Missing path", null),
            fact("Wrong source", "README.md", "analysis"),
            fact("Wrong document", "docs/guide.md"),
            fact("Credential path", `README.ghp_${"a".repeat(36)}.md`),
          ],
          capabilityGroups: [
            group("Invalid", fact("Wrong group source", "README.md", "tree")),
          ],
        }),
      }),
    );

    expect(result.availability).toBe("available");
    expect(result.overview).toEqual([fact("Canonical", ".github/README.md")]);
    expect(result.capabilityGroups).toEqual([]);
  });

  it("does not count facts under an invalid capability label as safe evidence", () => {
    const result = buildReadmeProfile(
      input({
        evidence: evidence({
          capabilityGroups: [group("", fact("Hidden fact"))],
        }),
      }),
    );

    expect(result.availability).toBe("unavailable");
    expect(result.capabilityGroups).toEqual([]);
    expect(result.commentary).toEqual([]);
  });

  it("derives fetched availability from the final purpose-excluded profile", () => {
    const result = buildReadmeProfile(
      input({
        purposeKeys: new Set(["Ｏｎｌｙ purpose"]),
        evidence: evidence({ overview: [fact("Only purpose")] }),
      }),
    );

    expect(result).toEqual({
      availability: "unavailable",
      observedManifests: [],
      overview: [],
      audiences: [],
      problems: [],
      useCases: [],
      capabilityGroups: [],
      workflow: [],
      dependencies: [],
      limitations: [],
      maturity: [],
      commentary: [],
    });
    expect(
      buildReadmeProfile(
        input({
          preferredReadmeState: "incomplete",
          purposeKeys: new Set(["Only purpose"]),
          evidence: evidence({ overview: [fact("Only purpose")] }),
        }),
      ),
    ).toEqual({ ...result, availability: "partial" });
  });

  it("rejects unsafe fact text and capability labels before counting or capping", () => {
    const githubToken = `ghp_${"a".repeat(36)}`;
    const fullwidthToken = `ｇｈｐ＿${"ａ".repeat(36)}`;
    const unsafeValues = [
      githubToken,
      fullwidthToken,
      "Control\u0000text",
      "Bidi\u202etext",
      "Malformed\ud800text",
    ];
    const result = buildReadmeProfile(
      input({
        evidence: evidence({
          overview: [
            ...unsafeValues.map((value) => fact(value)),
            fact("Ｓａｆｅ fullwidth overview"),
          ],
          capabilityGroups: [
            ...unsafeValues.map((label) =>
              group(label, fact(`Hidden under ${label}`)),
            ),
            group("Ｓａｆｅ group", fact("Ｓａｆｅ fullwidth capability")),
          ],
        }),
      }),
    );

    expect(result.availability).toBe("available");
    expect(result.overview).toEqual([fact("Ｓａｆｅ fullwidth overview")]);
    expect(result.capabilityGroups).toEqual([
      group("Ｓａｆｅ group", fact("Ｓａｆｅ fullwidth capability")),
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(githubToken);
    expect(serialized).not.toContain(fullwidthToken);
    expect(serialized).not.toContain("Control");
    expect(serialized).not.toContain("Bidi");
    expect(serialized).not.toContain("Malformed");
  });

  it("skips null, nonobject, sparse, and wrongly typed evidence without throwing", () => {
    const malformedFacts: unknown[] = [null, 42];
    malformedFacts.length = 3;
    malformedFacts.push(
      { source: new String("readme"), path: "README.md", text: "Boxed" },
      { source: "readme", path: "README.md", text: new String("Boxed") },
      { source: "readme", path: new String("README.md"), text: "Boxed" },
      {
        source: { toString: () => "readme" },
        path: "README.md",
        text: "Object",
      },
      fact("Safe fact"),
    );
    const malformedGroupFacts: unknown[] = [null];
    malformedGroupFacts.length = 2;
    malformedGroupFacts.push(fact("Safe capability"));
    const malformedGroups: unknown[] = [null, 42];
    malformedGroups.length = 3;
    malformedGroups.push(
      { label: new String("Boxed"), facts: [fact("Hidden")] },
      { label: "Missing facts" },
      {
        label: "Safe group",
        facts: malformedGroupFacts,
      },
    );

    expect(() =>
      buildReadmeProfile(
        input({
          evidence: evidence({
            overview: malformedFacts as ReaderTextFact[],
            capabilityGroups:
              malformedGroups as ReaderMarkdownReadmeEvidence["capabilityGroups"],
          }),
        }),
      ),
    ).not.toThrow();
    expect(
      buildReadmeProfile(
        input({
          evidence: evidence({
            overview: malformedFacts as ReaderTextFact[],
            capabilityGroups:
              malformedGroups as ReaderMarkdownReadmeEvidence["capabilityGroups"],
          }),
        }),
      ),
    ).toMatchObject({
      availability: "available",
      overview: [fact("Safe fact")],
      capabilityGroups: [group("Safe group", fact("Safe capability"))],
    });
  });

  it("never rereads stateful fact or capability fields after validation", () => {
    const githubToken = `ghp_${"a".repeat(36)}`;
    let sourceReads = 0;
    let pathReads = 0;
    let textReads = 0;
    let labelReads = 0;
    const sourceSwitch = {
      get source() {
        sourceReads += 1;
        return sourceReads === 1 ? "readme" : "analysis";
      },
      path: "README.md",
      text: "Source switch",
    } as ReaderTextFact;
    const pathSwitch = {
      source: "readme",
      get path() {
        pathReads += 1;
        return pathReads === 1 ? "README.md" : `README.${githubToken}.md`;
      },
      text: "Path switch",
    } as ReaderTextFact;
    const textSwitch = {
      source: "readme",
      path: "README.md",
      get text() {
        textReads += 1;
        return textReads === 1 ? "Text switch" : githubToken;
      },
    } as ReaderTextFact;
    const labelSwitch = {
      get label() {
        labelReads += 1;
        return labelReads === 1 ? "Safe label" : githubToken;
      },
      facts: [fact("Capability")],
    };

    const result = buildReadmeProfile(
      input({
        evidence: evidence({
          overview: [textSwitch],
          audiences: [sourceSwitch],
          problems: [pathSwitch],
          capabilityGroups: [labelSwitch],
          workflow: [fact("Stable")],
        }),
      }),
    );

    expect(result).toMatchObject({
      availability: "available",
      overview: [],
      audiences: [],
      problems: [],
      capabilityGroups: [],
      workflow: [fact("Stable")],
    });
    expect(JSON.stringify(result)).not.toContain(githubToken);
    expect(result.audiences).not.toContainEqual(
      expect.objectContaining({ source: "analysis" }),
    );
    expect({ sourceReads, pathReads, textReads, labelReads }).toEqual({
      sourceReads: 0,
      pathReads: 0,
      textReads: 0,
      labelReads: 0,
    });
  });

  it("fails closed on throwing accessors, descriptor proxies, and revoked arrays", () => {
    const throwingAccessor = {
      get source(): never {
        throw new Error("source getter must not run");
      },
      path: "README.md",
      text: "Hidden",
    } as ReaderTextFact;
    const descriptorProxy = new Proxy(fact("Hidden proxy"), {
      getOwnPropertyDescriptor() {
        throw new Error("descriptor trap");
      },
    });
    const revokedOverview = Proxy.revocable([fact("Revoked overview")], {});
    revokedOverview.revoke();
    const revokedGroupFacts = Proxy.revocable([fact("Revoked capability")], {});
    revokedGroupFacts.revoke();
    const revokedGroups = Proxy.revocable(
      [group("Revoked group", fact("Hidden group"))],
      {},
    );
    revokedGroups.revoke();

    for (const unsafeEvidence of [
      evidence({
        overview: [throwingAccessor, descriptorProxy, fact("Stable")],
      }),
      evidence({
        overview: revokedOverview.proxy,
      }),
      evidence({
        capabilityGroups: [
          {
            label: "Revoked facts",
            facts: revokedGroupFacts.proxy,
          },
        ],
      }),
      evidence({
        capabilityGroups: revokedGroups.proxy,
      }),
    ]) {
      expect(() =>
        buildReadmeProfile(input({ evidence: unsafeEvidence })),
      ).not.toThrow();
    }
    expect(
      buildReadmeProfile(
        input({
          evidence: evidence({
            overview: [throwingAccessor, descriptorProxy, fact("Stable")],
          }),
        }),
      ).overview,
    ).toEqual([fact("Stable")]);
  });

  it("does not mutate frozen input and returns detached facts and groups", () => {
    const originalFact = fact("Original");
    const originalGroup = {
      label: "Planning",
      facts: [originalFact],
    };
    const frozenEvidence = evidence({
      overview: [originalFact],
      capabilityGroups: [originalGroup],
      workflow: [fact("First"), fact("Second")],
    });
    Object.freeze(originalFact);
    Object.freeze(originalGroup.facts);
    Object.freeze(originalGroup);
    for (const value of Object.values(frozenEvidence)) Object.freeze(value);
    Object.freeze(frozenEvidence);
    const result = buildReadmeProfile(input({ evidence: frozenEvidence }));

    expect(result.workflow.map(({ text }) => text)).toEqual([
      "First",
      "Second",
    ]);
    expect(result.overview[0]).not.toBe(originalFact);
    expect(result.capabilityGroups[0]).not.toBe(originalGroup);
    const outputFact = result.overview[0];
    if (outputFact !== undefined) outputFact.text = "Changed output";
    expect(originalFact.text).toBe("Original");
  });

  it("keeps unrelated coverage failures outside the README-specific state", () => {
    const result = buildReadmeProfile(
      input({
        preferredReadmeState: "fetched",
        evidence: evidence({ overview: [fact("Fetched overview")] }),
      }),
    );

    expect(result.availability).toBe("available");
    expect(result.overview).toEqual([fact("Fetched overview")]);
  });

  it("serializes only canonical commentary identifiers in canonical group order", () => {
    const result = buildReadmeProfile(
      input({
        evidence: evidence({
          overview: [fact("First"), fact("Second")],
          audiences: [fact("Maintainers")],
          capabilityGroups: [group("Planning", fact("Draft"))],
          dependencies: [fact("Node.js 24")],
        }),
        corroboration: corroboration({
          treeComplete: true,
          securityPrivacyFactCount: 0,
        }),
      }),
    );
    const positions = result.commentary.map((id) =>
      READER_COMMENTARY_IDS.indexOf(id),
    );

    expect(result.commentary).toHaveLength(8);
    expect(positions).toEqual(
      [...positions].sort((left, right) => left - right),
    );
    expect(new Set(result.commentary).size).toBe(result.commentary.length);
    expect(
      result.commentary.every((id): id is ReaderCommentaryId =>
        READER_COMMENTARY_IDS.includes(id),
      ),
    ).toBe(true);
  });
});
