# Human-readable Repository Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace RepoScope's score-first completed report with a deterministic,
human-readable decision dossier that explains purpose, practical scenarios,
reliability evidence, architecture, setup, security/privacy unknowns,
maintenance, and alternative-comparison criteria before a collapsed technical
appendix.

**Architecture:** Keep the existing `projectBrief` and ruleset as immutable
inputs, then add a required non-scoring `readerReport` built inside the analysis
worker from already-fetched metadata, tree, documentation, manifests, general
metrics, and coverage. Strictly validate and cache the structured evidence, then
localize it in a new single-column React report; the current score and rule UI
move unchanged into one closed-by-default technical appendix.

**Tech Stack:** TypeScript 6, React 19, Vite 8, Vitest 4, Testing Library,
Playwright 1.62, Axe, existing CSS custom properties, GitHub public REST/raw
fixtures.

## Global Constraints

- Ruleset stays exactly `1.0.0`; do not change rule IDs, thresholds, points,
  dimension weights, scoring inputs, confidence, strengths, or improvements.
- Node stays `>=24 <25`, package manager stays `pnpm@11.16.0`, and
  `pnpm-lock.yaml` must remain byte-identical; add no dependency.
- Keep the existing three GitHub REST requests and raw-text selection: at most
  200 attempts/files, 10 MiB fetched text, 256 KiB per file, six concurrent raw
  fetches, 15-second request timeout, and 90-second fetch-phase timeout.
- Keep the 15-minute session cache TTL and 2 MiB serialized entry cap.
- Keep CSP, three fixed GitHub connection origins, Pages base-path behavior,
  parser lazy chunks, and bundle budgets unchanged.
- Add no AI service, backend, login, repository token, analytics, project-code
  execution, arbitrary translation, or raw-source persistence.
- Reader prose is at most 480 Unicode code points per fact. Commands are at
  most 160 Unicode code points. Paths use the existing 1,024-character safe
  path contract.
- The reader report is non-scoring. Function length, cyclomatic complexity,
  rule IDs, dimensions, and long file lists appear only inside the technical
  appendix.
- Use exact bilingual structural copy. Repository-authored prose remains in its
  source language.
- Preserve the warm editorial inspection-sheet system; no card dashboard,
  gradients, glass effects, illustrations, new colors, or new motion.
- Interactive targets remain at least 44 by 44 CSS pixels with a nontransparent
  3-pixel focus indicator. There is no overflow at 188, 375, 900, or 1366 CSS
  pixels, and reduced-motion behavior remains intact.
- Every task starts from a clean worktree, records a real failing test before
  production changes, runs its focused gates, receives a fresh spec/quality
  review, and creates a new commit without amend or push.

---

## File Structure

### New analysis files

- `src/features/analysis/reader-report-policy.ts` — canonical signal order,
  reliability decision table, question priority, and shared derivation used by
  analyzer and strict guard.
- `src/features/analysis/reader-report-policy.test.ts` — exact 180-day,
  incomplete-evidence, decisive-gap, and question-order boundaries.
- `src/features/analyzers/reader-report/markdown.ts` — one-pass bounded README
  extraction for scenarios, architecture/security prose, and documented
  commands.
- `src/features/analyzers/reader-report/markdown.test.ts` — heading, hostile
  Markdown, caps, deterministic order, and source-language fixtures.
- `src/features/analyzers/reader-report/commands.ts` — safe command
  normalization, manifest invocation derivation, command precedence, and
  review/withheld classification.
- `src/features/analyzers/reader-report/commands.test.ts` — package manager,
  command kind, unsafe shell shape, credential, and cap fixtures.
- `src/features/analyzers/reader-report.ts` — orchestration for reliability,
  architecture, security/privacy, maintenance, and alternatives.
- `src/features/analyzers/reader-report.test.ts` — complete/minimal/partial,
  archived/stale, non-deep-language, shuffled-input, and non-scoring fixtures.

### New UI files

- `src/components/reader-report-source.tsx` — immutable source links and plain
  GitHub-metadata/analysis labels.
- `src/components/reader-report.tsx` — decision summary and six reader chapters.
- `src/components/reader-report.test.tsx` — semantics, bilingual copy,
  fallbacks, hostile text, commands, questions, and search link.
- `src/components/technical-appendix.tsx` — closed disclosure containing the
  complete existing score/rule UI plus the moved technical overview.
- `src/components/technical-appendix.test.tsx` — closed/open behavior and full
  technical-surface preservation.

### Existing files modified

- `src/features/analysis/model.ts` — frozen reader-report vocabulary and exact
  serializable interfaces; required `AnalysisReport.readerReport`.
- `src/features/analysis/guards.ts` and `.test.ts` — strict nested validation,
  canonical order/caps, status recomputation, hostile/cycle/proxy rejection.
- `src/features/worker/analysis.worker.ts` and `.test.ts` — reader dependency,
  one call after coverage construction, final report serialization.
- `src/features/cache/report-cache.test.ts` — round trip, stale shape, 2 MiB,
  and no unsafe reader text.
- `src/features/worker/worker-client.test.ts` — accept valid and reject malformed
  reader completion.
- `src/test/fixtures/metrics.ts` — canonical `perfectReaderReport` fixture.
- `src/App.test.tsx`, `src/features/analysis/service.test.ts`,
  `src/features/analysis/use-repository-analysis.test.tsx`, and report component
  tests — add the required fixture without changing existing behavior.
- `src/components/report-summary.tsx` and `.test.tsx` — repository identity and
  immutable metadata only; remove score-first/project-brief rendering.
- `src/components/report-view.tsx` and `.test.tsx` — identity, actions, reader
  report, then technical appendix.
- `src/components/project-brief.tsx` and `.test.tsx` — remove after source-link
  and purpose rendering are covered by `reader-report`.
- `src/i18n/messages.ts` and `.test.ts` — exact English/Chinese chapter,
  judgement, fallback, question, command, and limitation copy; update landing
  promise from code metrics to project understanding.
- `src/styles/app.css` — single-column dossier, ruled evidence rows, readable
  measure, status treatment, command wrapping, and technical disclosure.
- `e2e/fixtures.ts`, `e2e/fixtures/source-files.ts`, and
  `e2e/reposcope.spec.ts` — deterministic complete, minimal, partial,
  archived/stale, hostile, and appendix browser proof.
- `README.md`, `README.zh-CN.md`, `CHANGELOG.md`, `docs/architecture.md`,
  `docs/methodology.md`, and `src/repository-files.test.ts` — public contract and
  exact repository-file regression coverage.

---

### Task 1: Freeze the reader evidence model and reliability policy

**Files:**

- Create: `src/features/analysis/reader-report-policy.ts`
- Create: `src/features/analysis/reader-report-policy.test.ts`
- Modify: `src/features/analysis/model.ts:146-202`
- Modify: `src/test/fixtures/metrics.ts:1-91`

**Interfaces:**

- Consumes: existing `ProjectBrief`, `CoverageSummary`, `GeneralMetrics`, and
  `RepositoryMetadata` types.
- Produces:

```ts
export const READER_AVAILABILITY = [
  "available",
  "partial",
  "unavailable",
] as const;
export type ReaderAvailability = (typeof READER_AVAILABILITY)[number];

export const RELIABILITY_STATUSES = [
  "continue-evaluation",
  "verify-before-use",
  "insufficient-evidence",
] as const;
export type ReliabilityStatus = (typeof RELIABILITY_STATUSES)[number];

export const READER_SIGNAL_IDS = [
  "archived",
  "install",
  "run",
  "license",
  "recent-activity",
  "tests",
  "ci",
  "coverage",
  "security-policy",
  "version-history",
  "contributing",
  "issue-templates",
  "dependency-updates",
  "configuration",
] as const;
export type ReaderSignalId = (typeof READER_SIGNAL_IDS)[number];
export type ReaderSignalState = "present" | "absent" | "unknown";

export const READER_QUESTION_IDS = [
  "license-compatibility",
  "reproduce-install-run",
  "runtime-data-flow",
  "vulnerability-process",
  "release-compatibility",
] as const;
export type ReaderQuestionId = (typeof READER_QUESTION_IDS)[number];

export interface ReaderEvidenceSource {
  source:
    | "github-metadata"
    | "readme"
    | "documentation"
    | "manifest"
    | "tree"
    | "analysis";
  path: string | null;
}

export interface ReaderTextFact extends ReaderEvidenceSource {
  text: string;
}

export interface ReaderSignalFact extends ReaderEvidenceSource {
  signal: ReaderSignalId;
  state: ReaderSignalState;
}

export const READER_COMMAND_KINDS = [
  "install",
  "run",
  "develop",
  "test",
  "build",
] as const;
export type ReaderCommandKind = (typeof READER_COMMAND_KINDS)[number];
export type ReaderCommandDisposition = "ready" | "review" | "withheld";

export interface ReaderCommandFact extends ReaderEvidenceSource {
  kind: ReaderCommandKind;
  command: string | null;
  disposition: ReaderCommandDisposition;
}

export const READER_ECOSYSTEMS = [
  "javascript-typescript",
  "python",
  "go",
  "rust",
  "java-jvm",
  "dotnet",
  "ruby",
  "php",
  "swift",
  "dart",
  "other",
] as const;
export type ReaderEcosystem = (typeof READER_ECOSYSTEMS)[number];

export const READER_ACTIVITY_BANDS = [
  "within-180-days",
  "181-365-days",
  "over-365-days",
] as const;
export type ReaderActivityBand = (typeof READER_ACTIVITY_BANDS)[number];

export interface ReaderReport {
  reliability: {
    availability: ReaderAvailability;
    status: ReliabilityStatus;
    signals: ReaderSignalFact[];
    questions: ReaderQuestionId[];
  };
  scenarios: {
    availability: ReaderAvailability;
    facts: ReaderTextFact[];
  };
  architecture: {
    availability: ReaderAvailability;
    excerpts: ReaderTextFact[];
    documents: string[];
    entryPoints: string[];
    sourceAreas: string[];
    ecosystems: ReaderEcosystem[];
  };
  gettingStarted: {
    availability: ReaderAvailability;
    commands: ReaderCommandFact[];
  };
  securityPrivacy: {
    availability: ReaderAvailability;
    signals: ReaderSignalFact[];
    declarations: ReaderTextFact[];
  };
  maintenance: {
    availability: ReaderAvailability;
    signals: ReaderSignalFact[];
    activity: {
      elapsedUtcDays: number;
      band: ReaderActivityBand;
    };
    openIssuesCount: number;
  };
  alternatives: {
    searchTerms: string[];
  };
}
```

`AnalysisReport` does not receive `readerReport` until Task 4; Task 1 freezes the
standalone type and fixture without forcing unrelated report fixtures to change.

- [ ] **Step 1: Write the reliability-policy failing tests**

Create table-driven tests with the exact decisive policy:

```ts
type SignalStates = Partial<Record<ReaderSignalId, ReaderSignalState>>;

function signalFacts(states: SignalStates): ReaderSignalFact[] {
  return READER_SIGNAL_IDS.map((signal) => ({
    signal,
    state: states[signal] ?? "absent",
    source:
      signal === "archived" || signal === "recent-activity"
        ? "github-metadata"
        : "analysis",
    path: null,
  }));
}

const complete = {
  archived: "absent",
  install: "present",
  run: "present",
  license: "present",
  "recent-activity": "present",
  tests: "present",
  ci: "absent",
} as const;

it.each([
  [complete, "continue-evaluation"],
  [{ ...complete, archived: "present" }, "verify-before-use"],
  [{ ...complete, license: "absent" }, "verify-before-use"],
  [{ ...complete, install: "absent" }, "verify-before-use"],
  [{ ...complete, run: "absent" }, "verify-before-use"],
  [{ ...complete, "recent-activity": "absent" }, "verify-before-use"],
  [{ ...complete, tests: "absent", ci: "absent" }, "verify-before-use"],
  [{ ...complete, license: "unknown" }, "insufficient-evidence"],
])("derives %s", (states, expected) => {
  expect(deriveReliabilityStatus(signalFacts(states))).toBe(expected);
});

it("treats metadata-only repositories as insufficient evidence", () => {
  expect(
    deriveReliabilityStatus(
      signalFacts({ archived: "absent", "recent-activity": "present" }),
    ),
  ).toBe("insufficient-evidence");
});

it.each([
  [180, "present"],
  [181, "absent"],
  [365, "absent"],
  [366, "absent"],
])("uses the existing exact UTC activity boundary", (days, expected) => {
  expect(activityState(days, false)).toBe(expected);
});

it.each([
  [180, "within-180-days"],
  [181, "181-365-days"],
  [365, "181-365-days"],
  [366, "over-365-days"],
])("bands %s exact UTC days", (days, expected) => {
  expect(activityBand(days)).toBe(expected);
});

it.each([
  [0, true, "unavailable"],
  [1, true, "available"],
  [0, false, "partial"],
  [1, false, "partial"],
])("derives item availability", (itemCount, coverageComplete, expected) => {
  expect(deriveReaderAvailability(itemCount, coverageComplete)).toBe(expected);
});
```

Also assert signal order equals `READER_SIGNAL_IDS`, questions are unique and
limited to four, and question priority is license → install/run → release →
vulnerability → runtime data. The policy always includes
`license-compatibility`, `reproduce-install-run`, and `runtime-data-flow` because
those depend on the reader's intended use; it inserts `release-compatibility`
for archived/stale evidence and `vulnerability-process` when the security-policy
signal is absent or unknown, then keeps the first four unique questions in the
stated priority order.

- [ ] **Step 2: Run the policy suite to verify RED**

Run:

```bash
pnpm exec vitest run src/features/analysis/reader-report-policy.test.ts
```

Expected: FAIL because `reader-report-policy.ts` and the reader model exports do
not exist.

- [ ] **Step 3: Add the frozen model and minimal policy**

Implement the interfaces above and these exact pure functions:

```ts
export function deriveReliabilityStatus(
  signals: readonly ReaderSignalFact[],
): ReliabilityStatus;

export function deriveReaderQuestions(
  status: ReliabilityStatus,
  signals: readonly ReaderSignalFact[],
): ReaderQuestionId[];

export function activityState(
  elapsedUtcDays: number,
  archived: boolean,
): ReaderSignalState;

export function activityBand(elapsedUtcDays: number): ReaderActivityBand;

export function deriveReaderAvailability(
  itemCount: number,
  coverageComplete: boolean,
): ReaderAvailability;
```

`deriveReliabilityStatus` first returns `insufficient-evidence` when a decisive
signal (`archived`, `install`, `run`, `license`, `recent-activity`, and the
combined `tests`/`ci` group) is unknown. It also returns insufficient when every
non-metadata signal is absent, which is the exact complete-scan definition of
“too little interpretable public evidence.” It then returns
`verify-before-use` for archived-present, any decisive absent signal, or
tests-and-CI both absent. Only the remaining state returns
`continue-evaluation`. Optional security-policy and coverage signals never
promote the status.

Add `perfectReaderReport` to `src/test/fixtures/metrics.ts` with canonical signal
order, status `continue-evaluation`, three safe scenarios or fewer, one safe
command per command kind, and no raw source text.

- [ ] **Step 4: Run focused model and policy gates**

Run:

```bash
pnpm exec vitest run src/features/analysis/reader-report-policy.test.ts src/features/rules/rules.test.ts
pnpm exec tsc -b
pnpm lint
pnpm format:check
```

Expected: all PASS; ruleset tests remain byte-for-byte semantically unchanged.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/features/analysis/model.ts src/features/analysis/reader-report-policy.ts src/features/analysis/reader-report-policy.test.ts src/test/fixtures/metrics.ts
git commit -m "feat: define repository reader evidence"
```

---

### Task 2: Extract bounded human-facing Markdown and commands

**Files:**

- Create: `src/features/analyzers/reader-report/markdown.ts`
- Create: `src/features/analyzers/reader-report/markdown.test.ts`
- Create: `src/features/analyzers/reader-report/commands.ts`
- Create: `src/features/analyzers/reader-report/commands.test.ts`

**Interfaces:**

- Consumes: `GeneralAnalysisInput`, `FetchedTextFile`, `ReaderTextFact`,
  `ReaderCommandFact`, existing `preferredReadme`,
  `containsCredentialLikeValue`, and safe-path rules.
- Produces:

```ts
export interface ReaderMarkdownEvidence {
  scenarios: ReaderTextFact[];
  architecture: ReaderTextFact[];
  securityPrivacy: ReaderTextFact[];
  commands: ReaderCommandFact[];
}

export function extractReaderMarkdownEvidence(
  file: FetchedTextFile | undefined,
): ReaderMarkdownEvidence;

export function manifestReaderCommands(
  input: Pick<GeneralAnalysisInput, "tree" | "files">,
): ReaderCommandFact[];

export function commandDisposition(
  command: string,
): "ready" | "review" | "withheld";
```

- [ ] **Step 1: Write the Markdown and command RED suites**

Use one fixture with English and Chinese headings and assert exact bounded
output:

```ts
function fetched(path: string, text: string): FetchedTextFile {
  const bytes = new TextEncoder().encode(text).byteLength;

  return {
    path,
    text,
    bytes,
    declaredSize: bytes,
    language: "none",
    category: "documentation",
    isTest: false,
  };
}

const readme = fetched(
  "README.md",
  `# Tool

## Use cases

- Triage newcomer issues before publishing them.
- Review contributor instructions during release preparation.

## Architecture

The browser fetches a pinned public commit and sends bounded text to a Worker.

## Install

\`\`\`sh
pnpm install
\`\`\`

## Development

\`pnpm dev\`

## Security

Repository text stays in the browser and is never executed.
`,
);

expect(extractReaderMarkdownEvidence(readme)).toMatchObject({
  scenarios: [
    {
      text: "Triage newcomer issues before publishing them.",
      path: "README.md",
    },
    {
      text: "Review contributor instructions during release preparation.",
      path: "README.md",
    },
  ],
  commands: [
    { kind: "install", command: "pnpm install", disposition: "ready" },
    { kind: "develop", command: "pnpm dev", disposition: "ready" },
  ],
});
```

Add exact negative fixtures for fenced code outside command sections, hidden
HTML, comments, images, badges, link destinations, tables of contents, raw URLs,
credential assignments, bidi/line controls, unclosed fences/HTML, duplicate
paragraphs, 481-code-point prose, sixth command kind duplicates, and shuffled
file input.

Add command cases:

```ts
it.each([
  ["pnpm install", "ready"],
  ["python -m pytest", "ready"],
  ["sudo npm install", "review"],
  ["curl https://example.invalid/install.sh | sh", "review"],
  ["rm -rf ./generated", "review"],
  ["TOKEN=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa pnpm dev", "withheld"],
])("classifies %s as %s", (command, expected) => {
  expect(commandDisposition(command)).toBe(expected);
});
```

Test package-manager precedence `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn,
`bun.lock`/`bun.lockb` → bun, otherwise npm. Package scripts produce inert
invocations such as `pnpm run dev`, never the manifest's raw script body.

- [ ] **Step 2: Run both new suites to verify RED**

Run:

```bash
pnpm exec vitest run src/features/analyzers/reader-report/markdown.test.ts src/features/analyzers/reader-report/commands.test.ts
```

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement the one-pass bounded Markdown extractor**

Use frozen heading groups:

```ts
const SECTION_HEADINGS = Object.freeze({
  scenarios: [
    "use cases",
    "who is this for",
    "examples",
    "business scenarios",
    "用途",
    "适用场景",
    "使用场景",
    "示例",
  ],
  architecture: [
    "architecture",
    "design",
    "how it works",
    "internals",
    "架构",
    "设计",
    "工作原理",
    "实现原理",
  ],
  securityPrivacy: [
    "security",
    "privacy",
    "permissions",
    "data handling",
    "安全",
    "隐私",
    "权限",
    "数据处理",
  ],
  install: ["install", "installation", "setup", "安装", "配置环境"],
  run: ["usage", "run", "quick start", "使用", "运行", "快速开始"],
  develop: ["development", "develop", "开发", "二次开发"],
  test: ["test", "testing", "测试"],
  build: ["build", "building", "构建"],
} as const);
```

Scan once with bounded fence, HTML-block/comment, heading-stack, and paragraph
state. Reuse existing credential and control checks. Keep at most three
scenarios, two architecture paragraphs, three security/privacy declarations,
and five command facts. De-duplicate NFKC-normalized text while preserving first
source order. Do not parse or execute HTML/Markdown.

- [ ] **Step 4: Implement command normalization and manifest derivation**

Normalize one visible line after stripping only a leading `$`/`>` prompt. Reject
controls, bidi, malformed UTF-16, credential-like content, and values over 160
code points as `withheld` with `command: null`. Mark these frozen shapes
`review`: leading `sudo`, `curl`/`wget` piped to a shell, `rm -rf`, `mkfs`,
`dd ... of=`, and `chmod 777`. Preserve every other accepted command as inert
text.

For the root `package.json`, parse only within 256 KiB and derive commands from
script keys, not bodies. Map `start|serve` → run, `dev` → develop,
`test|test:*` → test, and `build` → build. Add the derived package-manager
install command using root lockfile precedence. Invalid or non-record JSON, a
non-record `scripts` value, more than 128 script keys, or a non-string selected
script value produces no manifest command. Read only the top-level `scripts`
keys and never recurse through manifest values. Do not guess a workspace
package from a nested manifest. Do not invent Python, Go, Rust, or other
ecosystem commands merely because a language or manifest exists; those steps
require README evidence or a future explicitly approved manifest adapter.

- [ ] **Step 5: Run extraction, safety, and static gates**

Run:

```bash
pnpm exec vitest run src/features/analyzers/reader-report/markdown.test.ts src/features/analyzers/reader-report/commands.test.ts src/features/analyzers/project-brief.test.ts src/features/analyzers/general.test.ts src/features/analyzers/line-metrics.test.ts
pnpm lint
pnpm format:check
pnpm exec tsc -b
```

Expected: all PASS; existing project-purpose output and general metrics do not
change.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/features/analyzers/reader-report
git commit -m "feat: extract reader-facing repository evidence"
```

---

### Task 3: Assemble the deterministic reader report

**Files:**

- Create: `src/features/analyzers/reader-report.ts`
- Create: `src/features/analyzers/reader-report.test.ts`

**Interfaces:**

- Consumes: Task 1 policy/types, Task 2 extractors, `GeneralAnalysisInput`,
  `GeneralMetrics`, `ProjectBrief`, `CoverageSummary`, and `analyzedAt`.
- Produces:

```ts
export interface ReaderReportInput extends GeneralAnalysisInput {
  general: GeneralMetrics;
  projectBrief: ProjectBrief;
  coverage: CoverageSummary;
  analyzedAt: string;
}

export function analyzeReaderReport(input: ReaderReportInput): ReaderReport;

export function unavailableReaderReport(input: {
  repository: RepositoryMetadata;
  coverage: CoverageSummary;
  analyzedAt: string;
}): ReaderReport;
```

- [ ] **Step 1: Write complete, missing, partial, and stale RED fixtures**

Build inputs from `perfectRepository`, `perfectGeneralMetrics`,
`perfectProjectBrief`, and `perfectCoverage`. Assert:

```ts
function readerFile(
  path: string,
  text: string,
  category: "documentation" | "manifest" = "documentation",
): FetchedTextFile {
  const bytes = new TextEncoder().encode(text).byteLength;

  return {
    path,
    text,
    bytes,
    declaredSize: bytes,
    language: "none",
    category,
    isTest: false,
  };
}

function completeInput(): ReaderReportInput {
  const readme = readerFile(
    "README.md",
    "# Fixture\n\n## Use cases\n\n- Review public project evidence.\n- Compare repository adoption requirements.\n\n## Install\n\n`pnpm install`\n\n## Usage\n\n`pnpm start`\n",
  );
  const manifest = readerFile(
    "package.json",
    JSON.stringify({
      scripts: {
        start: "node dist/index.js",
        dev: "vite",
        test: "vitest",
        build: "tsc",
      },
    }),
    "manifest",
  );

  return {
    repository: {
      ...structuredClone(perfectRepository),
      topics: ["quality", "typescript"],
    },
    tree: {
      complete: true,
      skippedEntries: [],
      files: [
        {
          path: "README.md",
          sha: "a".repeat(40),
          size: readme.bytes,
          mode: "100644",
        },
        {
          path: "package.json",
          sha: "b".repeat(40),
          size: manifest.bytes,
          mode: "100644",
        },
        {
          path: "src/index.ts",
          sha: "c".repeat(40),
          size: 100,
          mode: "100644",
        },
      ],
    },
    files: [readme, manifest],
    general: { ...perfectGeneralMetrics },
    projectBrief: structuredClone(perfectProjectBrief),
    coverage: { ...perfectCoverage },
    analyzedAt: "2026-08-11T12:00:00.000Z",
  };
}

const report = analyzeReaderReport(completeInput());

expect(report.reliability.status).toBe("continue-evaluation");
expect(report.reliability.signals.map(({ signal }) => signal)).toEqual(
  READER_SIGNAL_IDS,
);
expect(report.scenarios.facts).toHaveLength(2);
expect(report.architecture.entryPoints).toEqual(["src/index.ts"]);
expect(report.gettingStarted.commands.map(({ kind }) => kind)).toEqual([
  "install",
  "run",
  "develop",
  "test",
  "build",
]);
expect(report.alternatives.searchTerms).toEqual([
  "application",
  "quality",
  "typescript",
]);
```

Add exact cases for archived, 180/181/365/366 days, no license, no install/run,
tests-or-CI, incomplete tree, limit reached, fetch failure, absent README,
unsupported Go with `go.mod`, malicious topics, duplicate top-level paths,
shuffled tree/files, and frozen input non-mutation. Assert no function,
cyclomatic, rule, score, or raw-source field exists anywhere in serialized
`ReaderReport`. Make `unavailableReaderReport` return
`insufficient-evidence`, decisive `unknown` signals, canonical questions, empty
facts/commands/search terms, and unavailable sections without throwing.

- [ ] **Step 2: Run the reader analyzer suite to verify RED**

Run:

```bash
pnpm exec vitest run src/features/analyzers/reader-report.test.ts
```

Expected: FAIL because `reader-report.ts` is missing.

- [ ] **Step 3: Implement canonical signals and availability**

Use a `coverageComplete` predicate of `coverage.treeComplete === true`,
`coverage.limitReached === false`, and `coverage.failedFiles === 0`. A positive
fact stays `present` even under partial coverage; an
otherwise absent tree/file-derived fact becomes `unknown` when coverage is not
complete. GitHub metadata facts (`archived`, push date, API license) remain
known.

Calculate exact elapsed UTC days with the same raw
`(Date.parse(analyzedAt) - Date.parse(pushedAt)) / 86_400_000` division used by
the scoring rules, and require the result to be finite and nonnegative. Use
`activityState` from Task 1. Build signals
in `READER_SIGNAL_IDS` order and derive status/questions only through the shared
policy. Use this exact mapping:

| Signal               | Present condition                                                   |
| -------------------- | ------------------------------------------------------------------- |
| `archived`           | `repository.archived`                                               |
| `install`            | an install command with `ready` or `review` disposition             |
| `run`                | a run command with `ready` or `review` disposition                  |
| `license`            | `general.hasLicenseFile                                             |     | general.apiLicenseDetected` |
| `recent-activity`    | not archived and elapsed UTC days `<= 180`                          |
| `tests`              | `general.testFileCount > 0` and a test command/configuration exists |
| `ci`                 | `general.hasCi`                                                     |
| `coverage`           | `general.hasCoverageEvidence`                                       |
| `security-policy`    | `general.hasSecurityPolicy`                                         |
| `version-history`    | `general.hasVersionHistory`                                         |
| `contributing`       | `general.hasContributing`                                           |
| `issue-templates`    | `general.hasIssueOrPrTemplates`                                     |
| `dependency-updates` | `general.hasDependencyUpdates`                                      |
| `configuration`      | `general.hasConfigurationEvidence`                                  |

Call `extractReaderMarkdownEvidence` only for the preferred README when
collecting scenarios/commands. Collect architecture/security prose by scanning
that README and fetched documentation whose normalized path is a recognized
architecture, security, or privacy document, in path order. Combine README and
manifest commands in command-kind order with README evidence winning each kind.
Before capping scenarios at three, remove any NFKC-normalized item equal to a
retained `projectBrief` purpose excerpt, then de-duplicate scenarios while
preserving README order.
When README and manifest disagree, keep the README command because it is the
user-facing instruction and retain `reproduce-install-run` in the verification
questions; never merge two commands into executable text.

Derive section availability through the Task 1 shared policy exactly:

```ts
deriveReaderAvailability(itemCount, coverageComplete);
```

For the count, use retained `projectBrief` purpose excerpts plus scenario fact
count; the sum of architecture excerpts, documents, entry points, source areas,
and ecosystems; retained command count; and security declaration count plus
present security signals, respectively. Maintenance always counts its GitHub
activity fact and may add present process signals. Do not count absent/unknown
signals as available evidence.

For reliability, positive metadata/tree facts may still be shown under partial
coverage, but a missing decisive tree/file fact is `unknown`, causing the
overall `insufficient-evidence` status. Reliability availability is `partial`
when coverage is incomplete, `unavailable` for the complete metadata-only case,
and `available` otherwise.

- [ ] **Step 4: Implement architecture, maintenance, and alternatives**

Architecture precedence is documented excerpts, recognized architecture
documents, then deterministic structure. Keep at most three recognized
architecture-document paths, four conventional entry points, and five
top-level source areas in normalized path order. Map recognized
manifest/extensions to the frozen ecosystem vocabulary and never use function
metrics. Structural fallback may name only observed entry points, ecosystems,
and source areas; it must not infer business logic, runtime control flow,
deployment topology, or component ownership from a filename. Use this frozen
ecosystem precedence:

1. `package.json` or JS/TS source → `javascript-typescript`
2. `pyproject.toml` or Python source → `python`
3. `go.mod` or `.go` → `go`
4. `Cargo.toml` or `.rs` → `rust`
5. Maven/Gradle manifest or Java/Kotlin/Scala source → `java-jvm`
6. `.sln`, `.csproj`, or C#/F# source → `dotnet`
7. Gemfile/gemspec or Ruby source → `ruby`
8. `composer.json` or PHP source → `php`
9. `Package.swift` or Swift source → `swift`
10. `pubspec.yaml` or Dart source → `dart`
11. other recognized source → `other`

Keep each ecosystem once in the listed order. Map project kind to the first
alternative term as application → `application`, command-line-tool → `cli`,
library → `library`, plugin → `plugin`, template → `template`, and documentation
→ `documentation`.

Maintenance uses archived/pushed metadata plus general metrics for version
history, contribution guide, templates, CI, dependency updates, tests,
coverage, security policy, and configuration. Store validated
`openIssuesCount` as a count only. Store the exact nonnegative elapsed UTC-day
count and its canonical activity band so the UI never has to reinterpret the
180/181/365/366 boundaries.

Freeze section signal subsets by filtering the canonical reliability array,
never by constructing a second order. Security/privacy uses `license`,
`security-policy`, and `configuration`. Maintenance uses `archived`,
`recent-activity`, `tests`, `ci`, `coverage`, `security-policy`,
`version-history`, `contributing`, `issue-templates`, and
`dependency-updates`. The two metadata signals use `github-metadata` with a
null path; every other derived signal uses `analysis` with a null path.

Alternative terms are at most one mapped kind term followed by three unique
topics matching `/^[a-z0-9][a-z0-9-]{0,49}$/iu`; reject credentials, controls,
and terms already represented by the kind. NFKC-normalize, lowercase, unique,
and code-point-sort topics before taking the first three so GitHub topic order
cannot change the report. Do not store repository names or competitor results.

- [ ] **Step 5: Run analyzer compatibility and performance gates**

Run:

```bash
pnpm exec vitest run src/features/analyzers/reader-report.test.ts src/features/analyzers/reader-report/markdown.test.ts src/features/analyzers/reader-report/commands.test.ts src/features/rules/rules.test.ts src/features/rules/findings.test.ts src/features/rules/confidence.test.ts
pnpm lint
pnpm format:check
pnpm exec tsc -b
```

Expected: all PASS. Include a 100,000-tree-entry plus near-256-KiB README test
under two seconds and verify deterministic output under reversed input.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/features/analyzers/reader-report.ts src/features/analyzers/reader-report.test.ts
git commit -m "feat: derive human-readable repository reports"
```

---

### Task 4: Carry reader evidence through worker, guard, and cache

**Files:**

- Modify: `src/features/analysis/model.ts:451-469`
- Modify: `src/features/analysis/guards.ts:25-254,678-700`
- Modify: `src/features/analysis/guards.test.ts`
- Modify: `src/features/worker/analysis.worker.ts:43-95,440-539`
- Modify: `src/features/worker/analysis.worker.test.ts`
- Modify: `src/features/cache/report-cache.test.ts`
- Modify: `src/features/worker/worker-client.test.ts`
- Modify: `src/test/fixtures/metrics.ts`
- Modify fixture reports in: `src/App.test.tsx`,
  `src/components/copy-button.test.tsx`,
  `src/components/evidence-explorer.test.tsx`,
  `src/components/report-summary.test.tsx`,
  `src/components/report-view.test.tsx`,
  `src/features/analysis/service.test.ts`, and
  `src/features/analysis/use-repository-analysis.test.tsx`

**Interfaces:**

- Consumes: `analyzeReaderReport(input): ReaderReport` from Task 3 and
  `deriveReliabilityStatus`/`deriveReaderQuestions` from Task 1.
- Produces: required `AnalysisReport.readerReport: ReaderReport` and
  `AnalysisDependencies.readerReport: typeof analyzeReaderReport`.

- [ ] **Step 1: Add failing report-boundary tests**

Add `readerReport: structuredClone(perfectReaderReport)` to `validReport`, then
test that the old shape is rejected and the exact new shape is accepted:

```ts
it("requires a canonical reader report", () => {
  const missing = structuredClone(validReport()) as Record<string, unknown>;
  delete missing.readerReport;
  expect(isAnalysisReport(missing)).toBe(false);

  const valid = validReport();
  expect(isAnalysisReport(valid)).toBe(true);

  valid.readerReport.reliability.status = "continue-evaluation";
  valid.readerReport.reliability.signals.find(
    ({ signal }) => signal === "license",
  )!.state = "absent";
  expect(isAnalysisReport(valid)).toBe(false);
});
```

Add mutations for every unknown key, source/path mismatch, duplicate/out-of-
order signal, >4 questions, >3 scenarios, >2 architecture excerpts, >3
architecture documents, >4 entry points, >5 source areas, >5 commands, command
kind order, command/disposition/null inconsistency, >480-code-point prose,

> 160-code-point command, unsafe path, credential, bidi/control, cycle, throwing
> Proxy, invalid open-issue/activity values, and invalid search term.

Add cache tests that reject an old report without `readerReport`, round-trip the
maximum valid reader shape under 2 MiB, and refuse every unsafe reader string.

- [ ] **Step 2: Run guard, worker, client, and cache suites to verify RED**

Run:

```bash
pnpm exec vitest run src/features/analysis/guards.test.ts src/features/worker/analysis.worker.test.ts src/features/worker/worker-client.test.ts src/features/cache/report-cache.test.ts
```

Expected: failures show missing guard acceptance, missing worker dependency,
missing serialized field, and stale cache behavior.

- [ ] **Step 3: Make `readerReport` required and validate it strictly**

Add `readerReport: ReaderReport` to `AnalysisReport`. In `guards.ts`, validate
exact keys and frozen vocabulary, require canonical arrays and caps, reuse
`isSafeProjectBriefPath`, `containsCredentialLikeValue`, directional/control
checks, and require:

```ts
deriveReliabilityStatus(reader.reliability.signals) ===
  reader.reliability.status;

deriveReaderQuestions(
  reader.reliability.status,
  reader.reliability.signals,
).join("\0") === reader.reliability.questions.join("\0");
```

For command facts, enforce `withheld` iff `command === null`; `ready` and
`review` require a safe nonempty command. `readme`, `documentation`, and
`manifest` sources require a path; `github-metadata` and `analysis` require
`null`; tree paths are used only by structural facts.

Pass the validated outer repository metadata, project brief, and coverage into
the nested reader guard.
Recompute `maintenance.activity.elapsedUtcDays` from `pushedAt`/`analyzedAt`
with the same validated raw UTC-day division and require the stored activity
band to equal `activityBand(elapsedUtcDays)`. Require the exact security/privacy
and maintenance signal subsets from Task 3, canonical command-kind order,
canonical ecosystem order, and path-sorted unique architecture arrays.

Recompute `coverageComplete` from the exact coverage counts and require every
stored chapter availability to match `deriveReaderAvailability` for its
canonical evidence count. Reliability availability uses the Task 3 special
case: partial coverage → `partial`, complete metadata-only evidence →
`unavailable`, otherwise `available`. Reject inconsistent availability instead
of trusting serialized presentation state.

- [ ] **Step 4: Integrate the worker without changing scoring inputs**

Add the production dependency and call it only after `coverage` exists:

```ts
let readerReport: ReaderReport;

try {
  readerReport = dependencies.readerReport({
    repository: snapshot.repository,
    tree,
    files: fetched,
    general,
    projectBrief,
    coverage,
    analyzedAt,
  });
} catch {
  readerReport = unavailableReaderReport({
    repository: snapshot.repository,
    coverage,
    analyzedAt,
  });
}

const report: AnalysisReport = {
  rulesetVersion: "1.0.0",
  repository: {
    owner: snapshot.repository.owner,
    repo: snapshot.repository.repo,
    fullName: `${snapshot.repository.owner}/${snapshot.repository.repo}`,
    url: `https://github.com/${encodeURIComponent(snapshot.repository.owner)}/${encodeURIComponent(snapshot.repository.repo)}`,
    description:
      snapshot.repository.description !== null &&
      containsCredentialLikeValue(snapshot.repository.description)
        ? null
        : snapshot.repository.description,
    defaultBranch: snapshot.repository.defaultBranch,
    archived: snapshot.repository.archived,
    pushedAt: snapshot.repository.pushedAt,
    commitSha: snapshot.commitSha,
    analyzedAt,
  },
  projectBrief,
  readerReport,
  overall: scored.overall,
  confidence: scored.confidence,
  dimensions: scored.dimensions,
  strengths: findingSummary.strengths,
  weaknesses: findingSummary.weaknesses,
  coverage,
};
```

The `try/catch` wraps only the reader analyzer call. On a reader-only failure,
continue scoring/report completion with the fallback shown above. Do not catch
scoring, guard, or worker protocol failures with this fallback. Add a worker
test where `dependencies.readerReport` throws and the completion retains
unchanged score output plus an `insufficient-evidence` reader report.

Assert the exact dependency input, one call, serialized output, and that
`dependencies.score` receives the same object shape as before. Keep reader
analysis synchronous and parser-independent.

- [ ] **Step 5: Update every canonical report fixture**

Import and clone `perfectReaderReport` in every listed test report. Do not share
a mutable fixture instance. Update cache stale-shape wording from “project
brief” to “reader report” while retaining the existing missing-project-brief
test as a separate schema rejection.

- [ ] **Step 6: Run boundary and full TypeScript gates**

Run:

```bash
pnpm exec vitest run src/features/analysis/guards.test.ts src/features/worker/analysis.worker.test.ts src/features/worker/worker-client.test.ts src/features/cache/report-cache.test.ts src/features/analysis/service.test.ts src/features/analysis/use-repository-analysis.test.tsx src/App.test.tsx
pnpm exec tsc -b
pnpm lint
pnpm format:check
```

Expected: all PASS, with the old schema rejected and all scoring assertions
unchanged.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/features/analysis src/features/worker src/features/cache src/test/fixtures/metrics.ts src/App.test.tsx src/components/copy-button.test.tsx src/components/evidence-explorer.test.tsx src/components/report-summary.test.tsx src/components/report-view.test.tsx
git commit -m "feat: carry reader evidence through reports"
```

---

### Task 5: Render the decision summary and six human chapters

**Files:**

- Create: `src/components/reader-report-source.tsx`
- Create: `src/components/reader-report.tsx`
- Create: `src/components/reader-report.test.tsx`
- Modify: `src/i18n/messages.ts:9-180,253-430`
- Modify: `src/i18n/messages.test.ts`
- Modify temporarily: `src/components/project-brief.tsx`

**Interfaces:**

- Consumes: `AnalysisReport.projectBrief`, `AnalysisReport.readerReport`, owner,
  repository, commit SHA, and current UI language.
- Produces:

```ts
interface ReaderReportViewProps {
  report: AnalysisReport;
  language: Language;
}

export function ReaderReportView(props: ReaderReportViewProps): ReactElement;

export function ReaderReportSource(props: {
  evidence: ReaderEvidenceSource | Pick<ProjectBriefExcerpt, "source" | "path">;
  linkKind?: "blob" | "tree";
  owner: string;
  repo: string;
  commitSha: string;
  language: Language;
}): ReactElement;
```

- [ ] **Step 1: Write the semantic and bilingual RED component suite**

Assert one decision-summary region followed by six named chapter regions in
this exact order:

```ts
expect(
  screen
    .getAllByRole("region")
    .map((region) => region.getAttribute("data-reader-section")),
).toEqual([
  "decision-summary",
  "purpose-scenarios",
  "reliability",
  "architecture",
  "getting-started",
  "security-privacy",
  "maintenance-alternatives",
]);
```

Test all three statuses in English and Chinese, available/partial/unavailable
for every chapter, source-language prose, empty scenarios, no architecture doc,
withheld/review commands, all five questions, open-issue count, no automatic
competitor name, and exact alternative-search URL.

Assert the decision summary contains exactly the safe purpose evidence from
`projectBrief`, up to three scenario facts, the reliability status with its
decisive reasons, two to four canonical questions, and the first retained
install and run commands when present. It must contain no score, dimension,
rule ID, function metric, or inferred suitability claim.

Use hostile strings such as `<img src=x onerror=alert(1)>` as React text and
assert there is no `img`, `script`, event attribute, remote request-bearing
element, or raw HTML insertion.

- [ ] **Step 2: Run the new component suite to verify RED**

Run:

```bash
pnpm exec vitest run src/components/reader-report.test.tsx
```

Expected: FAIL because `reader-report.tsx` is missing.

- [ ] **Step 3: Add exact bilingual decision copy**

Add these primary messages and direct Chinese equivalents:

| Key                           | English                                                                                                                                                                             | 简体中文                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `readerDecisionHeading`       | Project decision summary                                                                                                                                                            | 项目决策摘要                                                                                 |
| `readerStatusContinue`        | Sufficient evidence to continue evaluation                                                                                                                                          | 有较充分证据，可以继续评估                                                                   |
| `readerStatusVerify`          | Key gaps require verification before use                                                                                                                                            | 存在关键缺口，使用前需要核实                                                                 |
| `readerStatusInsufficient`    | Public evidence is insufficient to judge                                                                                                                                            | 公开证据不足，暂时无法判断                                                                   |
| `readerPurposeHeading`        | Purpose and practical scenarios                                                                                                                                                     | 项目用途与具体业务场景                                                                       |
| `readerReliabilityHeading`    | Evidence of reliability                                                                                                                                                             | 是否靠谱                                                                                     |
| `readerArchitectureHeading`   | Core principles and code architecture                                                                                                                                               | 核心原理与代码架构                                                                           |
| `readerGettingStartedHeading` | Install, run, and develop                                                                                                                                                           | 安装、运行和二次开发                                                                         |
| `readerSecurityHeading`       | Security and privacy risks                                                                                                                                                          | 安全与隐私风险                                                                               |
| `readerMaintenanceHeading`    | Activity, maintenance, and alternatives                                                                                                                                             | 活跃度、维护状况和替代方案                                                                   |
| `readerUnavailable`           | Repository does not provide this evidence.                                                                                                                                          | 仓库未提供这项证据。                                                                         |
| `readerStepUnavailable`       | Repository does not provide this step.                                                                                                                                              | 仓库未提供这一步骤。                                                                         |
| `readerNotEstablished`        | Not established from the scanned public evidence.                                                                                                                                   | 无法从已扫描的公开证据中确认。                                                               |
| `readerCommandReview`         | Repository-provided command — review before running.                                                                                                                                | 仓库提供的命令——运行前请先检查。                                                             |
| `readerCommandWithheld`       | A documented command exists, but RepoScope did not copy it because it did not pass the safe-text boundary.                                                                          | 仓库提供了命令，但该内容未通过安全文本边界，因此 RepoScope 未复制。                          |
| `readerSecurityBoundary`      | RepoScope does not execute the project, scan dependencies for vulnerabilities, observe runtime traffic, verify permissions, detect malicious behavior, or prove privacy compliance. | RepoScope 不会执行项目、扫描依赖漏洞、观察运行时流量、验证权限、检测恶意行为或证明隐私合规。 |
| `technicalAppendixHeading`    | Technical evidence and methodology                                                                                                                                                  | 技术证据与方法                                                                               |

Add exact localized question strings for the five frozen question IDs and fixed
comparison items: purpose, license, onboarding, tests, security process,
maintenance, ecosystem fit, and operational constraints.

Update landing copy to:

- EN tagline: `Understand what a public project does, how to use it, and what to verify.`
- EN hero: `Understand a public project before you depend on it.`
- ZH tagline: `看懂一个公开项目做什么、怎么使用，以及哪些事项必须核实。`
- ZH hero: `在依赖一个公开项目之前，先真正看懂它。`

- [ ] **Step 4: Implement immutable sources and the reader report**

Move the independently encoded GitHub source-link helper from
`project-brief.tsx` to `reader-report-source.tsx`. Continue encoding owner,
repository, and each path segment independently; use `blob` by default and
`tree` for architecture source-area paths. Use `target="_blank"` and
`rel="noopener noreferrer"`. Architecture documents and entry points use blob
links; top-level source areas use tree links. Replace the old component's local
helper with this shared component so Task 5 has one link implementation while
`ReportSummary` still temporarily renders `ProjectBriefView`.

Render repository prose with text nodes and `figure`/`blockquote`/`figcaption`.
Render commands inside `<code>` without a copy or execute button. Build the
alternative link only when search terms exist:

Build the decision summary from existing safe `projectBrief` purpose evidence,
the first three scenario facts, the reliability status plus decisive signal
reasons, the canonical two-to-four questions, and the retained install/run
facts. Do not duplicate these limits in the component; slice only as a
defensive rendering cap after the strict report guard has accepted the shape.
Label repository description, archive/push activity, and open-issue count as
GitHub metadata; label computed statuses, activity bands, and structural
fallbacks as deterministic analysis.

```ts
const query = terms.map((term) => `topic:${term}`).join(" ");
const href = `https://github.com/search?q=${encodeURIComponent(query)}&type=repositories`;
```

Label this as a search entry, not a recommended alternative. Render status text
and reasons; color is supplementary only.

- [ ] **Step 5: Prove ProjectBrief parity before integration**

Port its exact source-link, hostile-text, kind-label, missing-purpose, and
language-switch assertions into `reader-report.test.tsx`. Keep the old
component temporarily because `ReportSummary` still imports it until Task 6;
do not render the new reader report twice.

- [ ] **Step 6: Run UI and message gates**

Run:

```bash
pnpm exec vitest run src/components/reader-report.test.tsx src/i18n/messages.test.ts src/components/report-summary.test.tsx src/components/report-view.test.tsx
pnpm lint
pnpm format:check
pnpm exec tsc -b
```

Expected: new reader component/messages and the still-unchanged report
integration tests all PASS. Task 6 adds the ordering/disclosure RED assertions
only after this commit.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/components/reader-report-source.tsx src/components/reader-report.tsx src/components/reader-report.test.tsx src/components/project-brief.tsx src/i18n/messages.ts src/i18n/messages.test.ts
git commit -m "feat: explain repositories for human readers"
```

---

### Task 6: Move scores and function evidence into a technical appendix

**Files:**

- Create: `src/components/technical-appendix.tsx`
- Create: `src/components/technical-appendix.test.tsx`
- Modify: `src/components/report-summary.tsx`
- Modify: `src/components/report-summary.test.tsx`
- Modify: `src/components/report-view.tsx`
- Modify: `src/components/report-view.test.tsx`
- Modify: `src/styles/app.css:483-1100`
- Delete: `src/components/project-brief.tsx`
- Delete: `src/components/project-brief.test.tsx`

**Interfaces:**

- Consumes: existing `DimensionScores`, `StrengthsAndRisks`, `CoveragePanel`,
  `EvidenceExplorer`, `Methodology`, score/confidence/flags/scope metadata, and
  Task 5 `ReaderReportView`.
- Produces:

```ts
interface TechnicalAppendixProps {
  report: AnalysisReport;
  language: Language;
  onRefresh: () => void;
}

export function TechnicalAppendix(props: TechnicalAppendixProps): ReactElement;
```

- [ ] **Step 1: Write the report-order and disclosure RED tests**

Require the top-level order `summary`, `reader`, `technical-appendix`. Assert
the appendix `details` has no `open` attribute, score/rule/function reference
content is not visible, and the decision summary is visible.

Then use `userEvent.click` on the appendix summary and assert all existing
technical sections, score, confidence, flags, dimensions, strengths,
improvements, coverage, evidence explorer, and methodology become visible.

Assert refresh and copy actions are hidden with the appendix, become visible
after opening it, and every existing technical component renders exactly once.

- [ ] **Step 2: Run report component tests to verify RED**

Run:

```bash
pnpm exec vitest run src/components/report-view.test.tsx src/components/report-summary.test.tsx src/components/technical-appendix.test.tsx
```

Expected: FAIL because the score is still in the summary, technical sections
are top-level, and `technical-appendix.tsx` is missing.

- [ ] **Step 3: Split identity from technical overview**

Keep `ReportSummary` responsible only for repository name/link, commit,
analyzed time, and default branch. Move overall score, confidence, general-only,
preliminary, and numeric coverage scope into a private `TechnicalOverview`
inside `technical-appendix.tsx`.

After `ReportSummary` no longer imports or renders `ProjectBriefView`, delete
the old project-brief component and its now-ported test. The serialized
`projectBrief` remains required because `ReaderReportView` uses it for safe
purpose/kind evidence.

Implement this structure:

```tsx
<article className="report-view" aria-labelledby="report-title">
  <ReportSummary report={report} language={language} />
  <ReaderReportView report={report} language={language} />
  <TechnicalAppendix
    report={report}
    language={language}
    onRefresh={onRefresh}
  />
</article>
```

The appendix is one `<details>` with a 44-pixel `<summary>`, no `open` prop, and
the existing refresh/copy actions followed by all current technical components
inside its content in their current order.

- [ ] **Step 4: Implement the approved single-column dossier CSS**

Use existing tokens only. Add:

- `.reader-report` and `.reader-report__decision` with a 64–72-character prose
  measure and a strong ruled boundary;
- numbered `.reader-chapter` rows rather than standalone cards;
- textual status treatment with border/label plus full status copy;
- inert command blocks with `white-space: pre-wrap` and
  `overflow-wrap: anywhere`;
- source/search links with `min-height: var(--target-min)`;
- `.technical-appendix > summary` with the same target and focus contracts;
- one-column layout at all widths below 64rem and no fixed/sticky sidebar;
- no transition or animation beyond existing reduced-motion-safe behavior.

Delete score-first and obsolete project-brief grid rules only after confirming
no component references their class names.

- [ ] **Step 5: Run component, CSS-contract, build, and bundle gates**

Run:

```bash
pnpm exec vitest run src/components/reader-report.test.tsx src/components/technical-appendix.test.tsx src/components/report-summary.test.tsx src/components/report-view.test.tsx src/components/dimension-scores.test.tsx src/components/strengths-and-risks.test.tsx src/components/coverage-panel.test.tsx src/components/evidence-explorer.test.tsx src/components/methodology.test.tsx
pnpm lint
pnpm format:check
pnpm exec tsc -b
pnpm build
pnpm check:bundle
```

Expected: all PASS. Initial JS/CSS and analyzer chunks stay under existing gzip
budgets, and parser chunks remain worker-only lazy imports.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/components/technical-appendix.tsx src/components/technical-appendix.test.tsx src/components/report-summary.tsx src/components/report-summary.test.tsx src/components/report-view.tsx src/components/report-view.test.tsx src/components/project-brief.tsx src/components/project-brief.test.tsx src/styles/app.css
git commit -m "feat: make repository reports decision first"
```

---

### Task 7: Lock browser behavior and the public contract

**Files:**

- Modify: `e2e/fixtures.ts`
- Modify: `e2e/fixtures/source-files.ts`
- Modify: `e2e/reposcope.spec.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/architecture.md`
- Modify: `docs/methodology.md`
- Modify: `src/repository-files.test.ts`

**Interfaces:**

- Consumes: the completed serialized/UI contract from Tasks 1–6.
- Produces: deterministic desktop/mobile proof and exact bilingual public docs;
  no new runtime interface.

- [ ] **Step 1: Add RED repository-file contract assertions**

Require both READMEs to state that completed reports lead with purpose,
scenarios, reliability evidence, architecture, setup, security/privacy
unknowns, and maintenance/alternative comparison, while technical scoring is a
collapsed appendix. Require methodology to state that the three reader statuses
are non-scoring and do not prove suitability or safety. Require architecture to
name the reader analyzer, worker ordering, strict guard, cache, and UI appendix.
Require an Unreleased changelog item with no scoring/ruleset claim.

Run:

```bash
pnpm exec vitest run src/repository-files.test.ts
```

Expected: FAIL on missing new public-contract wording.

- [ ] **Step 2: Add reader-focused browser fixtures and assertions**

Add a `reader-complete` fixture with README sections for use cases,
architecture, install, development, test, build, security/privacy; package
scripts; `SECURITY.md`; `CHANGELOG.md`; `CONTRIBUTING.md`; CI; dependency update
config; and safe source files. Add an `archived-stale` metadata fixture with a
push older than 365 days.

Construct `READER_COMPLETE_SOURCE_FILES` as the existing eight-file TypeScript
fixture plus exactly six fetched text files: `SECURITY.md`, `CHANGELOG.md`,
`CONTRIBUTING.md`, `.github/workflows/ci.yml`,
`.github/dependabot.yml`, and `.env.example`; override only its README and
package manifest text. Both new fixture kinds use those 14 raw files. Preserve
the existing raw contracts (TypeScript/partial 8, Python 8, Go 2, minimal 1,
hostile 9) and three REST requests for every completed scan. The full matrix
becomes 13 scenarios × 2 projects = 26 browser runs.

Before runtime changes, add exact Playwright assertions that fail because the
new chapters/status/appendix behavior is missing. Cover:

- complete report status and all six chapters;
- exact install/start/develop/test/build commands and immutable sources;
- partial/minimal unavailable wording;
- archived/stale verification status and questions;
- hostile prose/commands as inert text with no unexpected host;
- technical appendix closed initially, then full score/dimensions/rules visible
  after activation;
- opening and closing the appendix does not change the URL, refetch, or
  recompute the report;
- function/rule text hidden before opening;
- Chinese structural copy without refetch;
- alternative GitHub search link exact query and safe `rel`;
- screenshots at desktop and mobile.

Update existing TypeScript/Python/Go score assertions to open the technical
appendix first. Preserve exact score values and lazy analyzer matrix.

- [ ] **Step 3: Run targeted browser tests to verify RED**

Run:

```bash
pnpm exec playwright test --grep "reader report|archived|complete TypeScript|hostile"
```

Expected: the new reader/appendix assertions fail before fixture/docs/UI
expectations are synchronized; request guards and route ledgers remain clean.

- [ ] **Step 4: Update bilingual docs and browser expectations**

Update README capability text in equivalent English/Chinese paragraphs. Add a
methodology subsection with the exact three statuses, 180-day boundary,
decisive signal groups, and statement that the judgement is not a score.
Update architecture's module tree/data flow with the new files and preserve all
existing endpoint, limit, cache, CSP, and threat-boundary text. Add one
Unreleased changelog bullet describing the decision-first report and technical
appendix without claiming a methodology change.

Synchronize deterministic raw request counts and exact visible copy in E2E.
Keep three REST requests for each completed report and fail any unmatched URL.

- [ ] **Step 5: Run public-contract and full browser gates**

Run:

```bash
pnpm exec vitest run src/repository-files.test.ts src/components/reader-report.test.tsx
CI=1 pnpm exec playwright test
pnpm lint
pnpm format:check
pnpm exec tsc -b
pnpm build
pnpm check:bundle
```

Expected: all PASS on desktop 1366×900 and mobile 375×812. Browser monitoring
reports no console/page error, no unmatched external host, no overflow, no
serious/critical Axe violation, all targets at least 44×44, every keyboard stop
with 3-pixel focus, and reduced motion at or below the existing 0.001-second
contract.

- [ ] **Step 6: Commit Task 7**

```bash
git add e2e README.md README.zh-CN.md CHANGELOG.md docs/architecture.md docs/methodology.md src/repository-files.test.ts
git commit -m "test: verify human-readable repository reports"
```

---

### Task 8: Run the complete release-candidate gate and live acceptance

**Files:**

- Verify only; do not modify fixtures, thresholds, CSP, bundle budgets,
  lockfile, or release documents to make a gate pass.

**Interfaces:**

- Consumes: the release candidate from Tasks 1–7.
- Produces: a clean, evidence-backed release candidate; no source artifact.

- [ ] **Step 1: Verify install and protected-path integrity**

Record the lockfile SHA-256, run frozen install, and compare it again:

```bash
shasum -a 256 pnpm-lock.yaml
pnpm install --frozen-lockfile
shasum -a 256 pnpm-lock.yaml
git diff --exit-code aa0ea16 -- pnpm-lock.yaml src/features/rules src/features/scanner src/features/github vite.config.ts
```

Expected: identical lock hashes and zero protected-path diff from the approved
design baseline `aa0ea16`; rules/scanner/GitHub/Vite production files remain
unchanged.

- [ ] **Step 2: Run static, full coverage, build, and bundle gates sequentially**

```bash
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm exec tsc -b
pnpm build
REPOSCOPE_BASE_PATH=/reposcope/ pnpm build
pnpm check:bundle
git diff --check
```

Expected coverage is at or above the frozen global floors: 90% statements, 80%
branches, 90% functions, and 90% lines. All four gzip assets remain within
their existing budgets and the initial bundle contains no raw repository text
or parser marker.

- [ ] **Step 3: Run browser and Lighthouse gates**

```bash
CI=1 pnpm exec playwright test
pnpm check:lighthouse
pnpm check:lighthouse
pnpm check:lighthouse
```

Expected: the full desktop/mobile matrix passes and each Lighthouse run records
1.00 for performance, accessibility, best practices, and SEO under the existing
assertions.

- [ ] **Step 4: Perform live public-repository acceptance**

Use the production build or deployed Pages URL with:

1. `https://github.com/Thworry/reposcope`
2. `https://github.com/Thworry/issueready`
3. `https://github.com/ossf/scorecard`

For all three reports verify purpose appears before any numeric score; the six
chapters are readable; missing evidence uses honest fallback text; no named
competitor is invented; commands are inert; security/privacy limitations are
visible; technical scoring is closed initially and complete after opening; all
evidence links pin the analyzed commit; console/page errors and unexpected
external requests are zero.

- [ ] **Step 5: Confirm a clean handoff**

```bash
git status --short
git log --oneline --decorate -8
```

Expected: clean worktree, one reviewed commit per Task 1–7, no generated
screenshots/Lighthouse artifacts staged, and no push, tag, or release performed.
