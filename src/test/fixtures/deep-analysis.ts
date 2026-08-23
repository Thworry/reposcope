import type {
  DeepAnalysisRequest,
  DeepReport,
  DeepStatement,
} from "../../features/deep-analysis/model";

const COMMIT_SHA = "a".repeat(40);

function observed(text: string, evidenceId = "ev-0001"): DeepStatement {
  return {
    text,
    provenance: "observed-fact",
    confidence: "high",
    evidenceIds: [evidenceId],
  };
}

function interpretation(text: string, evidenceId = "ev-0002"): DeepStatement {
  return {
    text,
    provenance: "interpretation",
    confidence: "medium",
    evidenceIds: [evidenceId],
  };
}

export const DEEP_ANALYSIS_REQUEST_FIXTURE = {
  repository: { owner: "example", repo: "project", commitSha: COMMIT_SHA },
  language: "en",
} satisfies DeepAnalysisRequest;

export const DEEP_REPORT_FIXTURE = {
  schemaVersion: "1.0.0",
  repository: { owner: "example", repo: "project", commitSha: COMMIT_SHA },
  language: "en",
  generatedAt: "2026-08-23T12:00:00.000Z",
  review: { coverage: "full", capabilityClass: "multi-model" },
  orientation: {
    summary: [
      interpretation("The project offers focused repository analysis."),
    ],
    verdict: interpretation(
      "It merits a trial for teams evaluating public code.",
    ),
  },
  fit: {
    goodFor: [
      interpretation(
        "It suits maintainers who need a concise quality briefing.",
      ),
    ],
    poorFor: [
      interpretation("It is not intended for private repository inspection."),
    ],
  },
  situations: [
    interpretation("Use it before adopting an unfamiliar public dependency."),
  ],
  capabilities: [
    {
      title: observed("Repository inspection is the central capability."),
      items: [
        observed("The documented workflow evaluates a supplied repository."),
      ],
    },
  ],
  workflow: [
    observed(
      "A reader supplies a repository and reviews the resulting report.",
    ),
  ],
  architecture: {
    summary: [
      interpretation("The application separates acquisition from analysis."),
    ],
    technologies: [observed("The manifest declares TypeScript.", "ev-0003")],
    concepts: [
      interpretation("Deterministic checks form the baseline assessment."),
    ],
  },
  onboarding: {
    prerequisites: [
      observed("A supported JavaScript runtime is required.", "ev-0003"),
    ],
    install: [
      observed("The README documents dependency installation.", "ev-0002"),
    ],
    run: [
      observed("The README documents a local development command.", "ev-0002"),
    ],
    develop: [
      interpretation(
        "Contributors can begin with the documented local workflow.",
      ),
    ],
    cautions: [
      interpretation("Public repository access is a current product boundary."),
    ],
  },
  trust: {
    reliability: [
      interpretation("The visible test setup supports cautious evaluation."),
    ],
    security: [
      interpretation("Security should be reviewed against deployment needs."),
    ],
    privacy: [
      observed("The documented analysis scope is public repository data."),
    ],
    unknowns: [
      {
        text: "Long-term operational behavior remains unknown.",
        provenance: "unknown",
        confidence: "low",
        evidenceIds: [],
      },
    ],
  },
  maintenance: {
    summary: [
      interpretation(
        "Recent repository activity warrants continued evaluation.",
      ),
    ],
    signals: [observed("The repository metadata records recent activity.")],
    community: {
      stars: 120,
      forks: 18,
      watchers: 9,
      openIssues: 4,
      pushedAt: "2026-08-20T08:00:00.000Z",
      archived: false,
      license: "MIT",
    },
  },
  alternatives: [
    {
      repository: { owner: "sample", repo: "alternative" },
      github: {
        stars: 80,
        forks: 12,
        watchers: 7,
        openIssues: 3,
        pushedAt: "2026-08-19T08:00:00.000Z",
        archived: false,
        license: "Apache-2.0",
      },
      whyCompare: interpretation(
        "The alternative addresses a similar repository review workflow.",
        "ev-0004",
      ),
    },
  ],
  disagreements: [
    interpretation(
      "Reviewers differed on how quickly a new team could adopt it.",
    ),
  ],
  nextChecks: [
    interpretation("Confirm the local workflow in a disposable environment."),
  ],
  finalVerdict: {
    decision: "worth-trying",
    summary: interpretation(
      "A bounded trial is justified by the available evidence.",
    ),
  },
  evidence: [
    {
      id: "ev-0001",
      kind: "github",
      label: "Public repository metadata",
      path: null,
      url: "https://github.com/example/project",
    },
    {
      id: "ev-0002",
      kind: "readme",
      label: "Preferred README",
      path: "README.md",
      url: `https://github.com/example/project/blob/${COMMIT_SHA}/README.md`,
    },
    {
      id: "ev-0003",
      kind: "manifest",
      label: "Package manifest",
      path: "package.json",
      url: `https://github.com/example/project/blob/${COMMIT_SHA}/package.json`,
    },
    {
      id: "ev-0004",
      kind: "alternative",
      label: "Verified comparison repository",
      path: null,
      url: "https://github.com/sample/alternative",
    },
  ],
} satisfies DeepReport;
