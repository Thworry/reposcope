# Repository Project Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, evidence-linked project brief that helps a user quickly understand what any submitted public GitHub repository does and whether it is plausibly relevant to their needs.

**Architecture:** A new pure analyzer extracts bounded purpose prose and structural project-kind evidence from the already validated repository snapshot, preferred README, manifests, topics, and tree. The worker adds that non-scoring evidence to the strict `AnalysisReport`; a focused React component localizes the structure while preserving repository-authored prose and renders commit-pinned sources near the report title.

**Tech Stack:** TypeScript 6, React 19, Vitest, Testing Library, Vite web workers, Playwright, Axe, existing `smol-toml` parser, CSS custom-property design system.

## Global Constraints

- Apply to every supported public GitHub repository URL, never only RepoScope or fixture repositories.
- Keep ruleset version exactly `1.0.0`; do not change scores, dimensions, confidence, findings, coverage, selection, parser loading, request limits, CSP, or threat boundaries.
- Use only the existing GitHub metadata, normalized tree, and fetched eligible text; add no network request, backend, AI service, analytics, dependency, or source execution.
- Preserve repository-authored prose in its source language; localize only labels, kind names, cautions, fallbacks, and connective sentences.
- Treat source as untrusted text. Render text through React, reject controls and malformed UTF-16, ignore Markdown HTML/link destinations/code, and never retain raw source in the report or cache.
- Cap purpose evidence at two excerpts, each at 480 Unicode code points, with no more than 800 combined code points; cap project kinds at three.
- Use the frozen project-kind vocabulary and order: `application`, `command-line-tool`, `library`, `plugin`, `template`, `documentation`.
- Use the frozen caution vocabulary and order: `archived`, `insufficient-explanation`, `license-evidence-absent`, `entry-point-evidence-absent`.
- If purpose evidence is absent, say that public evidence is insufficient; never invent a purpose or an unconditional “right for you” verdict.
- README source links must use the inspected 40-character commit SHA and safely encode every path segment.
- Keep every visible link/control at least 44 × 44 CSS pixels, retain 3 px `:focus-visible`, and prevent horizontal overflow at 375 px and the existing 188 px 200%-zoom equivalent.
- Cached reports without the new exact shape must fail strict validation, be removed, and be recomputed.
- Do not change `pnpm-lock.yaml`; verify it remains byte-identical after frozen install.

---

## File map

- Create `src/features/analyzers/project-brief.ts`: preferred README selection, bounded Markdown prose extraction, structural kind classification, and caution assembly.
- Create `src/features/analyzers/project-brief.test.ts`: extractor, classifier, hostile input, determinism, and non-mutation boundary tests.
- Modify `src/features/analysis/model.ts`: exact public `ProjectBrief` types and required `AnalysisReport.projectBrief` field.
- Modify `src/features/analyzers/general.ts`: reuse the shared preferred-README selector without changing `GeneralMetrics` output.
- Modify `src/features/worker/analysis.worker.ts`: compute the brief in the existing analyzing phase and serialize it into the report.
- Modify `src/features/worker/analysis.worker.test.ts`: worker integration and scoring-input parity.
- Modify `src/features/analysis/guards.ts` and `src/features/analysis/guards.test.ts`: total, exact, bounded `projectBrief` validation.
- Modify `src/test/fixtures/metrics.ts`: one canonical `perfectProjectBrief` fixture.
- Modify report fixtures in `src/App.test.tsx`, `src/components/*.test.tsx`, `src/features/analysis/*.test.*`, `src/features/cache/report-cache.test.ts`, and `src/features/worker/worker-client.test.ts` to include the required exact field.
- Create `src/components/project-brief.tsx` and `src/components/project-brief.test.tsx`: localized semantic presentation and pinned README source links.
- Modify `src/components/report-summary.tsx` and `src/components/report-summary.test.tsx`: render the brief once and remove the duplicate raw-description paragraph.
- Modify `src/i18n/messages.ts`: English and Simplified Chinese structural copy.
- Modify `src/styles/app.css`: editorial brief hierarchy, wrapping, source-link target size, and narrow reflow.
- Modify `e2e/fixtures.ts`, `e2e/fixtures/source-files.ts`, and `e2e/reposcope.spec.ts`: deterministic positive, missing-evidence, hostile, language-switch, immutable-link, accessibility, and responsive browser proof.
- Modify `README.md`, `README.zh-CN.md`, `CHANGELOG.md`, and `src/repository-files.test.ts`: public capability and no-AI/no-recommendation contract.

---

### Task 1: Build the bounded project-brief analyzer

**Files:**

- Create: `src/features/analyzers/project-brief.ts`
- Create: `src/features/analyzers/project-brief.test.ts`
- Modify: `src/features/analysis/model.ts`
- Modify: `src/features/analyzers/general.ts`

**Interfaces:**

- Consumes: `GeneralAnalysisInput`, `GeneralMetrics`, `FetchedTextFile`, repository metadata, normalized tree paths, and already fetched text.
- Produces:

```ts
export const PROJECT_KINDS = Object.freeze([
  "application",
  "command-line-tool",
  "library",
  "plugin",
  "template",
  "documentation",
] as const);

export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_BRIEF_CAUTIONS = Object.freeze([
  "archived",
  "insufficient-explanation",
  "license-evidence-absent",
  "entry-point-evidence-absent",
] as const);

export type ProjectBriefCaution = (typeof PROJECT_BRIEF_CAUTIONS)[number];

export interface ProjectBriefExcerpt {
  source: "github-description" | "readme";
  text: string;
  path: string | null;
}

export interface ProjectKindFact {
  kind: ProjectKind;
  source: "github-metadata" | "manifest" | "tree" | "analysis";
  path: string | null;
}

export interface ProjectBriefCautionFact {
  caution: ProjectBriefCaution;
  source: "github-metadata" | "analysis";
  path: null;
}

export interface ProjectBrief {
  excerpts: ProjectBriefExcerpt[];
  kinds: ProjectKindFact[];
  cautions: ProjectBriefCautionFact[];
}

export function analyzeProjectBrief(
  input: GeneralAnalysisInput,
  general: GeneralMetrics,
): ProjectBrief;
```

- Invariants: `excerpts.length <= 2`, `kinds.length <= 3`, frozen enum
  order, description excerpt has `path: null`, README excerpt has its original
  normalized POSIX path, manifest/tree kind facts carry the exact evidence
  path, metadata/analysis facts use `path: null`, and inputs are never mutated.

- [ ] **Step 1: Add the exact model types and a failing analyzer contract test**

Add the interfaces above to `src/features/analysis/model.ts`. In the new test
file import `perfectRepository` and `perfectGeneralMetrics`, then define these
test-local builders before the cases:

```ts
function fetched(path: string, text: string): FetchedTextFile {
  const bytes = new TextEncoder().encode(text).byteLength;
  return {
    path,
    text,
    bytes,
    declaredSize: bytes,
    language: path.endsWith(".ts") ? "typescript" : "none",
    category: /^readme/iu.test(path) ? "documentation" : "manifest",
    isTest: false,
  };
}

function inputWith(options: {
  description?: string | null;
  topics?: string[];
  files?: FetchedTextFile[];
  archived?: boolean;
  licenseSpdxId?: string | null;
}): GeneralAnalysisInput {
  const files = options.files ?? [];
  return {
    repository: {
      ...perfectRepository,
      description: options.description ?? null,
      topics: options.topics ?? [],
      archived: options.archived ?? false,
      licenseSpdxId: options.licenseSpdxId ?? "MIT",
    },
    tree: {
      complete: true,
      skippedEntries: [],
      files: files.map((file, index) => ({
        path: file.path,
        sha: index.toString(16).padStart(40, "a").slice(-40),
        size: file.declaredSize,
        mode: "100644" as const,
      })),
    },
    files,
  };
}

function briefFor(
  options: Parameters<typeof inputWith>[0],
  metrics: Partial<GeneralMetrics> = {},
): ProjectBrief {
  return analyzeProjectBrief(inputWith(options), {
    ...perfectGeneralMetrics,
    ...metrics,
  });
}
```

Then assert exact output:

```ts
it("combines repository purpose and README overview without repeating them", () => {
  const input = inputWith({
    description: "A local-first CLI for comparing public API schemas.",
    topics: ["cli"],
    files: [
      fetched(
        "README.md",
        [
          "# Schema Lens",
          "",
          "[![build](https://img.example/badge.svg)](https://ci.example)",
          "",
          "## Overview",
          "",
          "Schema Lens compares two OpenAPI documents and reports breaking changes.",
          "",
          "It is intended for release checks and code review.",
        ].join("\n"),
      ),
      fetched("package.json", JSON.stringify({ bin: { lens: "dist/cli.js" } })),
    ],
  });

  expect(analyzeProjectBrief(input, perfectGeneralMetrics)).toEqual({
    excerpts: [
      {
        source: "github-description",
        text: "A local-first CLI for comparing public API schemas.",
        path: null,
      },
      {
        source: "readme",
        text: "Schema Lens compares two OpenAPI documents and reports breaking changes.",
        path: "README.md",
      },
    ],
    kinds: [
      { kind: "command-line-tool", source: "manifest", path: "package.json" },
    ],
    cautions: [],
  });
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
pnpm exec vitest run src/features/analyzers/project-brief.test.ts
```

Expected: FAIL because `project-brief.ts` does not exist or `analyzeProjectBrief` is not exported.

- [ ] **Step 3: Add hostile Markdown, localization-source, classification, and limit tests**

Add table-driven tests covering:

```ts
it.each([
  ["## Overview\n\nA bounded English purpose.", "A bounded English purpose."],
  [
    "## 简介\n\n这是一个用于检查公开项目证据的浏览器工具。",
    "这是一个用于检查公开项目证据的浏览器工具。",
  ],
  [
    "# Title\n\nA useful lead paragraph after the title.",
    "A useful lead paragraph after the title.",
  ],
])("extracts overview prose from %s", (readme, expected) => {
  expect(
    briefFor({ files: [fetched("README.md", readme)] }).excerpts.map(
      (item) => item.text,
    ),
  ).toContain(expected);
});
```

Add exact negative fixtures for YAML front matter, HTML comments/tags, images,
badges, reference definitions, a table of contents, fenced and indented code,
block quotes, command-only lines, raw URLs, and prose only inside link
destinations. Add a near-256-KiB unmatched-bracket input and require bounded
completion. Add duplicates whose NFKC/case/whitespace-normalized text matches
the GitHub description and require one excerpt only.

Add exact kind cases:

```ts
it.each([
  [
    {
      files: [
        fetched(
          "package.json",
          JSON.stringify({
            scripts: { start: "node app.js" },
            browser: "app.js",
          }),
        ),
      ],
    },
    "application",
  ],
  [
    {
      files: [
        fetched(
          "package.json",
          JSON.stringify({ bin: { tool: "dist/cli.js" } }),
        ),
      ],
    },
    "command-line-tool",
  ],
  [
    {
      files: [
        fetched(
          "package.json",
          JSON.stringify({
            exports: "./dist/index.js",
            types: "./dist/index.d.ts",
          }),
        ),
      ],
    },
    "library",
  ],
  [
    {
      files: [
        fetched(".codex-plugin/plugin.json", "{}"),
        fetched("src/index.ts", "export {}"),
      ],
    },
    "plugin",
  ],
  [{ topics: ["repository-template"] }, "template"],
  [
    {
      files: [
        fetched("README.md", "Documentation only"),
        fetched("docs/guide.md", "Guide"),
      ],
    },
    "documentation",
  ],
])("classifies structural evidence", (options, kind) => {
  expect(
    briefFor(options, { supportedSourceFileCount: 0 }).kinds.map(
      (fact) => fact.kind,
    ),
  ).toContain(kind);
});
```

Also assert deterministic capped order for an intentionally multi-kind
fixture, `unknown` as an empty `kinds` array, frozen input non-mutation, shuffled
file equality, and caution order for archived/no-purpose/no-license/no-entry.

- [ ] **Step 4: Implement a single-pass, fail-closed extractor and classifier**

Create `project-brief.ts` with these frozen budgets. Import the frozen
vocabularies from `analysis/model.ts` so the strict main-thread guard never
imports the analyzer or `smol-toml`:

```ts
const MAX_EXCERPTS = 2;
const MAX_EXCERPT_CODE_POINTS = 480;
const MAX_TOTAL_EXCERPT_CODE_POINTS = 800;
const MAX_KINDS = 3;
const MAX_MANIFEST_BYTES = 256 * 1024;

import { PROJECT_BRIEF_CAUTIONS, PROJECT_KINDS } from "../analysis/model";
```

Use an iterative line-state scanner. It must track front matter, fenced code,
indented code, HTML blocks/comments, headings, list/table-of-contents regions,
and paragraph boundaries without recursive parsing or repeated suffix scans.
Convert selected Markdown inline content to visible text in one pass; keep link
labels, discard destinations, images, raw tags, and autolink URLs. Reject a
candidate containing malformed UTF-16, bidi controls, or line controls. Count
Unicode code points with `Array.from(text)` only after a candidate has passed
the byte/line bounds, then truncate without splitting a code point.

Manifest kind detection must fail closed and remain non-scoring:

```ts
// package.json
// application: non-empty start/dev/serve script plus browser or conventional entry evidence
// command-line-tool: non-empty string/object `bin`
// library: non-empty main/module/types or bounded exports leaf

// pyproject.toml
// command-line-tool: non-empty [project.scripts]
// library: non-empty [project].name without application-only evidence
// plugin: non-empty [project.entry-points] target

// tree/topics
// plugin: .codex-plugin/plugin.json, plugin.json, or exact plugin/extension topic
// template: cookiecutter.json, template/ root, or exact template/starter/boilerplate/scaffold topic
// documentation: README present, zero supported source files, and no stronger kind
```

For every kind retain the strongest deterministic source in this priority:
manifest path, exact tree path, GitHub metadata, then aggregate analysis.
Build caution facts from `input.repository.archived`, both license facts, both
entry-point facts, and excerpt presence; mark archived as GitHub metadata and
the other caution facts as aggregate analysis. Filter both enum arrays through
their frozen order rather than insertion order.

- [ ] **Step 5: Move preferred README selection without semantic drift**

Export the existing selector from `general.ts` without changing its body, then
import it from `project-brief.ts`:

```ts
import { preferredReadme } from "./general";
```

Keep the existing root-before-`.github` and case-insensitive path ordering
exactly. Add a test with shuffled `README.md`, `.github/README.md`, and
`README.zh-CN.md` inputs so both general analysis and project-brief extraction
select the same root file.

- [ ] **Step 6: Run focused GREEN and static checks**

Run:

```bash
pnpm exec vitest run \
  src/features/analyzers/project-brief.test.ts \
  src/features/analyzers/general.test.ts \
  src/features/analyzers/line-metrics.test.ts
pnpm lint
pnpm format:check
pnpm exec tsc -b
```

Expected: all tests and static checks PASS; existing `GeneralMetrics` snapshots
remain unchanged.

- [ ] **Step 7: Commit the pure analyzer**

```bash
git add \
  src/features/analysis/model.ts \
  src/features/analyzers/general.ts \
  src/features/analyzers/project-brief.ts \
  src/features/analyzers/project-brief.test.ts
git diff --cached --check
git commit -m "feat: derive bounded repository project briefs"
```

---

### Task 2: Integrate the brief into the strict report boundary

**Files:**

- Modify: `src/features/analysis/model.ts`
- Modify: `src/features/worker/analysis.worker.ts`
- Modify: `src/features/worker/analysis.worker.test.ts`
- Modify: `src/features/analysis/guards.ts`
- Modify: `src/features/analysis/guards.test.ts`
- Modify: `src/test/fixtures/metrics.ts`
- Modify: `src/features/cache/report-cache.test.ts`
- Modify: `src/features/worker/worker-client.test.ts`
- Modify: `src/features/analysis/service.test.ts`
- Modify: `src/features/analysis/use-repository-analysis.test.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/copy-button.test.tsx`
- Modify: `src/components/evidence-explorer.test.tsx`
- Modify: `src/components/report-summary.test.tsx`
- Modify: `src/components/report-view.test.tsx`

**Interfaces:**

- Consumes: `analyzeProjectBrief(input, general)` from Task 1.
- Produces: required `AnalysisReport.projectBrief: ProjectBrief` and total
  `isAnalysisReport` validation of its exact nested shape.

- [ ] **Step 1: Make the report field required and add one canonical fixture**

Add to `AnalysisReport` immediately after `repository`:

```ts
projectBrief: ProjectBrief;
```

Add to `src/test/fixtures/metrics.ts`:

```ts
export const perfectProjectBrief: ProjectBrief = {
  excerpts: [
    {
      source: "github-description",
      text: "A deterministic fixture repository.",
      path: null,
    },
    {
      source: "readme",
      text: "This fixture demonstrates deterministic repository analysis.",
      path: "README.md",
    },
  ],
  kinds: [
    { kind: "application", source: "manifest", path: "package.json" },
    { kind: "library", source: "manifest", path: "package.json" },
  ],
  cautions: [],
};
```

Use this fixture in every complete `AnalysisReport` test value listed in the
file map. Do not make the field optional to preserve old fixtures.

- [ ] **Step 2: Write RED guard tests for exact shape and hostile values**

Extend `guards.test.ts` with mutations for missing `projectBrief`, unknown top
level/nested keys, wrong source/path combinations, duplicate/out-of-order kinds
or cautions, more than two excerpts, more than three kinds, a 481-code-point
excerpt, more than 800 combined code points, invalid path, bidi control,
malformed surrogate, cyclic arrays, and a throwing proxy.

Use exact valid-source cases:

```ts
expect(
  isAnalysisReport({
    ...validReport(),
    projectBrief: {
      excerpts: [
        { source: "github-description", text: "Purpose", path: null },
        { source: "readme", text: "More detail", path: "README.md" },
      ],
      kinds: [
        { kind: "application", source: "manifest", path: "package.json" },
        { kind: "library", source: "manifest", path: "package.json" },
      ],
      cautions: [
        { caution: "license-evidence-absent", source: "analysis", path: null },
      ],
    },
  }),
).toBe(true);
```

- [ ] **Step 3: Run the guard and worker tests to verify RED**

Run:

```bash
pnpm exec vitest run \
  src/features/analysis/guards.test.ts \
  src/features/worker/analysis.worker.test.ts \
  src/features/cache/report-cache.test.ts
```

Expected: FAIL because the guard does not accept/validate the new required
field and the worker does not emit it.

- [ ] **Step 4: Implement exact total validation**

Add `validProjectBrief` before `validateAnalysisReport` and include
`projectBrief` in the top-level `exactKeys` list:

```ts
function validProjectBrief(value: unknown): value is ProjectBrief {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["excerpts", "kinds", "cautions"])
  ) {
    return false;
  }
  // Validate arrays, caps, every fact source/path pairing, safe strings,
  // enum order, uniqueness, valid evidence paths, and combined text budget.
  return true;
}
```

Manifest/tree sources require a valid path; metadata/analysis sources require
`path: null`. Use `PROJECT_KINDS` and `PROJECT_BRIEF_CAUTIONS` from `model.ts`;
never import the analyzer into the main-thread guard and do not sort hostile
input in place. Keep the existing
outer `try/catch` so cycles and throwing proxies return `false` rather than
throwing.

- [ ] **Step 5: Integrate the analyzer into the worker without touching score inputs**

Add the dependency type and production implementation:

```ts
type ProjectBriefAnalyzer = typeof analyzeProjectBrief;

export interface AnalysisDependencies {
  // existing dependencies
  projectBrief: ProjectBriefAnalyzer;
}

const productionDependencies: AnalysisDependencies = {
  // existing dependencies
  projectBrief: analyzeProjectBrief,
};
```

After `general` is computed and before scoring, compute:

```ts
const projectBrief = dependencies.projectBrief(
  { repository: snapshot.repository, tree, files: fetched },
  general,
);
```

Add `projectBrief` to the final report. Do not pass it to `score`, `findings`,
duplicate analysis, cycle analysis, or confidence calculation. In the worker
test, capture the argument to `score` before and after setting different brief
outputs and assert the score argument is identical and contains no
`projectBrief` key.

- [ ] **Step 6: Prove cache/schema migration behavior**

In `report-cache.test.ts`, round-trip the new report, then store a serialized
copy with `projectBrief` deleted:

```ts
const stale = structuredClone(validReport()) as Record<string, unknown>;
delete stale.projectBrief;
sessionStorage.setItem(
  cacheKey(ref),
  JSON.stringify({ savedAt: now, report: stale }),
);
expect(getCachedReport(ref, now)).toBeNull();
expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
```

Also assert the maximum valid brief stays below the existing 2 MiB cache cap;
do not increase that cap or change the cache key.

- [ ] **Step 7: Run boundary GREEN and the report-consumer suite**

Run:

```bash
pnpm exec vitest run \
  src/features/analysis/guards.test.ts \
  src/features/analysis/service.test.ts \
  src/features/analysis/use-repository-analysis.test.tsx \
  src/features/cache/report-cache.test.ts \
  src/features/worker/analysis.worker.test.ts \
  src/features/worker/worker-client.test.ts \
  src/App.test.tsx \
  src/components/copy-button.test.tsx \
  src/components/evidence-explorer.test.tsx \
  src/components/report-summary.test.tsx \
  src/components/report-view.test.tsx
pnpm lint
pnpm format:check
pnpm exec tsc -b
```

Expected: all tests and static checks PASS.

- [ ] **Step 8: Commit the report boundary**

```bash
git add src/features src/components src/App.test.tsx src/test/fixtures/metrics.ts
git diff --cached --check
git commit -m "feat: carry project briefs through analysis reports"
```

---

### Task 3: Render the localized project brief in the report header

**Files:**

- Create: `src/components/project-brief.tsx`
- Create: `src/components/project-brief.test.tsx`
- Modify: `src/components/report-summary.tsx`
- Modify: `src/components/report-summary.test.tsx`
- Modify: `src/components/report-view.test.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/styles/app.css`

**Interfaces:**

- Consumes: `ProjectBrief`, repository owner/repo/SHA, and `Language`.
- Produces:

```ts
import type { ReactElement } from "react";

interface ProjectBriefProps {
  brief: ProjectBrief;
  owner: string;
  repo: string;
  commitSha: string;
  language: Language;
}

export function ProjectBriefView(props: ProjectBriefProps): ReactElement;
```

- [ ] **Step 1: Write RED semantic and hostile-text component tests**

Assert the component has one region named `Project brief`, headings `What it
does`, `Likely fit`, `What it is`, and `Before you use it`, and renders
repository prose only as text:

```tsx
render(
  <ProjectBriefView
    brief={{
      excerpts: [
        {
          source: "github-description",
          text: '<img src=x onerror="alert(1)">',
          path: null,
        },
        {
          source: "readme",
          text: "Compares public API schemas.",
          path: "docs/README.md",
        },
      ],
      kinds: [
        { kind: "command-line-tool", source: "manifest", path: "package.json" },
      ],
      cautions: [
        { caution: "license-evidence-absent", source: "analysis", path: null },
      ],
    }}
    owner="owner"
    repo="repo"
    commitSha={"a".repeat(40)}
    language="en"
  />,
);

expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeVisible();
expect(document.querySelector("img")).toBeNull();
expect(screen.getByText("Command-line tool")).toBeVisible();
expect(
  screen.getByRole("link", { name: /README\.md at inspected commit/i }),
).toHaveAttribute(
  "href",
  `https://github.com/owner/repo/blob/${"a".repeat(40)}/docs/README.md`,
);
expect(
  screen.getByRole("link", { name: /package\.json at inspected commit/i }),
).toHaveAttribute(
  "href",
  `https://github.com/owner/repo/blob/${"a".repeat(40)}/package.json`,
);
```

Add Chinese-label tests while requiring the English/Chinese repository prose
to remain byte-for-byte unchanged across language rerender. Add fallback tests
for no excerpts/no kinds and each caution message.

- [ ] **Step 2: Run the component test to verify RED**

Run:

```bash
pnpm exec vitest run src/components/project-brief.test.tsx
```

Expected: FAIL because `project-brief.tsx` does not exist.

- [ ] **Step 3: Add exact bilingual copy**

Add these message roles to both dictionaries, using natural equivalents rather
than translating repository prose:

```ts
projectBriefRegion: "Project brief",
projectBriefWhat: "What it does",
projectBriefFit: "Likely fit",
projectBriefKind: "What it is",
projectBriefCautions: "Before you use it",
projectBriefInsufficient: "Public repository evidence is insufficient to explain this project reliably.",
projectBriefFitKnown: "Worth considering if you need a {kinds} for the stated purpose above.",
projectBriefFitUnknown: "Compare the stated purpose with your needs; the repository type could not be established reliably.",
projectBriefSourceDescription: "GitHub repository description",
projectBriefSourceReadme: "{path} at inspected commit",
projectBriefSourceManifest: "{path} at inspected commit",
projectBriefSourceTree: "{path} at inspected commit",
projectBriefSourceMetadata: "GitHub repository metadata",
projectBriefSourceAnalysis: "Repository inspection evidence",
projectKindApplication: "Application",
projectKindCommandLineTool: "Command-line tool",
projectKindLibrary: "Library",
projectKindPlugin: "Plugin",
projectKindTemplate: "Template or starter",
projectKindDocumentation: "Documentation project",
projectCautionArchived: "This repository is archived.",
projectCautionInsufficientExplanation: "The public description and README do not explain the project clearly enough.",
projectCautionLicenseEvidenceAbsent: "No recognized license evidence was detected.",
projectCautionEntryPointEvidenceAbsent: "No structured or conventional entry point was detected.",
```

The Simplified Chinese dictionary must provide equivalent labels and cautious
wording, while `{kinds}` and `{path}` remain format placeholders.

- [ ] **Step 4: Implement semantic rendering and safe pinned links**

Use `<section aria-labelledby>`, `<h3>`, `<blockquote>`, `<figcaption>`, and
plain lists. Encode every owner/repo/path segment independently:

```ts
function readmeHref(
  owner: string,
  repo: string,
  sha: string,
  path: string,
): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${sha}/${encodedPath}`;
}
```

Use `Intl.ListFormat(language, { style: "long", type: "conjunction" })` for
multiple localized `fact.kind` names. Fit copy must remain conditional. Render
the strongest source alongside every kind and caution: manifest/tree paths are
commit-pinned links, while metadata/analysis are localized text labels. Render
the fallback when `excerpts` is empty and do not create a README link when no
README evidence exists.

- [ ] **Step 5: Integrate once into `ReportSummary`**

Remove the direct `report.repository.description` paragraph because that text
is now represented, de-duplicated, and sourced by `projectBrief.excerpts`.
Render after the repository identity/link and before flags/metadata:

```tsx
<ProjectBriefView
  brief={report.projectBrief}
  owner={report.repository.owner}
  repo={report.repository.repo}
  commitSha={report.repository.commitSha}
  language={language}
/>
```

Keep the score block, report title, GitHub repository link, refresh action,
copy action, and seven existing `data-report-section` values unchanged.

- [ ] **Step 6: Extend the editorial CSS without a new card grid**

Add focused classes such as:

```css
.project-brief {
  min-width: 0;
  margin-top: var(--space-6);
  padding-block: var(--space-5);
  border-block: 1px solid var(--color-rule-strong);
}

.project-brief__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-5);
}

.project-brief blockquote,
.project-brief p,
.project-brief li,
.project-brief a {
  overflow-wrap: anywhere;
}

.project-brief__source {
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min);
}

@media (min-width: 64rem) {
  .project-brief__grid {
    grid-template-columns: minmax(0, 1.4fr) minmax(16rem, 0.6fr);
  }
}
```

Do not add gradients, glass effects, remote assets, animation, new colors, or
inline styles. Keep source prose at the existing readable line length.

- [ ] **Step 7: Run UI GREEN and accessibility-oriented static contracts**

Run:

```bash
pnpm exec vitest run \
  src/components/project-brief.test.tsx \
  src/components/report-summary.test.tsx \
  src/components/report-view.test.tsx \
  src/App.test.tsx
pnpm lint
pnpm format:check
pnpm exec tsc -b
```

Expected: tests PASS; exactly one H2 remains for the repository title; the new
brief uses H3/H4 or equivalent hierarchy; no raw HTML element is created.

- [ ] **Step 8: Commit the report UI**

```bash
git add \
  src/components/project-brief.tsx \
  src/components/project-brief.test.tsx \
  src/components/report-summary.tsx \
  src/components/report-summary.test.tsx \
  src/components/report-view.test.tsx \
  src/i18n/messages.ts \
  src/styles/app.css
git diff --cached --check
git commit -m "feat: explain repository purpose in reports"
```

---

### Task 4: Prove the brief across browser fixtures and document the capability

**Files:**

- Modify: `e2e/fixtures.ts`
- Modify: `e2e/fixtures/source-files.ts`
- Modify: `e2e/reposcope.spec.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `CHANGELOG.md`
- Modify: `src/repository-files.test.ts`

**Interfaces:**

- Consumes: completed report UI from Task 3.
- Produces: deterministic browser proof for positive, unsupported-language,
  hostile, missing-evidence, language-switch, pinned-source, accessibility,
  touch-target, and responsive states.

- [ ] **Step 1: Write RED public-contract and E2E assertions**

Update the repository contract to require equivalent English/Chinese public
claims that RepoScope explains what an entered repository appears to do from
public description/README evidence, preserves source language, and does not use
AI or claim personal suitability.

In the TypeScript E2E scenario, add:

```ts
await expect(page.getByRole("region", { name: "Project brief" })).toContainText(
  "A deterministic fixture repository for RepoScope.",
);
await expect(page.getByRole("heading", { name: "What it does" })).toBeVisible();
await expect(page.getByText("Application", { exact: true })).toBeVisible();
await expect(
  page.getByRole("link", { name: /README\.md at inspected commit/ }),
).toHaveAttribute(
  "href",
  `https://github.com/owner/repo/blob/${COMMIT_SHA}/README.md`,
);
```

Add a `minimal` fixture with `description: null`, no README, and one manifest;
assert the exact insufficient-evidence fallback, no README source link, no
console error, and a completed general report. In the hostile fixture, place
HTML/images/link destinations in both description and README and assert only
visible safe text appears and no external request is made.

- [ ] **Step 2: Run the focused contracts to verify RED**

Run:

```bash
pnpm exec vitest run src/repository-files.test.ts
pnpm exec playwright test --grep "TypeScript|hostile|minimal evidence"
```

Expected: assertions fail until fixtures, docs, and UI evidence are aligned.

- [ ] **Step 3: Make fixture purpose evidence explicit and deterministic**

Change the shared fixture README lead to:

```md
# Repo fixture

## Overview

This small application demonstrates deterministic, browser-side inspection of a public repository.
```

Keep the existing Install, Usage, and Testing sections so scoring fixtures do
not change unintentionally. Give Python a CLI-oriented overview and keep Go as
the recognized-unsupported/general-only fixture. Add `minimal` to
`FixtureKind`, returning no README and a null description. Do not change the
three REST requests, raw fetch caps, analyzer chunk assertions, or unmatched
request failure behavior.

- [ ] **Step 4: Close the complete browser matrix**

For English and Chinese UI states assert:

- structure labels localize while fixture prose remains exactly unchanged;
- switching language preserves commit, score, purpose prose, and report state
  without showing scan progress;
- TypeScript loads JS/TS only, Python loads Python only, Go/minimal load no deep
  analyzer, and hostile follows the existing expected analyzer path;
- every README source link is pinned to `COMMIT_SHA` with no branch URL;
- Axe has zero serious/critical findings on the completed brief;
- all visible links/buttons/inputs/selects/summaries remain at least 44 × 44;
- horizontal overflow is zero at 375, 900, 1366, and 188 px;
- reduced-motion timing remains at the existing bound;
- route ledgers finish with exactly three REST calls and the fixture-specific
  raw count, and no unexpected external host is contacted.

- [ ] **Step 5: Update bilingual docs and changelog**

Add equivalent README bullets explaining the project brief and its limits. Add
under `[Unreleased]`:

```md
### Added

- Added a deterministic, evidence-linked project brief so users can quickly understand the stated purpose and likely kind of any inspected public repository.
```

State explicitly that this is not personalized advice and does not use an AI
service. Update `repository-files.test.ts` to lock the English/Chinese claims,
the changelog entry, ruleset `1.0.0`, and unchanged privacy boundary.

- [ ] **Step 6: Run Task 4 GREEN**

Run:

```bash
pnpm exec vitest run src/repository-files.test.ts
pnpm exec playwright test
pnpm lint
pnpm format:check
pnpm exec tsc -b
pnpm build
pnpm check:bundle
```

Expected: public contract PASS, complete desktop/mobile Playwright matrix PASS,
and bundle/CSP/lazy-parser gates PASS.

- [ ] **Step 7: Commit browser proof and public docs**

```bash
git add e2e README.md README.zh-CN.md CHANGELOG.md src/repository-files.test.ts
git diff --cached --check
git commit -m "test: verify repository project briefs"
```

---

### Task 5: Run the release-candidate gate and hand off deployment

**Files:**

- Verify only; no source modification is expected.

**Interfaces:**

- Consumes: the four reviewed commits from Tasks 1–4.
- Produces: reproducible release-candidate evidence and a clean commit ready for
  the repository's normal `main` CI/Pages workflow.

- [ ] **Step 1: Record immutable workspace state**

Run:

```bash
git status --short
git rev-parse HEAD
shasum -a 256 pnpm-lock.yaml
```

Expected: clean status; save the HEAD and lock hash in the handoff notes.

- [ ] **Step 2: Run frozen install and prove lockfile stability**

Run:

```bash
pnpm install --frozen-lockfile
shasum -a 256 pnpm-lock.yaml
git status --short
```

Expected: the lock hash is identical and status remains clean.

- [ ] **Step 3: Run full deterministic quality gates sequentially**

Run:

```bash
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm exec tsc -b
pnpm build
pnpm check:bundle
```

Expected: all tests pass; coverage remains at or above statements 90%, lines
90%, functions 90%, and branches 80%; initial JS, CSS, JS/TS analyzer, and
Python analyzer remain below their frozen gzip budgets.

- [ ] **Step 4: Run real browser and Lighthouse gates**

Run:

```bash
pnpm exec playwright test
pnpm lhci autorun
pnpm lhci autorun
pnpm lhci autorun
```

Expected: the full desktop/mobile matrix passes; all three Lighthouse runs meet
the repository's performance, accessibility, best-practices, and SEO
assertions. Do not lower thresholds or rewrite fixtures to mask a failure.

- [ ] **Step 5: Verify output graph and absence of source leakage**

Inspect the production manifest and built assets:

```bash
rg -n "js-ts-|python-|analysis.worker" dist/.vite/manifest.json dist/assets
rg -n "sourceText|raw source|<script|@babel/parser|@lezer/python" dist/assets/index-*.js
```

Expected: worker dynamically references separate JS/TS and Python chunks;
initial JS contains no parser payload or raw repository source field. A literal
`<script` match from escaped test copy must be investigated rather than assumed
safe.

- [ ] **Step 6: Perform final diff and compatibility review**

Run:

```bash
git diff --check
git status --short
git log --oneline -5
```

Review that scoring fixtures, ruleset, weights, thresholds, coverage formula,
network origins, CSP, worker limits, cache cap, and lockfile did not change.
Expected: clean status and no compatibility drift beyond the required strict
report field.

- [ ] **Step 7: Hand off deployment evidence**

Report:

- final HEAD and lock hash;
- focused/full test totals and coverage percentages;
- Playwright and Lighthouse results;
- production gzip sizes and lazy-chunk graph;
- exact public repository used for post-deploy live acceptance;
- confirmation that no tag or release was created without separate user
  authorization.

After the normal `main` CI and Pages deploy succeed, live acceptance must scan
at least one repository other than RepoScope and verify purpose prose, kind,
conditional fit, cautions, immutable README link, zero fetch failures, zero
console errors, and zero horizontal overflow.
