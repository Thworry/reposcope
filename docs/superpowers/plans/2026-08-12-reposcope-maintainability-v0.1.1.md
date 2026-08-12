# RepoScope v0.1.1 Maintainability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split RepoScope's largest analyzer implementations into cohesive internal modules, improve genuine public documentation, and publish behavior-compatible `v0.1.1`.

**Architecture:** Keep `python.ts` and `cross-file.ts` as stable facades while extracting syntax, metrics, binding flow, duplicate matching, import resolution, and SCC responsibilities into private sibling directories. Freeze exact outputs before extraction, retain ruleset `1.0.0`, and treat documentation-derived self-score changes separately from analyzer compatibility.

**Tech Stack:** TypeScript 6.0, React 19, Vite 8, Vitest 4, Lezer Python, Babel parser, Web Workers, Playwright 1.62, GitHub Actions, GitHub Pages.

## Global Constraints

- Ruleset remains exactly `1.0.0`; do not change rule IDs, weights, thresholds, points, applicability, precedence, or finding severity.
- `analyzePython`, `computeDuplicateRatio`, and `findCircularImports` retain their signatures, runtime export names, deterministic ordering, and exact outputs for identical input.
- Do not change `AnalysisReport`, worker protocol, cache payloads, bilingual message keys, share URLs, evidence-link format, or error kinds.
- Do not add dependencies, network origins, endpoints, authentication, tokens, backends, analytics, AI, persistence, or repository-code execution.
- Preserve 200 selected files, 200 raw attempts, 10 MiB decoded text, 256 KiB per file, six raw requests, 15-second per-file timeout, 90-second fetch phase, 15-minute cache TTL, and 2 MiB cache entry cap.
- Preserve production CSP exactly and keep Babel/Lezer absent from the initial application chunk.
- Coverage floors remain statements `90`, lines `90`, functions `90`, branches `80`; bundle and Lighthouse thresholds may not be reduced.
- English and Chinese repository documentation must remain paragraph-level equivalents.
- All commits are new, intentional commits on `codex/reposcope-maintainability-v011`; never amend or rewrite published history.
- Every extraction first records a focused failure caused by the missing internal boundary, then reaches focused green, full task gates, and independent specification plus quality review.

---

## File Structure

### Python analyzer

- `src/features/analyzers/python.ts` — public facade and ordered repository-level aggregation only.
- `src/features/analyzers/python/model.ts` — private AST, lexical-owner, metric-entry, line-lookup, binding metadata, and flow-completion types.
- `src/features/analyzers/python/syntax.ts` — Lezer parsing, iterative cursor flattening, source slicing, line lookup, and logical-line ranges.
- `src/features/analyzers/python/function-metrics.ts` — function complexity, nesting, location, logical-line, and error-handling metrics.
- `src/features/analyzers/python/bindings.ts` — binding targets, parameters, imports, lexical owners, scope declarations, and ambiguous-name accounting.
- `src/features/analyzers/python/binding-flow.ts` — bounded top-level definite-binding interpreter and abrupt completion propagation.
- `src/features/analyzers/python/evidence.ts` — docstrings, public declarations, relative imports, defined names, and normalized tokens.
- `src/features/analyzers/python/analyze-file.ts` — `.py`/`.pyi` per-file orchestration.
- `src/features/analyzers/python/*.test.ts` — focused internal-boundary tests; existing `python.test.ts` stays the public compatibility suite.

### Cross-file analyzer

- `src/features/analyzers/cross-file.ts` — public facade exposing only instrumentation plus two analysis functions.
- `src/features/analyzers/cross-file/model.ts` — private duplicate, radix, candidate-source, and graph types.
- `src/features/analyzers/cross-file/path-order.ts` — deterministic case-insensitive POSIX ordering.
- `src/features/analyzers/cross-file/duplicate-index.ts` — hashes, exact-window verification/grouping, identical files, and minimal periods.
- `src/features/analyzers/cross-file/duplicate-candidates.ts` — periodic, radix/LCP, lazy candidate sources and candidate heap.
- `src/features/analyzers/cross-file/duplicate-selection.ts` — frozen comparator, occupancy, greedy non-overlap selection, and evidence summary.
- `src/features/analyzers/cross-file/import-resolution.ts` — JS/TS and Python relative import resolution plus deterministic graph construction.
- `src/features/analyzers/cross-file/scc.ts` — Tarjan components with current visit and output ordering.
- `src/features/analyzers/cross-file/*.test.ts` — internal-boundary tests; existing `cross-file.test.ts` remains the black-box/performance suite.

### Documentation and contract

- `README.md`, `README.zh-CN.md` — hosted usage, contributor installation, concrete walkthrough, and version-history link.
- `CHANGELOG.md` — exact `Unreleased`, `0.1.1`, and `0.1.0` entries.
- `docs/architecture.md` — new analyzer module map and dependency direction.
- `src/repository-files.test.ts` — changelog, bilingual, module-tree, and unchanged public-contract assertions.
- `src/features/analysis/model.ts`, repository/GitHub/scanner/analyzer/rules/worker/cache entry files — useful TSDoc on stable cross-module contracts without new exports.
- `package.json` — version `0.1.1`; dependency graph and `pnpm-lock.yaml` remain unchanged.

---

### Task 1: Freeze compatibility and extract Python syntax/function metrics

**Files:**

- Create: `src/features/analyzers/python/model.ts`
- Create: `src/features/analyzers/python/syntax.ts`
- Create: `src/features/analyzers/python/syntax.test.ts`
- Create: `src/features/analyzers/python/function-metrics.ts`
- Create: `src/features/analyzers/python/function-metrics.test.ts`
- Modify: `src/features/analyzers/python.ts`
- Modify: `src/features/analyzers/python.test.ts`

**Interfaces:**

- Consumes: `FetchedTextFile`, `FunctionMetric`, and `logicalLineNumbers(text, "python")`.
- Produces:

```ts
export interface PythonNode {
  type: string;
  from: number;
  to: number;
  parent: number | null;
  children: number[];
  error: boolean;
}

export interface MetricEntry {
  index: number;
  depth: number;
}

export type LineLookup = (offset: number) => number;

export function parsePython(text: string): PythonNode[] | null;
export function nodeTextAt(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): string;
export function createPythonLineLookup(text: string): LineLookup;
export function functionMetric(
  nodes: readonly PythonNode[],
  index: number,
  file: FetchedTextFile,
  logicalLines: readonly number[],
  lineAt: LineLookup,
): FunctionMetric | null;
```

- `python.ts` continues to export only `analyzePython` at runtime.

- [ ] **Step 1: Add exact facade and syntax/function red tests**

Append a frozen public facade fixture to `python.test.ts` and create the missing-module tests:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { fetchedTextFile } from "../../../test/fixtures/text-files";
import { logicalLineNumbers } from "../line-metrics";
import { functionMetric } from "./function-metrics";
import { createPythonLineLookup, parsePython } from "./syntax";

describe("Python internal syntax boundary", () => {
  it("parses and measures the compact function through extracted stages", () => {
    const file = fetchedTextFile(
      "src/choice.py",
      "def choose(value):\n    if value:\n        return 1\n    return 0\n",
      { language: "python", category: "source" },
    );
    const nodes = parsePython(file.text);
    expect(nodes).not.toBeNull();
    const functionIndex = nodes?.findIndex(
      (node) => node.type === "FunctionDefinition",
    );
    expect(functionIndex).toBeGreaterThanOrEqual(0);
    expect(
      functionMetric(
        nodes ?? [],
        functionIndex ?? -1,
        file,
        logicalLineNumbers(file.text, "python"),
        createPythonLineLookup(file.text),
      ),
    ).toEqual({
      path: "src/choice.py",
      name: "choose",
      startLine: 1,
      endLine: 4,
      logicalLines: 4,
      cyclomatic: 2,
      maxNesting: 1,
      hasErrorHandling: false,
      isTest: false,
    });
  });

  it("keeps the facade runtime export surface singular", async () => {
    const module = await import("./python");
    expect(Object.keys(module).sort()).toEqual(["analyzePython"]);
    const source = readFileSync(
      fileURLToPath(new URL("../python.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toContain("@lezer/python");
  });
});
```

- [ ] **Step 2: Run the focused tests and record the missing-module red**

Run:

```bash
pnpm vitest run src/features/analyzers/python/syntax.test.ts src/features/analyzers/python/function-metrics.test.ts src/features/analyzers/python.test.ts
```

Expected: FAIL because `./python/syntax` and `./python/function-metrics` do not exist and the facade still imports `@lezer/python`.

- [ ] **Step 3: Create private Python models and syntax helpers**

Move `PythonNode`, `MetricEntry`, `LineLookup`, `flattenCursor`, `parsePython`, `nodeText`, `nodeTextAt`, `lineLookup`, `firstLineAtOrAfter`, and `logicalLinesInRange` from `python.ts` without changing their expressions or loop order. Use this exact module direction:

```ts
// python/syntax.ts
import type { TreeCursor } from "@lezer/common";
import { parser } from "@lezer/python";
import type { LineLookup, PythonNode } from "./model";

export function parsePython(text: string): PythonNode[] | null;
export function nodeText(node: PythonNode, text: string): string;
export function nodeTextAt(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): string;
export function createPythonLineLookup(text: string): LineLookup;
export function logicalLinesInRange(
  lines: readonly number[],
  startLine: number,
  endLine: number,
): number;
```

Keep cursor flattening iterative and keep syntax-error behavior as `null`.

- [ ] **Step 4: Extract function metrics mechanically**

Move `directChildCount`, `isDefaultMatchClause`, `branchIncrement`, `increasesNesting`, `tryChildren`, `firstDirectVariable`, and `functionMetric` into `python/function-metrics.ts`. Import source slicing and line helpers from `syntax.ts`. Do not change the order of lambda/function isolation, branch increments, handler depth, or child stack pushes.

```ts
export function firstDirectVariable(
  nodes: readonly PythonNode[],
  index: number,
): number | null;

export function functionMetric(
  nodes: readonly PythonNode[],
  index: number,
  file: FetchedTextFile,
  logicalLines: readonly number[],
  lineAt: LineLookup,
): FunctionMetric | null;
```

- [ ] **Step 5: Rewire the facade and run focused green**

Replace Lezer and local helper definitions in `python.ts` with:

```ts
import { firstDirectVariable, functionMetric } from "./python/function-metrics";
import {
  createPythonLineLookup,
  nodeTextAt,
  parsePython,
} from "./python/syntax";
```

Run the three focused files from Step 2. Expected: PASS with every pre-existing Python assertion unchanged.

- [ ] **Step 6: Run task gates and commit**

Run:

```bash
pnpm lint
pnpm format:check
pnpm vitest run src/features/analyzers/line-metrics.test.ts src/features/analyzers/python.test.ts src/features/analyzers/python/syntax.test.ts src/features/analyzers/python/function-metrics.test.ts
pnpm exec tsc -b
pnpm build
git diff --check
```

Expected: all PASS; production still emits Python only through the worker dynamic import.

Commit:

```bash
git add src/features/analyzers/python.ts src/features/analyzers/python.test.ts src/features/analyzers/python
git commit -m "refactor: extract Python syntax metrics"
```

Stop for independent specification and quality review before Task 2.

---

### Task 2: Extract Python bindings and evidence

**Files:**

- Create: `src/features/analyzers/python/bindings.ts`
- Create: `src/features/analyzers/python/bindings.test.ts`
- Create: `src/features/analyzers/python/evidence.ts`
- Create: `src/features/analyzers/python/evidence.test.ts`
- Modify: `src/features/analyzers/python.ts`
- Modify: `src/features/analyzers/python.test.ts`

**Interfaces:**

```ts
export interface RelativeImportEvidence {
  definite: string[];
  candidates: string[];
}

export function bindingIdentifiers(
  nodes: readonly PythonNode[],
  text: string,
): Set<number>;
export function isAmbiguousIdentifier(name: string): boolean;
export function publicApiKind(
  nodes: readonly PythonNode[],
  index: number,
): "function" | "class" | "method" | null;
export function hasDocstring(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): boolean;
export function collectRelativeImports(
  nodes: readonly PythonNode[],
  text: string,
  namesBeforeImport?: ReadonlyMap<number, ReadonlySet<string>>,
): RelativeImportEvidence;
export function normalizedTokens(
  nodes: readonly PythonNode[],
  text: string,
): string[];
```

- [ ] **Step 1: Write binding/evidence red tests**

Create focused tests that import the missing modules and use exact fixtures:

```ts
it("keeps lambda/comprehension ownership and excludes module properties", () => {
  const text =
    "ab = 1\ndef choose(long_name=value_ref):\n    return [(xy := item) for cd in rows]\n";
  const nodes = parsePython(text) ?? [];
  const names = [...bindingIdentifiers(nodes, text)].map((index) =>
    nodeTextAt(nodes, index, text),
  );
  // Preserve the baseline Set insertion order: the comprehension target is
  // visited before the walrus target.
  expect(names).toEqual(["choose", "long_name", "cd", "xy"]);
});

it("normalizes a nested f-string replacement exactly once", () => {
  const text = "value = f\"{f'{x + 1}'}\"\n";
  expect(normalizedTokens(parsePython(text) ?? [], text)).toEqual([
    "value",
    "=",
    "TEMPLATE",
    "TEMPLATE",
    "x",
    "+",
    "NUMBER",
  ]);
});
```

- [ ] **Step 2: Run focused red**

Run:

```bash
pnpm vitest run src/features/analyzers/python/bindings.test.ts src/features/analyzers/python/evidence.test.ts src/features/analyzers/python.test.ts
```

Expected: FAIL because `bindings.ts` and `evidence.ts` do not exist.

- [ ] **Step 3: Extract binding ownership without semantic edits**

Move the allowlist and the functions from `collectTargetVariables` through `bindingIdentifiers`, including function declarations, global/nonlocal maps, comprehension/walrus ownership, parameter grouping, and import bindings. Keep the exact `Set` insertion order and case-sensitive allowlist.

`bindings.ts` may import only `PythonNode` and syntax text helpers. It must not import `binding-flow.ts`, `evidence.ts`, or the facade.

- [ ] **Step 4: Extract evidence collection without semantic edits**

Move `semanticParent`, `publicApiKind`, docstring parsing, relative import parsing/type-checking exclusion, and token normalization into `evidence.ts`. Preserve these exact boundaries:

- `.pyi` retains relative runtime import edges but no tokens or parsed-byte contribution;
- canonical `TYPE_CHECKING` true branches do not create runtime edges;
- nested f-string replacements are emitted once;
- bytes/f-string pseudo-docstrings remain rejected;
- raw/unicode/continued/parenthesized ordinary docstrings remain accepted.

- [ ] **Step 5: Rewire and run focused green**

Replace moved definitions in `python.ts` with internal imports, then run Step 2 plus `line-metrics.test.ts`. Expected: PASS with exact identifier, import, token, and doc counts unchanged.

- [ ] **Step 6: Run task gates and commit**

```bash
pnpm lint
pnpm format:check
pnpm vitest run src/features/analyzers/python.test.ts src/features/analyzers/python/bindings.test.ts src/features/analyzers/python/evidence.test.ts
pnpm exec tsc -b
pnpm build
git diff --check
git add src/features/analyzers/python.ts src/features/analyzers/python.test.ts src/features/analyzers/python
git commit -m "refactor: isolate Python binding evidence"
```

Stop for independent specification and quality review before Task 3.

---

### Task 3: Extract Python binding flow and thin the facade

**Files:**

- Create: `src/features/analyzers/python/binding-flow.ts`
- Create: `src/features/analyzers/python/binding-flow.test.ts`
- Create: `src/features/analyzers/python/analyze-file.ts`
- Create: `src/features/analyzers/python/analyze-file.test.ts`
- Create: `src/features/analyzers/python/module-contract.test.ts`
- Modify: `src/features/analyzers/python/model.ts`
- Modify: `src/features/analyzers/python.ts`
- Modify: `src/features/analyzers/python.test.ts`

**Interfaces:**

```ts
export interface TopLevelBindingMetadata {
  namesBeforeImport: ReadonlyMap<number, ReadonlySet<string>>;
  finalNames: string[];
}

export function topLevelBindingMetadata(
  nodes: readonly PythonNode[],
  text: string,
): TopLevelBindingMetadata;

export function analyzeParsedPythonFile(
  file: FetchedTextFile,
  nodes: readonly PythonNode[],
  output: LanguageAnalysis,
): void;
```

- [ ] **Step 1: Write binding-flow and thin-facade red tests**

Add exact flow cases covering normal plus exceptional completions:

```ts
it("propagates return through finally and lets an abrupt finally override it", () => {
  const text = [
    "b = None",
    "for x in rows:",
    "    try:",
    "        return None",
    "    finally:",
    "        break",
    "else:",
    "    b = None",
    "from . import b",
  ].join("\n");
  const nodes = parsePython(`${text}\n`) ?? [];
  // Preserve the frozen baseline: the loop may exhaust and execute `else`, so
  // `b` remains definite across the joined paths.
  expect(topLevelBindingMetadata(nodes, `${text}\n`).finalNames).toEqual(["b"]);
});
```

Add a module contract:

```ts
it("keeps python.ts as a thin public facade", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../python.ts", import.meta.url)),
    "utf8",
  );
  expect(source.split("\n").length).toBeLessThanOrEqual(180);
  expect(source).not.toMatch(/interpret(?:If|Try|Loop|Match|With|Binding)/u);
});
```

- [ ] **Step 2: Run focused red**

```bash
pnpm vitest run src/features/analyzers/python/binding-flow.test.ts src/features/analyzers/python/analyze-file.test.ts src/features/analyzers/python/module-contract.test.ts src/features/analyzers/python.test.ts
```

Expected: FAIL because the internal modules do not exist and the facade exceeds 180 lines.

- [ ] **Step 3: Move private flow types and extract the interpreter**

Move `TopLevelBindingMetadata`, `BindingFlowContext`, `BindingFlowResult`, completion-state types, and `MAX_BINDING_FLOW_DEPTH` into `model.ts`. Move the full block/statement interpreter from `cloneBindingState` through `topLevelBindingMetadata` into `binding-flow.ts` without changing:

- depth `128` conservative fallback;
- condition truth normalization;
- ordered assignment target tasks;
- exceptional prefix intersections;
- loop exhaustion versus reachable break paths;
- handler aliases and cleanup;
- normal/exceptional/break/continue/return completion propagation; and
- `finally` override ordering.

Keep any existing source-order loops and `Set` intersections byte-for-byte where practical.

- [ ] **Step 4: Extract per-file orchestration**

Move `analyzeParsedFile` to `analyze-file.ts` and rename it `analyzeParsedPythonFile`. It consumes syntax, function metrics, bindings, flow metadata, and evidence. Preserve `.pyi` zero denominators and file-array insertion order.

- [ ] **Step 5: Reduce `python.ts` to the facade**

The facade contains only path extension helpers, comparison order, `analyzePython`, and imports:

```ts
import type { FetchedTextFile, LanguageAnalysis } from "../analysis/model";
import { analyzeParsedPythonFile } from "./python/analyze-file";
import { parsePython } from "./python/syntax";

export function analyzePython(
  files: readonly FetchedTextFile[],
): LanguageAnalysis {
  // Existing initialization, filtering, sorting, parse isolation, aggregation,
  // function sorting, and return order are retained exactly.
}
```

Do not export internal stages from the facade.

- [ ] **Step 6: Run focused green and full Python regression**

```bash
pnpm vitest run src/features/analyzers/line-metrics.test.ts src/features/analyzers/python.test.ts src/features/analyzers/python/*.test.ts
```

Expected: all current hostile/deep/wide, CFG, `.pyi`, f-string, ordering, and mutation tests PASS; module contract reports at most 180 facade lines.

- [ ] **Step 7: Run task gates and commit**

```bash
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm build
pnpm check:bundle
git diff --check
git add src/features/analyzers/python.ts src/features/analyzers/python.test.ts src/features/analyzers/python
git commit -m "refactor: modularize Python analysis flow"
```

Expected coverage remains above frozen floors and Python lazy chunk remains under 512,000 gzip bytes. Stop for two-stage independent review.

---

### Task 4: Extract import resolution and SCC analysis

**Files:**

- Create: `src/features/analyzers/cross-file/model.ts`
- Create: `src/features/analyzers/cross-file/path-order.ts`
- Create: `src/features/analyzers/cross-file/import-resolution.ts`
- Create: `src/features/analyzers/cross-file/import-resolution.test.ts`
- Create: `src/features/analyzers/cross-file/scc.ts`
- Create: `src/features/analyzers/cross-file/scc.test.ts`
- Modify: `src/features/analyzers/cross-file.ts`
- Modify: `src/features/analyzers/cross-file.test.ts`

**Interfaces:**

```ts
export interface GraphFile {
  path: string;
  comparisonPath: string;
  language: ImportingFile["language"];
  relativeImports: readonly string[];
  relativeImportCandidates: readonly string[];
  topLevelDefinedNames: readonly string[];
}

export function comparePathValues(left: string, right: string): number;
export function buildImportGraph(
  input: readonly ImportingFile[],
): Map<string, string[]>;
export function stronglyConnectedComponents(
  graph: ReadonlyMap<string, readonly string[]>,
): string[][];
export function compareComponents(
  left: readonly string[],
  right: readonly string[],
): number;
```

- [ ] **Step 1: Write graph/SCC red tests**

```ts
it("qualifies Python from-dot candidates against package bindings", () => {
  expect(
    buildImportGraph([
      {
        path: "pkg/__init__.py",
        language: "python",
        relativeImports: ["."],
        relativeImportCandidates: [".b"],
        topLevelDefinedNames: [],
      },
      {
        path: "pkg/b.py",
        language: "python",
        relativeImports: [".marker"],
      },
      { path: "pkg/marker.py", language: "python", relativeImports: [] },
    ]),
  ).toEqual(
    new Map([
      ["pkg/__init__.py", ["pkg/b.py"]],
      ["pkg/b.py", ["pkg/marker.py"]],
      ["pkg/marker.py", []],
    ]),
  );
});

it("sorts deterministic components by size then path", () => {
  const graph = new Map([
    ["b.ts", ["a.ts"]],
    ["a.ts", ["b.ts"]],
    ["z.ts", []],
  ]);
  expect(stronglyConnectedComponents(graph)).toEqual([
    ["a.ts", "b.ts"],
    ["z.ts"],
  ]);
});
```

- [ ] **Step 2: Run focused red**

```bash
pnpm vitest run src/features/analyzers/cross-file/import-resolution.test.ts src/features/analyzers/cross-file/scc.test.ts src/features/analyzers/cross-file.test.ts
```

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Extract path ordering and graph resolution**

Move comparison, POSIX normalization, directory/join helpers, language checks, JS/TS candidates, Python base/module/package candidates, package-shadow qualification, and `buildGraph` into `path-order.ts` and `import-resolution.ts`. Rename only `buildGraph` to `buildImportGraph`; keep path candidate ordering and `Map`/`Set` insertion behavior unchanged.

- [ ] **Step 4: Extract SCC traversal**

Move `stronglyConnectedComponents` and `compareComponents` into `scc.ts` unchanged. Do not convert traversal during the mechanical move. Add an existing-safe deep graph fixture at the current supported size; an iterative rewrite requires its own later red/green step and is not needed for release.

- [ ] **Step 5: Rewire facade and run focused green**

Implement `findCircularImports` using only the extracted graph and SCC functions:

```ts
export function findCircularImports(
  input: readonly ImportingFile[],
): ImportCycleMetrics {
  const components = stronglyConnectedComponents(buildImportGraph(input))
    .filter((component) => component.length > 1)
    .sort(compareComponents);
  return { components, largestComponentSize: components[0]?.length ?? 0 };
}
```

Run Step 2. Expected: exact existing JS/TS, `.d.ts`, Python, `.pyi`, case-fold, package-shadow, CFG-integration, shuffle, and SCC results PASS.

- [ ] **Step 6: Run task gates and commit**

```bash
pnpm lint
pnpm format:check
pnpm vitest run src/features/analyzers/python.test.ts src/features/analyzers/cross-file.test.ts src/features/analyzers/cross-file/*.test.ts
pnpm exec tsc -b
pnpm build
git diff --check
git add src/features/analyzers/cross-file.ts src/features/analyzers/cross-file.test.ts src/features/analyzers/cross-file
git commit -m "refactor: isolate import graph analysis"
```

Stop for independent specification and quality review.

---

### Task 5: Extract bounded duplicate matching and thin the cross-file facade

**Files:**

- Create: `src/features/analyzers/cross-file/duplicate-index.ts`
- Create: `src/features/analyzers/cross-file/duplicate-index.test.ts`
- Create: `src/features/analyzers/cross-file/duplicate-candidates.ts`
- Create: `src/features/analyzers/cross-file/duplicate-candidates.test.ts`
- Create: `src/features/analyzers/cross-file/duplicate-selection.ts`
- Create: `src/features/analyzers/cross-file/duplicate-selection.test.ts`
- Create: `src/features/analyzers/cross-file/module-contract.test.ts`
- Modify: `src/features/analyzers/cross-file/model.ts`
- Modify: `src/features/analyzers/cross-file.ts`
- Modify: `src/features/analyzers/cross-file.test.ts`

**Interfaces:**

```ts
export const DUPLICATE_WINDOW_SIZE = 50;
export const MAX_DUPLICATE_EVIDENCE = 20;

export function prepareDuplicateCandidateSources(
  files: readonly DuplicateFile[],
  occupied: readonly boolean[][],
  fileCanMatch: readonly boolean[],
  instrumentation?: DuplicateRatioInstrumentation,
): CandidateSource[];

export function chooseNonOverlapping(
  files: readonly DuplicateFile[],
  instrumentation?: DuplicateRatioInstrumentation,
): { accepted: DuplicateCandidate[]; occupied: boolean[][] };

export function summarizeEvidence(
  files: readonly DuplicateFile[],
  accepted: readonly DuplicateCandidate[],
): DuplicatePathPairEvidence[];
```

- [ ] **Step 1: Add missing-module and exact parity red tests**

Use a small brute-force oracle and one structural budget:

```ts
it("preserves greedy output for repeated spans separated by a mismatch", () => {
  const left = Array.from({ length: 130 }, (_, index) =>
    index === 63 ? "left-break" : `token-${index % 20}`,
  );
  const right = Array.from({ length: 130 }, (_, index) =>
    index === 67 ? "right-break" : `token-${(index + 19) % 20}`,
  );
  const files = [
    { path: "a.ts", isTest: false, normalizedTokens: left },
    { path: "b.ts", isTest: false, normalizedTokens: right },
  ];
  expect(computeDuplicateRatio(files)).toEqual(bruteForceDuplicateRatio(files));
});

it("keeps candidate source topology bounded by exact window groups", () => {
  const sharedPrefixFiles = (count: number, length: number): TokenizedFile[] =>
    Array.from({ length: count }, (_, fileIndex) => ({
      path: `src/file-${fileIndex}.ts`,
      isTest: false,
      normalizedTokens: [
        ...Array.from({ length: length - 1 }, (_, index) => `shared-${index}`),
        `unique-${fileIndex}`,
      ],
    }));
  let prepared = 0;
  computeDuplicateRatio(sharedPrefixFiles(30, 1_000), {
    onCandidateSourcesPrepared: (count) => {
      prepared = count;
    },
  });
  expect(prepared).toBeLessThanOrEqual(1_000);
});
```

Create `module-contract.test.ts` expecting `cross-file.ts` to be at most 140 lines and to export exactly `DuplicateRatioInstrumentation`, `computeDuplicateRatio`, and `findCircularImports` at the TypeScript surface, with only two runtime function exports.

- [ ] **Step 2: Run focused red**

```bash
pnpm vitest run src/features/analyzers/cross-file/duplicate-index.test.ts src/features/analyzers/cross-file/duplicate-candidates.test.ts src/features/analyzers/cross-file/duplicate-selection.test.ts src/features/analyzers/cross-file/module-contract.test.ts src/features/analyzers/cross-file.test.ts
```

Expected: FAIL because the duplicate modules are missing and the facade is above 140 lines.

- [ ] **Step 3: Extract duplicate index primitives**

Move unchanged constants and these responsibilities into `duplicate-index.ts`: token hashing, rolling window hashes, window indexing, exact collision verification, whole-file fingerprints/equality, identical-file grouping, minimal-period calculation, exact-window grouping, and preparation of shared global groups.

Preserve integer operations, hash as indexing only, and exact token verification before accepting a group.

- [ ] **Step 4: Extract lazy candidate generation**

Move periodic compatible deltas, radix nodes/ranking/partitions, candidate-source construction, candidate heap push/pop, source liveness, and ordered candidate iteration into `duplicate-candidates.ts`. Preserve:

- one global source per exact window group rather than pair×group sources;
- lazy heads rather than all candidate materialization;
- canonical maximal-match start selection;
- live `fileCanMatch` and occupancy pruning;
- current candidate comparator: length descending, then paths, then starts; and
- instrumentation meaning and call timing.

- [ ] **Step 5: Extract greedy selection and evidence**

Move `rangeIsFree`, `markRange`, `hasFreeDuplicateWindow`, `chooseNonOverlapping`, and `summarizeEvidence` into `duplicate-selection.ts`. Keep accepted candidate ordering, token-union counting, path-pair aggregation, and 20-evidence cap unchanged.

- [ ] **Step 6: Reduce `cross-file.ts` to a facade**

The facade constructs sorted non-test `DuplicateFile` inputs, computes the denominator, delegates selection/evidence, and delegates import cycles. It must not contain hash, radix, heap, occupancy, path-resolution, or Tarjan implementations.

- [ ] **Step 7: Run all exact/performance green tests**

```bash
pnpm vitest run src/features/analyzers/cross-file.test.ts src/features/analyzers/cross-file/*.test.ts
```

Expected: PASS for brute-force differential cases, FNV collision verification, identical/uniform/periodic inputs, split same-diagonal spans, multi-file global ordering, 2×1,000 irregular repeated blocks, 35×200 high fanout, 100/200-file stale pruning, source-count instrumentation, SCC ordering, and frozen-input non-mutation.

- [ ] **Step 8: Run task gates and commit**

```bash
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm build
pnpm check:bundle
git diff --check
git add src/features/analyzers/cross-file.ts src/features/analyzers/cross-file.test.ts src/features/analyzers/cross-file
git commit -m "refactor: modularize bounded duplicate analysis"
```

Expected: no coverage-floor or analyzer-budget regression. Stop for two-stage independent review.

---

### Task 6: Improve bilingual usage, version history, architecture, and stable API docs

**Files:**

- Create: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/architecture.md`
- Modify: `src/repository-files.test.ts`
- Modify: `src/features/analysis/model.ts`
- Modify: `src/features/repository/repo-url.ts`
- Modify: `src/features/github/github-client.ts`
- Modify: `src/features/scanner/tree.ts`
- Modify: `src/features/scanner/select-files.ts`
- Modify: `src/features/analyzers/python.ts`
- Modify: `src/features/analyzers/js-ts.ts`
- Modify: `src/features/analyzers/cross-file.ts`
- Modify: `src/features/rules/rules.ts`
- Modify: `src/features/rules/confidence.ts`
- Modify: `src/features/rules/findings.ts`
- Modify: `src/features/worker/worker-client.ts`
- Modify: `src/features/cache/report-cache.ts`
- Modify: `package.json`

**Interfaces:** Public functions and types are documented but unchanged. `package.json` version becomes exactly `0.1.1`; the lockfile remains byte-identical because this private package has no importer version field.

- [ ] **Step 1: Strengthen repository-contract tests first**

Add exact requirements to `repository-files.test.ts`:

```ts
expect(read("CHANGELOG.md")).toMatch(/^## \[Unreleased\]$/mu);
expect(read("CHANGELOG.md")).toMatch(/^## \[0\.1\.1\] - 2026-08-12$/mu);
expect(read("CHANGELOG.md")).toMatch(/^## \[0\.1\.0\] - 2026-08-12$/mu);

for (const [english, chinese] of [
  ["## Install and run locally", "## 安装并在本地运行"],
  ["## Example report walkthrough", "## 报告示例解读"],
] as const) {
  expect(read("README.md")).toContain(english);
  expect(read("README.zh-CN.md")).toContain(chinese);
}

for (const modulePath of [
  "python/syntax.ts",
  "python/function-metrics.ts",
  "python/bindings.ts",
  "python/binding-flow.ts",
  "python/evidence.ts",
  "python/analyze-file.ts",
  "cross-file/duplicate-index.ts",
  "cross-file/duplicate-candidates.ts",
  "cross-file/duplicate-selection.ts",
  "cross-file/import-resolution.ts",
  "cross-file/scc.ts",
] as const) {
  expect(read("docs/architecture.md")).toContain(modulePath);
}
```

Assert `package.json` version is `0.1.1` and preserve a pre-edit hash of `pnpm-lock.yaml` for the version-only change check.

- [ ] **Step 2: Run contract red**

```bash
pnpm vitest run src/repository-files.test.ts
```

Expected: FAIL because changelog and new bilingual sections are missing, architecture lacks the module tree, and version is `0.1.0`.

- [ ] **Step 3: Write equivalent bilingual installation sections**

Both READMEs state:

- hosted use needs no installation;
- contributor setup requires Node.js 24.x and pnpm 11.16.0;
- exact commands are `pnpm install --frozen-lockfile`, `pnpm dev`, then open `http://localhost:5173/`;
- the development server is local-only and must not be deployed;
- the application still needs no GitHub token.

- [ ] **Step 4: Write equivalent concrete walkthroughs**

Use `https://github.com/Thworry/reposcope` as a non-normative example. Describe input, commit pinning, overall score and confidence interpretation, six dimensions, scope/failures, improvements, and immutable `blob/<commit>/path#Lx-Ly` links. State that numbers change with the public commit and that the tool does not execute or certify the repository.

- [ ] **Step 5: Add changelog and architecture map**

Create:

```md
# Changelog

All notable changes to RepoScope are documented in this file.

## [Unreleased]

## [0.1.1] - 2026-08-12

### Changed

- Split Python and cross-file analyzers into cohesive private modules while preserving ruleset 1.0.0 and report semantics.
- Added useful documentation for stable cross-module APIs.
- Expanded bilingual installation and report walkthrough guidance.

## [0.1.0] - 2026-08-12

### Added

- First bilingual, read-only, browser-side quality reports for public GitHub repositories.
```

Add the exact new module tree and dependency arrows to architecture, while preserving all existing endpoint, CSP, cache, limit, and threat text.

- [ ] **Step 6: Add useful TSDoc without widening exports**

Document stable contracts in place. Each comment answers input, output/order, failure or cancellation, limits, and non-execution when relevant. For example:

```ts
/**
 * Parses an accepted public GitHub repository URL or slug into canonical owner
 * and repository segments. The result contains no credentials, query, fragment,
 * branch, or path; rejected input throws `RepoUrlError`.
 */
export function parseRepositoryUrl(input: string): RepoRef;

/**
 * Analyzes selected Python text without executing project code. Files are
 * processed in case-insensitive POSIX order; syntax failures are isolated and
 * returned in `parseFailures`.
 */
export function analyzePython(
  files: readonly FetchedTextFile[],
): LanguageAnalysis;
```

Add comparable non-filler comments to the priority targets listed under Files. Do not export private internal functions or add comments that promise stronger behavior than tests enforce.

- [ ] **Step 7: Set the package version without dependency drift**

Record the lock hash, change only `package.json` version to `0.1.1`, and run:

```bash
shasum -a 256 pnpm-lock.yaml
pnpm install --frozen-lockfile
shasum -a 256 pnpm-lock.yaml
git diff -- package.json
git diff --exit-code -- pnpm-lock.yaml
```

Expected: the two hashes match, frozen install passes, and only the `package.json` version changes.

- [ ] **Step 8: Run green contract and documentation gates**

```bash
pnpm format
pnpm lint
pnpm format:check
pnpm vitest run src/repository-files.test.ts src/features/rules/rules.test.ts
pnpm exec tsc -b
git diff --check
```

Expected: PASS; bilingual sections and exact public contract are locked.

- [ ] **Step 9: Commit and review**

```bash
git add CHANGELOG.md README.md README.zh-CN.md docs/architecture.md src/repository-files.test.ts src/features package.json
git diff --cached --check
git commit -m "docs: prepare RepoScope v0.1.1"
```

Stop for independent spec review of bilingual/contract accuracy and quality review of TSDoc usefulness, security claims, and export-surface stability.

---

### Task 7: Final local compatibility and production gates

**Files:**

- Modify only when a gate exposes a precise regression: the directly responsible Task 1–6 file and its focused test.
- Do not change thresholds, fixtures, CI workflow pins, CSP, or release documentation to bypass a failure.

**Interfaces:** Produces one reviewed candidate commit set on `codex/reposcope-maintainability-v011` with no uncommitted files.

- [ ] **Step 1: Run frozen install and consecutive core gates**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm build
pnpm check:bundle
```

Expected: at least 804 existing tests plus new tests PASS; coverage remains above 90/80/90/90; initial JS ≤204,800 gzip, CSS ≤51,200, each analyzer ≤512,000.

- [ ] **Step 2: Prove facade/export/lazy boundaries**

Run module-contract tests and inspect the Vite manifest:

```bash
pnpm vitest run src/features/analyzers/python/module-contract.test.ts src/features/analyzers/cross-file/module-contract.test.ts
rg -n 'js-ts|python|analysis.worker' dist/.vite/manifest.json
rg -n '@babel|lezer|FunctionDefinition|MatchRadixNode' dist/assets/index-*.js
```

Expected: facade tests PASS; worker references separate JS/TS and Python chunks; the final `rg` returns no parser/analyzer marker in the initial chunk.

- [ ] **Step 3: Run the complete browser matrix**

```bash
pnpm exec playwright test
```

Expected: 20/20 (10 scenarios × desktop/mobile), fixed network ledger, exact scores, lazy chunk matrix, Axe, 44px targets, 3px focus, 200% zoom equivalent, reduced motion, clipboard, hostile strings, cancellation, and stale refresh all PASS.

- [ ] **Step 4: Run three-run Lighthouse**

```bash
pnpm check:lighthouse
```

Expected: three runs; performance, accessibility, best-practices, and SEO all meet the unchanged `0.95` assertions.

- [ ] **Step 5: Compare frozen semantic fixtures**

Run the Python, cross-file, rules, findings, worker, guards, and E2E fixed-score suites together:

```bash
pnpm vitest run src/features/analyzers/python.test.ts src/features/analyzers/cross-file.test.ts src/features/rules/rules.test.ts src/features/rules/findings.test.ts src/features/worker/analysis.worker.test.ts src/features/analysis/guards.test.ts
```

Expected: all exact arrays, counts, scores, severities, and order assertions PASS without snapshot updates.

- [ ] **Step 6: Audit diff, history, and candidate cleanliness**

```bash
git diff main...HEAD --check
git status --short --branch
git log --oneline --decorate main..HEAD
```

Expected: clean branch; only approved design, internal modules/tests, documentation, TSDoc, and package-version commits; `pnpm-lock.yaml` remains unchanged.

- [ ] **Step 7: Obtain final independent reviews**

Dispatch one read-only specification reviewer and one read-only quality/security reviewer over the complete `main...HEAD` range. Any P0–P2 issue receives a new focused red test, minimal fix, full relevant gates, and a non-amended fix commit; both reviewers must return PASS before Task 8.

---

### Task 8: Publish, verify Pages, and release v0.1.1

**Files:** No planned source changes. A hosted failure may be fixed only in a new reviewed commit on the feature branch before merging again.

**Interfaces:** Remote repository `https://github.com/Thworry/reposcope`, Pages `https://thworry.github.io/reposcope/`, release `v0.1.1`.

- [ ] **Step 1: Verify authority and remote state**

```bash
gh auth status
gh repo view Thworry/reposcope --json nameWithOwner,visibility,defaultBranchRef,homepageUrl
gh release view v0.1.1 --repo Thworry/reposcope --json url,isDraft,isPrerelease
git fetch origin
git status --short --branch
```

Expected: active `Thworry`, public repository, default `main`, no existing `v0.1.1` release, clean feature branch, and `origin/main` still at the reviewed base or a safely reviewable descendant.

- [ ] **Step 2: Fast-forward main without rewriting history**

```bash
git switch main
git pull --ff-only origin main
git merge --ff-only codex/reposcope-maintainability-v011
git push origin main
```

Expected: fast-forward only; no merge commit, force push, or unrelated remote history overwrite.

- [ ] **Step 3: Wait for hosted CI and Pages**

```bash
gh run list --repo Thworry/reposcope --branch main --limit 10
gh run watch <CI_RUN_ID> --repo Thworry/reposcope --exit-status
gh run watch <PAGES_RUN_ID> --repo Thworry/reposcope --exit-status
```

Replace each run ID with the exact push-triggered `CI` and `Deploy Pages` IDs returned by the first command. Expected: both conclude `success`. On failure, inspect that run with `gh run view <RUN_ID> --log-failed`; do not blindly rerun.

- [ ] **Step 4: Verify deployed commit and production boundaries**

```bash
curl -fsS https://thworry.github.io/reposcope/ > /tmp/reposcope-v011.html
rg -n '/reposcope/assets/|Content-Security-Policy|unsafe-inline|unsafe-eval' /tmp/reposcope-v011.html
curl -fsS -o /dev/null -w '%{http_code}\n' https://thworry.github.io/reposcope/
```

Expected: HTTP 200, `/reposcope/` asset paths, exact strict production CSP, and no unsafe allowance.

- [ ] **Step 5: Run clean live browser compatibility acceptance**

Use a fresh Playwright browser context against Pages. Analyze `Thworry/reposcope` and `Thworry/issueready`; record:

- exactly three REST GETs per fresh scan;
- raw requests pinned to a 40/64-hex commit and ≤200;
- progress and cancellation;
- overall score, confidence, all six dimensions, scope, and immutable links;
- English/Chinese switching with no additional GitHub requests;
- `?repo=owner%2Frepo` share state;
- strict CSP, zero console warning/error, 375px zero overflow, and 3px keyboard focus; and
- only the required analyzer chunks.

Compare the frozen application fixtures with pre-refactor values. For live self-analysis, explicitly attribute any changed documentation rules to the new README/TSDoc/changelog evidence; all non-documentation analyzer metrics must remain compatible.

- [ ] **Step 6: Tag only the accepted main commit**

```bash
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git tag -l v0.1.1
git tag -a v0.1.1 -m "RepoScope v0.1.1"
git push origin v0.1.1
```

Expected: clean `main`, local and remote SHA equal, tag absent before creation, annotated tag pushed successfully.

- [ ] **Step 7: Publish a non-draft release**

```bash
gh release create v0.1.1 \
  --repo Thworry/reposcope \
  --title "RepoScope v0.1.1" \
  --notes "Maintainability release: modular analyzer internals, clearer bilingual setup and usage guidance, and improved stable API documentation. Ruleset 1.0.0 and report semantics remain compatible."
gh release view v0.1.1 --repo Thworry/reposcope --json url,isDraft,isPrerelease,tagName,targetCommitish
```

Expected: public release, `isDraft=false`, `isPrerelease=false`, tag `v0.1.1`, target `main`.

- [ ] **Step 8: Record final evidence**

Capture final commit SHA, repository/Pages/release URLs, CI/Pages run URLs, test count, coverage, bundle gzip sizes, Playwright 20/20, three Lighthouse runs, live REST/raw counts, and before/after self-report explanation. Confirm:

```bash
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git rev-list -n 1 v0.1.1
```

Expected: clean `main`; local main, remote main, and dereferenced release tag point to the accepted release commit.

---

## Plan Completion Gate

Before declaring `v0.1.1` complete, verify every implementation task has:

1. a focused red caused by its missing internal boundary or documentation contract;
2. focused green with exact semantic assertions;
3. the task-level lint, format, type, test, build, and relevant bundle gate;
4. a specification review and a quality/security review; and
5. one or more intentional, non-amended commits limited to that task.

The refactor is not complete merely because the files are shorter. It is complete only when the private modules are cohesive, facades retain their public contracts, exact/performance tests prove compatibility, production chunks and security boundaries remain intact, hosted CI/Pages pass, live analysis succeeds, and public `v0.1.1` resolves without authentication.
