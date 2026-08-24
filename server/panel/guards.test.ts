import { describe, expect, it } from "vitest";

import type { Language } from "../../src/features/analysis/model.js";
import {
  DEEP_REPORT_CAPS,
  type DeepStatement,
} from "../../src/features/deep-analysis/model.js";
import { buildEvidencePack } from "../evidence/build-evidence-pack.js";
import type { EvidencePack } from "../evidence/model.js";
import { VERIFIED_GITHUB_SNAPSHOT } from "../test/github-fixtures.js";
import {
  CHALLENGE_DESTINATIONS,
  PANEL_LIMITS,
  ROLE_REQUIRED_SECTIONS,
  type DeepReportDraft,
  type DeepReportServerFields,
  type ExpertReview,
  type ExpertRole,
  type SkepticalReview,
} from "./model.js";
import {
  acceptedRolesCoverRequiredSections,
  isDeepReportDraft,
  isExpertReview,
  isSkepticalReview,
  materializeDeepReportDraft,
  snapshotDeepReportDraft,
  stripDraftChallengeLinks,
  type DeepReportDraftValidationContext,
} from "./guards.js";

const SHA = "a".repeat(40);
const ACQUIRED_AT = "2026-08-23T00:00:00.000Z";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture value");
  return value;
}

function evidencePack(): EvidencePack {
  return structuredClone(
    buildEvidencePack({
      snapshot: VERIFIED_GITHUB_SNAPSHOT,
      files: [],
      acquiredAt: ACQUIRED_AT,
    }),
  );
}

const NARRATIVE_ID = required(
  evidencePack().facts.find(
    (fact) => fact.trust === "observed" && fact.retention === "narrative",
  ),
).id;

function expertReview(role: ExpertRole): ExpertReview {
  return {
    schemaVersion: "1.0.0",
    role,
    findings: ROLE_REQUIRED_SECTIONS[role].map((section, index) => ({
      id: `finding-${role}-${String(index + 1).padStart(4, "0")}`,
      section,
      claim: `Grounded ${role} finding ${String(index + 1)}`,
      provenance: "observed-fact",
      confidence: "high",
      importance: index === 0 ? "primary" : "supporting",
      evidenceIds: [NARRATIVE_ID],
    })),
    unknowns: [],
  };
}

function maximalExpertReview(role: ExpertRole): ExpertReview {
  const sections = ROLE_REQUIRED_SECTIONS[role];
  return {
    schemaVersion: "1.0.0",
    role,
    findings: Array.from(
      { length: PANEL_LIMITS.findingsPerReview },
      (_, index) => {
        const prefix = `${role}-${String(index + 1).padStart(2, "0")}:`;
        return {
          id: `finding-${role}-${String(index + 1).padStart(4, "0")}`,
          section: required(sections[index % sections.length]),
          claim: prefix + "x".repeat(640 - prefix.length),
          provenance: "observed-fact" as const,
          confidence: "high" as const,
          importance: "primary" as const,
          evidenceIds: [NARRATIVE_ID],
        };
      },
    ),
    unknowns: [],
  };
}

function skepticalReview(
  review: ExpertReview,
  kind: SkepticalReview["challenges"][number]["kind"] = "unsupported",
): SkepticalReview {
  return {
    schemaVersion: "1.0.0",
    challenges: [
      {
        id: "challenge-0001",
        findingId: required(review.findings[0]).id,
        kind,
        reason: "The primary claim needs explicit qualification.",
        evidenceIds: [NARRATIVE_ID],
      },
    ],
  };
}

function statement(text: string): DeepStatement {
  return {
    text,
    provenance: "observed-fact",
    confidence: "high",
    evidenceIds: [NARRATIVE_ID],
  };
}

function unknownStatement(text: string): DeepStatement {
  return {
    text,
    provenance: "unknown",
    confidence: "low",
    evidenceIds: [],
  };
}

function mutateStatements(
  value: unknown,
  mutate: (statement: DeepStatement) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) mutateStatements(item, mutate);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  if (
    Object.hasOwn(value, "text") &&
    Object.hasOwn(value, "provenance") &&
    Object.hasOwn(value, "confidence") &&
    Object.hasOwn(value, "evidenceIds")
  ) {
    mutate(value as DeepStatement);
    return;
  }
  for (const item of Object.values(value)) mutateStatements(item, mutate);
}

function packWithAlternatives(count: number): EvidencePack {
  return buildEvidencePack({
    snapshot: VERIFIED_GITHUB_SNAPSHOT,
    files: [],
    alternatives: Array.from({ length: count }, (_, index) => ({
      ...VERIFIED_GITHUB_SNAPSHOT.repository,
      owner: `alternative-${String(index + 1)}`,
      repo: "project",
      fullName: `alternative-${String(index + 1)}/project`,
      description: `Comparable project ${String(index + 1)}`,
    })),
    acquiredAt: ACQUIRED_AT,
  });
}

function serverFields(pack: EvidencePack): DeepReportServerFields {
  const parse = (text: string, prefix: string): Record<string, unknown> =>
    JSON.parse(text.slice(prefix.length)) as Record<string, unknown>;
  const counts = parse(
    required(
      pack.facts.find((fact) => fact.category === "community-live-counts"),
    ).text,
    "Community counts: ",
  );
  const state = parse(
    required(
      pack.facts.find((fact) => fact.category === "repository-live-state"),
    ).text,
    "Repository state: ",
  );
  const alternatives = pack.facts
    .filter((fact) => fact.category === "alternative-live-state")
    .map((fact) => {
      const live = parse(fact.text, "Alternative state: ");
      const [owner, repo] = String(live.repository).split("/");
      return {
        repository: { owner: required(owner), repo: required(repo) },
        github: {
          stars: Number(live.stars),
          forks: Number(live.forks),
          watchers: Number(live.watchers),
          openIssues: Number(live.openIssues),
          pushedAt: String(live.pushedAt),
          archived: Boolean(live.archived),
          license: live.license === "unknown" ? null : String(live.license),
        },
      };
    });
  return {
    review: { coverage: "full", capabilityClass: "multi-model" },
    community: {
      stars: Number(counts.stars),
      forks: Number(counts.forks),
      watchers: Number(counts.watchers),
      openIssues: Number(counts.openIssues),
      pushedAt: String(state.pushedAt),
      archived: Boolean(state.archived),
      license: state.license === "unknown" ? null : String(state.license),
    },
    alternatives,
  };
}

function fullDraft(
  challenge?: SkepticalReview["challenges"][number],
): DeepReportDraft {
  const linked =
    challenge === undefined
      ? undefined
      : {
          statement: statement("Primary challenge resolution"),
          sourceChallengeId: challenge.id,
        };
  const disagreements =
    challenge !== undefined &&
    CHALLENGE_DESTINATIONS[challenge.kind] === "disagreements"
      ? [required(linked)]
      : [];
  const nextChecks =
    challenge !== undefined &&
    CHALLENGE_DESTINATIONS[challenge.kind] === "nextChecks"
      ? [required(linked)]
      : [
          {
            statement: statement(
              "Verify the remaining operational assumptions",
            ),
            sourceChallengeId: null,
          },
        ];
  return {
    schemaVersion: "1.0.0",
    language: "en",
    orientation: {
      summary: [statement("Orientation summary")],
      verdict: statement("Orientation verdict"),
    },
    fit: {
      goodFor: [statement("Appropriate user fit")],
      poorFor: [statement("Inappropriate user fit")],
    },
    situations: [statement("Representative situation")],
    capabilities: [
      {
        title: statement("Capability group"),
        items: [statement("Capability item")],
      },
    ],
    workflow: [statement("Observed workflow")],
    architecture: {
      summary: [statement("Architecture summary")],
      technologies: [statement("Architecture technology")],
      concepts: [statement("Architecture concept")],
    },
    onboarding: {
      prerequisites: [statement("Onboarding prerequisite")],
      install: [statement("Onboarding installation")],
      run: [statement("Onboarding run step")],
      develop: [statement("Onboarding development step")],
      cautions: [statement("Onboarding caution")],
    },
    trust: {
      reliability: [statement("Reliability assessment")],
      security: [statement("Security assessment")],
      privacy: [statement("Privacy assessment")],
      unknowns: [
        unknownStatement("Evidence does not establish every trust property"),
      ],
    },
    maintenance: {
      summary: [statement("Maintenance summary")],
      signals: [statement("Maintenance signal")],
    },
    alternatives: [],
    disagreements,
    nextChecks,
    finalVerdict: {
      decision: "compare-first",
      summary: statement("Final qualified verdict"),
    },
  };
}

function context(
  reviews: readonly ExpertReview[],
  skeptic: SkepticalReview,
  expectedLanguage: Language = "en",
  pack: EvidencePack = evidencePack(),
): DeepReportDraftValidationContext {
  return {
    pack,
    expectedLanguage,
    acceptedExpertReviews: reviews,
    skepticalReview: skeptic,
  };
}

const VALID_ROLE_PAIRS: ReadonlyArray<readonly [ExpertRole, ExpertRole]> = [
  ["product", "onboarding-architecture"],
  ["product", "trust-ecosystem"],
  ["onboarding-architecture", "trust-ecosystem"],
];

describe("specialist guards and role coverage", () => {
  it("deep-freezes the matrix and accepts every legal two-role combination", () => {
    expect(Object.isFrozen(ROLE_REQUIRED_SECTIONS)).toBe(true);
    expect(
      Object.values(ROLE_REQUIRED_SECTIONS).every((sections) =>
        Object.isFrozen(sections),
      ),
    ).toBe(true);
    for (const [left, right] of VALID_ROLE_PAIRS) {
      expect(
        acceptedRolesCoverRequiredSections([
          expertReview(left),
          expertReview(right),
        ]),
      ).toBe(true);
    }
    expect(acceptedRolesCoverRequiredSections([])).toBe(false);
    expect(acceptedRolesCoverRequiredSections([expertReview("product")])).toBe(
      false,
    );
    expect(
      acceptedRolesCoverRequiredSections([
        expertReview("product"),
        expertReview("product"),
      ]),
    ).toBe(false);
  });

  it("rejects duplicate IDs/evidence and malformed unknowns", () => {
    const pack = evidencePack();
    const review = expertReview("product");
    expect(isExpertReview(review, pack)).toBe(true);
    expect(
      isExpertReview(
        {
          ...review,
          findings: [
            {
              ...required(review.findings[0]),
              id: required(review.findings[1]).id,
            },
            ...review.findings.slice(1),
          ],
        },
        pack,
      ),
    ).toBe(false);
    expect(
      isExpertReview(
        {
          ...review,
          findings: [
            {
              ...required(review.findings[0]),
              evidenceIds: [NARRATIVE_ID, NARRATIVE_ID],
            },
            ...review.findings.slice(1),
          ],
        },
        pack,
      ),
    ).toBe(false);
    const unknown = {
      id: `finding-product-${String(review.findings.length + 1).padStart(4, "0")}`,
      section: "trust" as const,
      claim: "Evidence does not establish private data handling.",
      provenance: "unknown" as const,
      confidence: "low" as const,
      importance: "supporting" as const,
      evidenceIds: [] as string[],
    };
    expect(isExpertReview({ ...review, unknowns: [unknown] }, pack)).toBe(true);
    expect(
      isExpertReview(
        { ...review, unknowns: [{ ...unknown, confidence: "high" }] },
        pack,
      ),
    ).toBe(false);
  });

  it("caps each review by finding count and escaped transport size", () => {
    const pack = evidencePack();
    const maximal = maximalExpertReview("trust-ecosystem");
    expect(isExpertReview(maximal, pack)).toBe(true);
    expect(
      isExpertReview(
        {
          ...maximal,
          findings: [
            ...maximal.findings,
            {
              ...required(maximal.findings[0]),
              id: "finding-trust-ecosystem-0011",
              claim: "An eleventh distinct finding",
            },
          ],
        },
        pack,
      ),
    ).toBe(false);

    const escapedExpansion = structuredClone(maximal);
    escapedExpansion.findings = escapedExpansion.findings.map(
      (finding, index) => ({
        ...finding,
        claim: `${String(index).padStart(2, "0")}${"&".repeat(638)}`,
      }),
    );
    expect(isExpertReview(escapedExpansion, pack)).toBe(false);
  });

  it("rejects getters without reading, proxies, cycles, deep graphs, and sparse arrays", () => {
    const pack = evidencePack();
    const getterReview = expertReview("product");
    let reads = 0;
    Object.defineProperty(getterReview, "findings", {
      enumerable: true,
      get() {
        reads += 1;
        return [];
      },
    });
    expect(isExpertReview(getterReview, pack)).toBe(false);
    expect(reads).toBe(0);
    expect(isExpertReview(new Proxy(expertReview("product"), {}), pack)).toBe(
      false,
    );

    const cyclic = expertReview("product") as ExpertReview & {
      cycle?: unknown;
    };
    cyclic.cycle = cyclic;
    expect(isExpertReview(cyclic, pack)).toBe(false);

    const deep = expertReview("product") as ExpertReview & { extra?: unknown };
    let cursor: Record<string, unknown> = {};
    deep.extra = cursor;
    for (let index = 0; index < 70; index += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    expect(isExpertReview(deep, pack)).toBe(false);

    const sparse = expertReview("product");
    sparse.findings = new Array(
      sparse.findings.length,
    ) as ExpertReview["findings"];
    expect(isExpertReview(sparse, pack)).toBe(false);

    const bigint = expertReview("product") as unknown as {
      schemaVersion: string;
      role: string;
      findings: Array<Record<string, unknown>>;
      unknowns: unknown[];
    };
    required(bigint.findings[0]).claim = 1n;
    expect(() => isExpertReview(bigint, pack)).not.toThrow();
    expect(isExpertReview(bigint, pack)).toBe(false);
  });
});

describe("skeptic and draft guards", () => {
  it("rejects duplicate roles, challenge IDs, and unknown challenge references", () => {
    const pack = evidencePack();
    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);
    expect(isSkepticalReview(skeptic, pack, [product, onboarding])).toBe(true);
    expect(isSkepticalReview(skeptic, pack, [product, product])).toBe(false);
    expect(
      isSkepticalReview(
        {
          ...skeptic,
          challenges: [
            required(skeptic.challenges[0]),
            { ...required(skeptic.challenges[0]) },
          ],
        },
        pack,
        [product, onboarding],
      ),
    ).toBe(false);
    expect(
      isSkepticalReview(
        {
          ...skeptic,
          challenges: [
            {
              ...required(skeptic.challenges[0]),
              findingId: "finding-missing-0001",
            },
          ],
        },
        pack,
        [product, onboarding],
      ),
    ).toBe(false);
    expect(
      isSkepticalReview(
        {
          ...skeptic,
          challenges: [
            {
              ...required(skeptic.challenges[0]),
              evidenceIds: [NARRATIVE_ID, NARRATIVE_ID],
            },
          ],
        },
        pack,
        [product, onboarding],
      ),
    ).toBe(false);
  });

  it("pre-rejects primary challenge sets that cannot fit their final destination", () => {
    const pack = evidencePack();
    const reviews = [
      maximalExpertReview("product"),
      maximalExpertReview("onboarding-architecture"),
      maximalExpertReview("trust-ecosystem"),
    ];
    const findings = reviews.flatMap((review) => review.findings);
    const atCapacity: SkepticalReview = {
      schemaVersion: "1.0.0",
      challenges: Array.from(
        { length: PANEL_LIMITS.challenges },
        (_, index) => ({
          id: `challenge-${String(index + 1).padStart(4, "0")}`,
          findingId: required(findings[index]).id,
          kind:
            index < DEEP_REPORT_CAPS.disagreements
              ? ("unsupported" as const)
              : ("incomplete" as const),
          reason: `Capacity challenge ${String(index + 1)}`,
          evidenceIds: [NARRATIVE_ID],
        }),
      ),
    };
    expect(isSkepticalReview(atCapacity, pack, reviews)).toBe(true);

    const impossible = structuredClone(atCapacity);
    required(impossible.challenges[DEEP_REPORT_CAPS.disagreements]).kind =
      "overstated";
    expect(isSkepticalReview(impossible, pack, reviews)).toBe(false);
  });

  it("rejects hostile draft and skeptic object graphs without invoking getters", () => {
    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);
    const draft = fullDraft(required(skeptic.challenges[0]));
    let reads = 0;
    Object.defineProperty(draft, "workflow", {
      enumerable: true,
      get() {
        reads += 1;
        return [];
      },
    });
    expect(
      isDeepReportDraft(draft, context([product, onboarding], skeptic)),
    ).toBe(false);
    expect(reads).toBe(0);

    const proxied = new Proxy(fullDraft(required(skeptic.challenges[0])), {});
    expect(
      isDeepReportDraft(proxied, context([product, onboarding], skeptic)),
    ).toBe(false);

    const malformed = {
      ...fullDraft(required(skeptic.challenges[0])),
      orientation: 1,
    };
    expect(() =>
      isDeepReportDraft(malformed, context([product, onboarding], skeptic)),
    ).not.toThrow();
    expect(
      isDeepReportDraft(malformed, context([product, onboarding], skeptic)),
    ).toBe(false);

    const sparseSkeptic = skepticalReview(product);
    sparseSkeptic.challenges = new Array(1) as SkepticalReview["challenges"];
    expect(
      isSkepticalReview(sparseSkeptic, evidencePack(), [product, onboarding]),
    ).toBe(false);
  });

  it("accepts complete drafts for every legal reduced-coverage role pair", () => {
    for (const [left, right] of VALID_ROLE_PAIRS) {
      const reviews = [expertReview(left), expertReview(right)];
      const skeptic = skepticalReview(required(reviews[0]));
      expect(
        isDeepReportDraft(
          fullDraft(required(skeptic.challenges[0])),
          context(reviews, skeptic),
        ),
      ).toBe(true);
    }
  });

  it("rejects empty/single-role coverage and shallow section content", () => {
    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);
    const draft = fullDraft(required(skeptic.challenges[0]));
    expect(
      isDeepReportDraft(
        draft,
        context([], { schemaVersion: "1.0.0", challenges: [] }),
      ),
    ).toBe(false);
    expect(stripDraftChallengeLinks(draft).disagreements).toEqual([
      draft.disagreements[0]?.statement,
    ]);
    expect(JSON.stringify(stripDraftChallengeLinks(draft))).not.toContain(
      "sourceChallengeId",
    );
    expect(isDeepReportDraft(draft, context([product], skeptic))).toBe(false);
    expect(
      isDeepReportDraft(
        { ...draft, workflow: [] },
        context([product, onboarding], skeptic),
      ),
    ).toBe(false);
    expect(
      isDeepReportDraft(
        {
          ...draft,
          onboarding: { ...draft.onboarding, cautions: [] },
        },
        context([product, onboarding], skeptic),
      ),
    ).toBe(false);
    expect(
      isDeepReportDraft(
        { ...draft, nextChecks: [] },
        context([product, onboarding], skeptic),
      ),
    ).toBe(false);
  });

  it("enforces every substantive editor minimum and alternative evidence", () => {
    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);
    const challenge = required(skeptic.challenges[0]);
    const requiredListPaths = [
      ["orientation", "summary"],
      ["fit", "goodFor"],
      ["fit", "poorFor"],
      ["situations"],
      ["workflow"],
      ["architecture", "summary"],
      ["architecture", "technologies"],
      ["architecture", "concepts"],
      ["onboarding", "prerequisites"],
      ["onboarding", "install"],
      ["onboarding", "run"],
      ["onboarding", "develop"],
      ["onboarding", "cautions"],
      ["trust", "reliability"],
      ["trust", "security"],
      ["trust", "privacy"],
      ["trust", "unknowns"],
      ["maintenance", "summary"],
      ["maintenance", "signals"],
      ["nextChecks"],
    ] as const;
    for (const path of requiredListPaths) {
      const draft = structuredClone(fullDraft(challenge));
      let target = draft as unknown as Record<string, unknown>;
      for (const segment of path.slice(0, -1)) {
        target = required(target[segment]) as Record<string, unknown>;
      }
      target[required(path.at(-1))] = [];
      expect(
        isDeepReportDraft(draft, context([product, onboarding], skeptic)),
        path.join("."),
      ).toBe(false);
    }

    const noCapabilityGroups = {
      ...fullDraft(challenge),
      capabilities: [],
    };
    expect(
      isDeepReportDraft(
        noCapabilityGroups,
        context([product, onboarding], skeptic),
      ),
    ).toBe(false);
    const noCapabilityItems = fullDraft(challenge);
    required(noCapabilityItems.capabilities[0]).items = [];
    expect(
      isDeepReportDraft(
        noCapabilityItems,
        context([product, onboarding], skeptic),
      ),
    ).toBe(false);

    const alternativePack = buildEvidencePack({
      snapshot: VERIFIED_GITHUB_SNAPSHOT,
      files: [],
      alternatives: [
        {
          ...VERIFIED_GITHUB_SNAPSHOT.repository,
          owner: "alternative",
          repo: "project",
          fullName: "alternative/project",
          description: "A comparable project",
        },
      ],
      acquiredAt: ACQUIRED_AT,
    });
    const alternativeEvidenceId = required(
      alternativePack.facts.find(
        (fact) => fact.kind === "alternative" && fact.retention === "narrative",
      ),
    ).id;
    expect(
      isDeepReportDraft(
        fullDraft(challenge),
        context([product, onboarding], skeptic, "en", alternativePack),
      ),
    ).toBe(false);
    const withAlternative = fullDraft(challenge);
    withAlternative.alternatives = [
      {
        repository: { owner: "alternative", repo: "project" },
        whyCompare: {
          ...statement("Compare the verified alternative"),
          provenance: "repository-claim",
          evidenceIds: [alternativeEvidenceId],
        },
      },
    ];
    expect(
      isDeepReportDraft(
        withAlternative,
        context([product, onboarding], skeptic, "en", alternativePack),
      ),
    ).toBe(true);
  });

  it("requires explicit, unique challenge links in the deterministic destination", () => {
    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);
    const challenge = required(skeptic.challenges[0]);
    const draft = fullDraft(challenge);
    expect(
      isDeepReportDraft(
        {
          ...draft,
          disagreements: draft.disagreements.map((entry) => ({
            ...entry,
            sourceChallengeId: null,
          })),
        },
        context([product, onboarding], skeptic),
      ),
    ).toBe(false);
    expect(
      isDeepReportDraft(
        {
          ...draft,
          disagreements: [],
          nextChecks: [
            {
              statement: statement("Wrong challenge destination"),
              sourceChallengeId: challenge.id,
            },
          ],
        },
        context([product, onboarding], skeptic),
      ),
    ).toBe(false);
    expect(
      isDeepReportDraft(
        {
          ...draft,
          disagreements: [
            ...draft.disagreements,
            {
              statement: statement("Duplicate challenge association"),
              sourceChallengeId: challenge.id,
            },
          ],
        },
        context([product, onboarding], skeptic),
      ),
    ).toBe(false);
    expect(
      isDeepReportDraft(
        {
          ...draft,
          disagreements: [
            {
              statement: statement("Legacy plural challenge association"),
              sourceChallengeIds: [challenge.id],
            },
          ],
        },
        context([product, onboarding], skeptic),
      ),
    ).toBe(false);
  });

  it("links a challenged zero-evidence unknown without evidence-ID impersonation", () => {
    const product = expertReview("product");
    for (const finding of product.findings) finding.importance = "supporting";
    const unknownId = `finding-product-${String(product.findings.length + 1).padStart(4, "0")}`;
    product.unknowns = [
      {
        id: unknownId,
        section: "trust",
        claim: "Evidence does not establish private processing behavior.",
        provenance: "unknown",
        confidence: "low",
        importance: "primary",
        evidenceIds: [],
      },
    ];
    const onboarding = expertReview("onboarding-architecture");
    const skeptic: SkepticalReview = {
      schemaVersion: "1.0.0",
      challenges: [
        {
          id: "challenge-0001",
          findingId: unknownId,
          kind: "incomplete",
          reason: "The unknown requires an explicit follow-up.",
          evidenceIds: [],
        },
      ],
    };
    const draft = fullDraft();
    draft.nextChecks = [
      {
        statement: unknownStatement(
          "Evidence does not establish the missing behavior",
        ),
        sourceChallengeId: "challenge-0001",
      },
    ];
    expect(
      isDeepReportDraft(draft, context([product, onboarding], skeptic)),
    ).toBe(true);
  });

  it("enforces expected language and rejects model-authored server fields", () => {
    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);
    const draft = fullDraft(required(skeptic.challenges[0]));
    expect(
      isDeepReportDraft(
        draft,
        context([product, onboarding], skeptic, "zh-CN"),
      ),
    ).toBe(false);
    for (const forged of [
      { ...draft, repository: { owner: "evil", repo: "repo", commitSha: SHA } },
      { ...draft, generatedAt: "2026-08-23T00:00:00.000Z" },
      { ...draft, review: { coverage: "full", capabilityClass: "auto" } },
      { ...draft, evidence: [] },
      {
        ...draft,
        maintenance: {
          ...draft.maintenance,
          community: { stars: 1 },
        },
      },
    ]) {
      expect(
        isDeepReportDraft(forged, context([product, onboarding], skeptic)),
      ).toBe(false);
    }
  });
});

describe("narrative evidence semantics and public materialization", () => {
  it("rejects live references and enforces provenance against evidence trust", () => {
    const pack = evidencePack();
    const liveId = required(
      pack.facts.find((fact) => fact.retention === "live"),
    ).id;
    const readmePack = buildEvidencePack({
      snapshot: VERIFIED_GITHUB_SNAPSHOT,
      files: [
        {
          path: "README.md",
          text: "# Overview\nDocumented behavior",
          bytes: 30,
          kind: "readme",
        },
      ],
      acquiredAt: ACQUIRED_AT,
    });
    const readmeId = required(readmePack.contentBlocks[0]).id;

    const liveReview = expertReview("product");
    required(liveReview.findings[0]).evidenceIds = [liveId];
    expect(isExpertReview(liveReview, pack)).toBe(false);

    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);
    const liveDraft = fullDraft(required(skeptic.challenges[0]));
    required(liveDraft.orientation.summary[0]).evidenceIds = [liveId];
    expect(
      isDeepReportDraft(
        liveDraft,
        context([product, onboarding], skeptic, "en", pack),
      ),
    ).toBe(false);
    expect(
      materializeDeepReportDraft(liveDraft, pack, serverFields(pack)),
    ).toBeNull();

    const observedAsClaim = expertReview("product");
    required(observedAsClaim.findings[0]).provenance = "repository-claim";
    expect(isExpertReview(observedAsClaim, pack)).toBe(false);

    const readmeAsObserved = expertReview("product");
    required(readmeAsObserved.findings[0]).evidenceIds = [readmeId];
    expect(isExpertReview(readmeAsObserved, readmePack)).toBe(false);

    const readmeAsClaim = expertReview("product");
    required(readmeAsClaim.findings[0]).provenance = "repository-claim";
    required(readmeAsClaim.findings[0]).evidenceIds = [readmeId];
    expect(isExpertReview(readmeAsClaim, readmePack)).toBe(true);
  });

  it("keeps narrative drafts valid across live count changes", () => {
    const baseline = evidencePack();
    const changed = buildEvidencePack({
      snapshot: {
        ...VERIFIED_GITHUB_SNAPSHOT,
        repository: {
          ...VERIFIED_GITHUB_SNAPSHOT.repository,
          starsCount: 999_999,
          watchersCount: 88_888,
          forksCount: 7_777,
          openIssuesCount: 666,
        },
      },
      files: [],
      acquiredAt: ACQUIRED_AT,
    });
    expect(
      baseline.facts
        .filter((fact) => fact.retention === "narrative")
        .map((fact) => fact.id),
    ).toEqual(
      changed.facts
        .filter((fact) => fact.retention === "narrative")
        .map((fact) => fact.id),
    );
    expect(
      baseline.facts
        .filter((fact) => fact.retention === "live")
        .map((fact) => fact.id),
    ).not.toEqual(
      changed.facts
        .filter((fact) => fact.retention === "live")
        .map((fact) => fact.id),
    );

    const reviews = [
      expertReview("product"),
      expertReview("onboarding-architecture"),
    ];
    const skeptic = skepticalReview(reviews[0] as ExpertReview);
    const draft = fullDraft(required(skeptic.challenges[0]));
    expect(
      isDeepReportDraft(draft, context(reviews, skeptic, "en", baseline)),
    ).toBe(true);
    expect(
      isDeepReportDraft(draft, context(reviews, skeptic, "en", changed)),
    ).toBe(true);
  });

  it("snapshots cache narratives without transient reviews while rechecking hostile data and live boundaries", () => {
    const pack = evidencePack();
    const draft = fullDraft();
    const snapshot = snapshotDeepReportDraft(draft, pack, "en");
    expect(snapshot).not.toBeNull();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot?.orientation)).toBe(true);
    const retainedText = snapshot?.orientation.summary[0]?.text;
    required(draft.orientation.summary[0]).text = "mutated after snapshot";
    expect(snapshot?.orientation.summary[0]?.text).toBe(retainedText);
    expect(snapshotDeepReportDraft(draft, pack, "zh-CN")).toBeNull();

    const badChallenge = fullDraft();
    badChallenge.nextChecks[0] = {
      statement: statement("Invalid cached challenge link"),
      sourceChallengeId: "not-a-challenge",
    };
    expect(snapshotDeepReportDraft(badChallenge, pack, "en")).toBeNull();

    const popularity = fullDraft();
    required(popularity.orientation.summary[0]).text =
      "Many stars prove this project is reliable";
    expect(snapshotDeepReportDraft(popularity, pack, "en")).toBeNull();

    const liveId = required(
      pack.facts.find((fact) => fact.retention === "live"),
    ).id;
    const live = fullDraft();
    required(live.orientation.summary[0]).evidenceIds = [liveId];
    expect(snapshotDeepReportDraft(live, pack, "en")).toBeNull();

    let getterCalls = 0;
    const hostile = fullDraft() as unknown as Record<string, unknown>;
    Object.defineProperty(hostile, "orientation", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return {};
      },
    });
    expect(snapshotDeepReportDraft(hostile, pack, "en")).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it("invalidates stale narrative references when authored content changes", () => {
    const baseline = evidencePack();
    const changed = buildEvidencePack({
      snapshot: {
        ...VERIFIED_GITHUB_SNAPSHOT,
        repository: {
          ...VERIFIED_GITHUB_SNAPSHOT.repository,
          description: "A different authored description",
        },
      },
      files: [],
      acquiredAt: ACQUIRED_AT,
    });
    const oldDescriptionId = required(
      baseline.facts.find((fact) => fact.label === "GitHub description"),
    ).id;
    const newDescriptionId = required(
      changed.facts.find((fact) => fact.label === "GitHub description"),
    ).id;
    expect(newDescriptionId).not.toBe(oldDescriptionId);

    const staleReview = expertReview("product");
    for (const finding of staleReview.findings) {
      finding.provenance = "repository-claim";
      finding.evidenceIds = [oldDescriptionId];
    }
    expect(isExpertReview(staleReview, baseline)).toBe(true);
    expect(isExpertReview(staleReview, changed)).toBe(false);

    const currentReviews = [
      expertReview("product"),
      expertReview("onboarding-architecture"),
    ];
    for (const review of currentReviews) {
      for (const finding of review.findings) {
        finding.provenance = "repository-claim";
        finding.evidenceIds = [newDescriptionId];
      }
    }
    const currentSkeptic = skepticalReview(currentReviews[0] as ExpertReview);
    required(currentSkeptic.challenges[0]).evidenceIds = [newDescriptionId];
    const staleDraft = fullDraft(required(currentSkeptic.challenges[0]));
    mutateStatements(staleDraft, (entry) => {
      if (entry.provenance !== "unknown") {
        entry.provenance = "repository-claim";
        entry.evidenceIds = [oldDescriptionId];
      }
    });
    expect(
      isDeepReportDraft(
        staleDraft,
        context(currentReviews, currentSkeptic, "en", changed),
      ),
    ).toBe(false);
  });

  it("uses strict language-specific single-clause unknown wording", () => {
    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);
    const valid = fullDraft(required(skeptic.challenges[0]));
    valid.language = "zh-CN";
    required(valid.trust.unknowns[0]).text = "现有证据无法确认数据处理方式";
    expect(
      isDeepReportDraft(
        valid,
        context([product, onboarding], skeptic, "zh-CN"),
      ),
    ).toBe(true);

    for (const text of [
      "现有证据无法确认数据处理，但绝对安全",
      "现有证据无法确认数据处理。项目绝对安全。",
      "现有证据无法确认数据处理，项目很安全",
    ]) {
      const invalid = structuredClone(valid);
      required(invalid.trust.unknowns[0]).text = text;
      expect(
        isDeepReportDraft(
          invalid,
          context([product, onboarding], skeptic, "zh-CN"),
        ),
        text,
      ).toBe(false);
    }
  });

  it.each([
    "<!-- hidden -->",
    "<!DOCTYPE html>",
    "~~~danger~~~",
    "[click](relative-path)",
    "[click][reference]",
    "![image](relative-path)",
    "https://example.test/path",
    "ftp://example.test/path",
    "www.example.test/path",
    "javascript:alert(1)",
    "mailto:person@example.test",
  ])("rejects forbidden model output markup or destinations: %s", (text) => {
    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);
    const draft = fullDraft(required(skeptic.challenges[0]));
    required(draft.orientation.summary[0]).text = text;
    expect(
      isDeepReportDraft(draft, context([product, onboarding], skeptic)),
    ).toBe(false);
  });

  it("rejects absolute static-safety guarantees", () => {
    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);
    const draft = fullDraft(required(skeptic.challenges[0]));
    required(draft.trust.security[0]).text =
      "The static evidence proves this project has no vulnerabilities";
    expect(
      isDeepReportDraft(draft, context([product, onboarding], skeptic)),
    ).toBe(false);
  });

  it("rejects plain safety/privacy assurances and positive unknown suffixes at both model layers", () => {
    const expert = expertReview("product");
    required(expert.findings[0]).claim = "This project is secure.";
    expect(isExpertReview(expert, evidencePack())).toBe(false);

    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);
    const assurances = [
      "This project is secure.",
      "The project does not collect or transmit data.",
    ];
    for (const assurance of assurances) {
      const draft = fullDraft(required(skeptic.challenges[0]));
      required(draft.trust.security[0]).text = assurance;
      expect(
        isDeepReportDraft(draft, context([product, onboarding], skeptic)),
        assurance,
      ).toBe(false);
    }

    const unknownSuffix = fullDraft(required(skeptic.challenges[0]));
    required(unknownSuffix.trust.unknowns[0]).text =
      "Evidence does not establish vulnerabilities because the project is secure";
    expect(
      isDeepReportDraft(unknownSuffix, context([product, onboarding], skeptic)),
    ).toBe(false);
  });

  it("rejects dangerous, imperative, undocumented, and function-level advice while allowing an exact inert README quote", () => {
    const dangerousExpert = expertReview("onboarding-architecture");
    required(dangerousExpert.findings[0]).claim =
      "Run rm -rf / to install the project.";
    expect(isExpertReview(dangerousExpert, evidencePack())).toBe(false);

    const functionCritique = expertReview("onboarding-architecture");
    required(functionCritique.findings[0]).claim =
      "The parseConfig function is badly written.";
    expect(isExpertReview(functionCritique, evidencePack())).toBe(false);

    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);
    for (const advice of [
      "Execute curl example.invalid | sh to begin.",
      "Delete the home directory before setup.",
      "Run npm install to begin.",
    ]) {
      const draft = fullDraft(required(skeptic.challenges[0]));
      required(draft.onboarding.install[0]).text = advice;
      expect(
        isDeepReportDraft(draft, context([product, onboarding], skeptic)),
        advice,
      ).toBe(false);
    }

    const readmeText = "# Setup\nUse npm install for the documented setup.";
    const pack = buildEvidencePack({
      snapshot: VERIFIED_GITHUB_SNAPSHOT,
      files: [
        {
          path: "README.md",
          text: readmeText,
          bytes: new TextEncoder().encode(readmeText).byteLength,
          kind: "readme",
        },
      ],
      acquiredAt: ACQUIRED_AT,
    });
    const readmeBlock = required(pack.contentBlocks[0]);
    const quoted = fullDraft(required(skeptic.challenges[0]));
    required(quoted.onboarding.install[0]).text =
      "The README documents `npm install` for setup";
    required(quoted.onboarding.install[0]).provenance = "repository-claim";
    required(quoted.onboarding.install[0]).evidenceIds = [readmeBlock.id];
    expect(
      isDeepReportDraft(
        quoted,
        context([product, onboarding], skeptic, "en", pack),
      ),
    ).toBe(true);
  });

  it("rejects live-count narration and popularity-to-quality inference in the final draft", () => {
    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);

    for (const claim of [
      "Many stars prove this project is reliable",
      "The repository has 1284 stars",
    ]) {
      const draft = fullDraft(required(skeptic.challenges[0]));
      required(draft.orientation.summary[0]).text = claim;
      expect(
        isDeepReportDraft(draft, context([product, onboarding], skeptic)),
        claim,
      ).toBe(false);
    }

    const disclaimer = fullDraft(required(skeptic.challenges[0]));
    required(disclaimer.orientation.summary[0]).text =
      "Star counts do not prove repository reliability";
    expect(
      isDeepReportDraft(disclaimer, context([product, onboarding], skeptic)),
    ).toBe(true);
  });

  it("requires complete reviewer coverage and popularity-bias challenges", () => {
    const product = expertReview("product");
    required(product.findings[0]).claim =
      "High star and fork counts prove repository reliability";
    const onboarding = expertReview("onboarding-architecture");
    const wrongKind = skepticalReview(product, "unsupported");
    expect(isSkepticalReview(wrongKind, evidencePack(), [product])).toBe(false);
    expect(
      isSkepticalReview(wrongKind, evidencePack(), [product, onboarding]),
    ).toBe(false);
    const popularity = skepticalReview(product, "popularity-bias");
    expect(
      isSkepticalReview(popularity, evidencePack(), [product, onboarding]),
    ).toBe(true);
  });

  it("requires exact explicit server-owned metrics and review metadata before final materialization", () => {
    const pack = evidencePack();
    const draft = fullDraft();
    expect(materializeDeepReportDraft(draft, pack, undefined)).toBeNull();
    expect(materializeDeepReportDraft(draft, pack, {})).toBeNull();

    const verified = serverFields(pack);
    const report = materializeDeepReportDraft(draft, pack, verified);
    expect(report?.maintenance.community).toEqual({
      stars: 1_284,
      forks: 146,
      watchers: 37,
      openIssues: 3,
      pushedAt: "2026-08-01T12:00:00Z",
      archived: false,
      license: "MIT",
    });
    expect(report?.review).toEqual({
      coverage: "full",
      capabilityClass: "multi-model",
    });

    const forged = structuredClone(verified);
    forged.community.stars = 0;
    expect(materializeDeepReportDraft(draft, pack, forged)).toBeNull();
  });

  it("materializes one of two alternatives with dense public IDs and rewritten refs", () => {
    const pack = packWithAlternatives(2);
    const product = expertReview("product");
    const onboarding = expertReview("onboarding-architecture");
    const skeptic = skepticalReview(product);
    const draft = fullDraft(required(skeptic.challenges[0]));
    const firstAlternative = required(
      pack.facts.find(
        (fact) =>
          fact.kind === "alternative" &&
          fact.retention === "narrative" &&
          fact.url === "https://github.com/alternative-1/project",
      ),
    );
    draft.alternatives = [
      {
        repository: { owner: "alternative-1", repo: "project" },
        whyCompare: {
          text: "Compare the first verified alternative",
          provenance: "repository-claim",
          confidence: "medium",
          evidenceIds: [firstAlternative.id],
        },
      },
    ];

    const report = materializeDeepReportDraft(draft, pack, serverFields(pack));
    expect(
      isDeepReportDraft(
        draft,
        context([product, onboarding], skeptic, "en", pack),
      ),
    ).toBe(true);
    expect(report).not.toBeNull();
    expect(report?.evidence.map((entry) => entry.id)).toEqual([
      "ev-0001",
      "ev-0002",
    ]);
    expect(report?.orientation.summary[0]?.evidenceIds).toEqual(["ev-0001"]);
    expect(report?.alternatives[0]?.whyCompare.evidenceIds).toEqual([
      "ev-0002",
    ]);
    expect(report?.alternatives[0]?.github.stars).toBe(1_284);
    expect(
      report?.evidence.some(
        (entry) => entry.url === "https://github.com/alternative-2/project",
      ),
    ).toBe(false);

    const missingSelectedFacts = serverFields(pack);
    missingSelectedFacts.alternatives =
      missingSelectedFacts.alternatives.slice(1);
    expect(
      materializeDeepReportDraft(draft, pack, missingSelectedFacts),
    ).toBeNull();
  });

  it("materializes content blocks with commit-pinned clickable URLs", () => {
    const text = "# Overview\nRepository-authored explanation";
    const pack = buildEvidencePack({
      snapshot: VERIFIED_GITHUB_SNAPSHOT,
      files: [
        {
          path: "README.md",
          text,
          bytes: new TextEncoder().encode(text).byteLength,
          kind: "readme",
        },
      ],
      acquiredAt: ACQUIRED_AT,
    });
    const block = required(pack.contentBlocks[0]);
    const draft = fullDraft();
    required(draft.orientation.summary[0]).provenance = "repository-claim";
    required(draft.orientation.summary[0]).evidenceIds = [block.id];

    const report = materializeDeepReportDraft(draft, pack, serverFields(pack));
    expect(report).not.toBeNull();
    expect(report?.evidence.find((entry) => entry.kind === "readme")?.url).toBe(
      `https://github.com/owner/repo/blob/${VERIFIED_GITHUB_SNAPSHOT.commitSha}/README.md`,
    );
  });
});
