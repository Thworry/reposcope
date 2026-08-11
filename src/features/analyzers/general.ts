import { parse as parseToml } from "smol-toml";

import type {
  FetchedTextFile,
  GeneralAnalysisInput,
  GeneralMetrics,
  NormalizedTreeFile,
} from "../analysis/model";
import {
  CI_PATHS,
  COVERAGE_CONFIG_BASENAMES,
  COVERAGE_CONFIG_PREFIXES,
  DEPENDENCY_UPDATE_PATHS,
  EXCLUDED_PATH_SEGMENTS,
  ISSUE_AND_PR_TEMPLATE_PATHS,
  classifyFile,
  isConventionalEntryPoint,
  isExcludedPath,
  isLockfilePath,
  isManifestPath,
  toPathComparisonKey,
} from "../scanner/file-registry";
import { findMarkdownEvidence } from "./line-metrics";

export interface StructuredManifestEvidence {
  hasStructuredEntryPoint: boolean;
  hasRunCommand: boolean;
  hasBuildCommand: boolean;
  hasTestCommand: boolean;
  hasStaticCheckCommand: boolean;
  hasCoverageEvidence: boolean;
  hasManifestVersion: boolean;
  hasTestConfiguration: boolean;
}

export interface StructuredReadResult {
  evidence: StructuredManifestEvidence;
  failure: "json" | "toml" | null;
}

const MAX_STRUCTURED_BYTES = 256 * 1024;
const DOCUMENT_EXTENSIONS = [
  ".md",
  ".mdx",
  ".markdown",
  ".txt",
  ".rst",
  ".adoc",
  ".asciidoc",
] as const;
const GENERATED_SEGMENTS = new Set<string>(
  EXCLUDED_PATH_SEGMENTS.filter(
    (segment) => ![".git", ".hg", ".svn"].includes(segment),
  ),
);
const VERSION_PLACEHOLDERS = new Set([
  "0.0.0",
  "0.0.0-development",
  "private",
  "workspace",
]);
const MAX_STRUCTURED_TARGET_NODES = 4_096;
const MAX_STRUCTURED_TARGET_DEPTH = 128;
function emptyStructuredEvidence(): StructuredManifestEvidence {
  return {
    hasStructuredEntryPoint: false,
    hasRunCommand: false,
    hasBuildCommand: false,
    hasTestCommand: false,
    hasStaticCheckCommand: false,
    hasCoverageEvidence: false,
    hasManifestVersion: false,
    hasTestConfiguration: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

interface TargetValidation {
  found: boolean;
  tooComplex: boolean;
}

function validateDirectTarget(value: unknown): TargetValidation {
  if (nonEmptyString(value)) {
    return { found: true, tooComplex: false };
  }
  if (!isRecord(value)) {
    return { found: false, tooComplex: false };
  }

  const values = Object.values(value);

  if (values.length > MAX_STRUCTURED_TARGET_NODES) {
    return { found: false, tooComplex: true };
  }

  return { found: values.some(nonEmptyString), tooComplex: false };
}

function validateRecursiveTarget(value: unknown): TargetValidation {
  const pending: Array<{ value: unknown; depth: number }> = [
    { value, depth: 0 },
  ];
  let visited = 0;
  let found = false;

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }
    visited += 1;
    if (
      visited > MAX_STRUCTURED_TARGET_NODES ||
      current.depth > MAX_STRUCTURED_TARGET_DEPTH
    ) {
      return { found: false, tooComplex: true };
    }
    if (nonEmptyString(current.value)) {
      found = true;
      continue;
    }

    const children = Array.isArray(current.value)
      ? current.value
      : isRecord(current.value)
        ? Object.values(current.value)
        : [];

    for (const child of children) {
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }

  return { found, tooComplex: false };
}

function validVersion(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !VERSION_PLACEHOLDERS.has(value.trim().toLocaleLowerCase("en-US"))
  );
}

function isSizeBounded(text: string): boolean {
  return new TextEncoder().encode(text).byteLength <= MAX_STRUCTURED_BYTES;
}

function scriptEntries(value: unknown): Array<[string, string]> {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].trim().length > 0,
  );
}

export function readPackageJsonEvidence(text: string): StructuredReadResult {
  const empty = emptyStructuredEvidence();

  if (!isSizeBounded(text)) {
    return { evidence: empty, failure: "json" };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { evidence: empty, failure: "json" };
  }

  if (!isRecord(parsed)) {
    return { evidence: empty, failure: "json" };
  }

  const scripts = scriptEntries(parsed.scripts);
  const scriptKeys = scripts.map(([key]) => key);
  const browser = validateDirectTarget(parsed.browser);
  const bin = validateDirectTarget(parsed.bin);
  const exportsTarget = validateRecursiveTarget(parsed.exports);

  if (browser.tooComplex || bin.tooComplex || exportsTarget.tooComplex) {
    return { evidence: empty, failure: "json" };
  }

  const evidence: StructuredManifestEvidence = {
    hasStructuredEntryPoint:
      nonEmptyString(parsed.main) ||
      nonEmptyString(parsed.module) ||
      browser.found ||
      bin.found ||
      exportsTarget.found,
    hasRunCommand: scriptKeys.some((key) =>
      ["start", "dev", "serve"].includes(key),
    ),
    hasBuildCommand: scriptKeys.includes("build"),
    hasTestCommand: scriptKeys.some(
      (key) => key === "test" || key.startsWith("test:"),
    ),
    hasStaticCheckCommand: scriptKeys.some((key) =>
      ["lint", "typecheck", "type-check", "check", "format:check"].some(
        (prefix) => key.startsWith(prefix),
      ),
    ),
    hasCoverageEvidence: scripts.some(([, command]) =>
      /(?:^|[^\p{L}\p{N}_])coverage(?:$|[^\p{L}\p{N}_])/iu.test(command),
    ),
    hasManifestVersion: validVersion(parsed.version),
    hasTestConfiguration: false,
  };

  return { evidence, failure: null };
}

function childRecord(
  value: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const child = value?.[key];

  return isRecord(child) ? child : undefined;
}

function validateScriptTarget(
  value: Record<string, unknown> | undefined,
): TargetValidation {
  return value === undefined
    ? { found: false, tooComplex: false }
    : validateDirectTarget(value);
}

export function readPyprojectTomlEvidence(text: string): StructuredReadResult {
  const empty = emptyStructuredEvidence();

  if (!isSizeBounded(text)) {
    return { evidence: empty, failure: "toml" };
  }

  let parsed: unknown;

  try {
    parsed = parseToml(text);
  } catch {
    return { evidence: empty, failure: "toml" };
  }

  if (!isRecord(parsed)) {
    return { evidence: empty, failure: "toml" };
  }

  const project = childRecord(parsed, "project");
  const tool = childRecord(parsed, "tool");
  const poetry = childRecord(tool, "poetry");
  const projectEntryPoints = childRecord(project, "entry-points");
  const scriptTargets = [
    validateScriptTarget(childRecord(project, "scripts")),
    validateScriptTarget(childRecord(project, "gui-scripts")),
    validateScriptTarget(childRecord(projectEntryPoints, "console_scripts")),
    validateScriptTarget(childRecord(poetry, "scripts")),
  ];

  if (scriptTargets.some((target) => target.tooComplex)) {
    return { evidence: empty, failure: "toml" };
  }

  const testConfiguration = ["pytest", "unittest", "tox", "nox"].some(
    (key) => childRecord(tool, key) !== undefined,
  );
  const evidence: StructuredManifestEvidence = {
    hasStructuredEntryPoint: scriptTargets.some((target) => target.found),
    hasRunCommand: false,
    hasBuildCommand: false,
    hasTestCommand: false,
    hasStaticCheckCommand: [
      "ruff",
      "mypy",
      "pyright",
      "flake8",
      "pylint",
      "black",
    ].some((key) => childRecord(tool, key) !== undefined),
    hasCoverageEvidence: childRecord(tool, "coverage") !== undefined,
    hasManifestVersion:
      validVersion(project?.version) || validVersion(poetry?.version),
    hasTestConfiguration: testConfiguration,
  };

  return { evidence, failure: null };
}

function basename(path: string): string {
  const lower = toPathComparisonKey(path);

  return lower.slice(lower.lastIndexOf("/") + 1);
}

function directory(path: string): string {
  const lower = toPathComparisonKey(path);
  const slash = lower.lastIndexOf("/");

  return slash === -1 ? "" : lower.slice(0, slash);
}

function documentStem(path: string): string | null {
  const name = basename(path);
  const extension = DOCUMENT_EXTENSIONS.find((candidate) =>
    name.endsWith(candidate),
  );

  if (extension !== undefined) {
    return name.slice(0, -extension.length);
  }

  return name.includes(".") ? null : name;
}

function scopedDocument(
  path: string,
  scopes: readonly string[],
  names: readonly string[],
  exact = false,
): boolean {
  const stem = documentStem(path);

  return (
    stem !== null &&
    scopes.includes(directory(path)) &&
    names.some((name) => (exact ? stem === name : stem.startsWith(name)))
  );
}

function isReadme(path: string): boolean {
  return scopedDocument(path, ["", ".github"], ["readme"]);
}

function isContribution(path: string): boolean {
  return scopedDocument(path, ["", ".github", "docs"], ["contributing"]);
}

function isLicense(path: string): boolean {
  return scopedDocument(path, [""], ["license", "licence", "copying"]);
}

function isArchitecture(path: string): boolean {
  return scopedDocument(path, ["", "docs"], ["architecture"]);
}

function isVersionHistory(path: string): boolean {
  return scopedDocument(
    path,
    ["", "docs"],
    ["changelog", "changes", "history", "releases"],
  );
}

function isSecurity(path: string): boolean {
  return scopedDocument(path, ["", ".github", "docs"], ["security"], true);
}

function isCodeOfConduct(path: string): boolean {
  return scopedDocument(path, ["", ".github", "docs"], ["code_of_conduct"]);
}

function hasVersionHeading(text: string): boolean {
  return text
    .split(/\r?\n/u)
    .some((line) =>
      /^\s{0,3}(?:#{1,6}\s*)?v?\d+\.\d+(?:\.\d+)?(?:\b|\s|[-+])/iu.test(
        line.normalize("NFKC"),
      ),
    );
}

function isCi(path: string): boolean {
  const lower = toPathComparisonKey(path);

  return (
    (lower.startsWith(".github/workflows/") && /\.ya?ml$/u.test(lower)) ||
    CI_PATHS.some((candidate) => toPathComparisonKey(candidate) === lower)
  );
}

function isDependencyUpdate(path: string): boolean {
  const lower = toPathComparisonKey(path);

  return DEPENDENCY_UPDATE_PATHS.some(
    (candidate) => toPathComparisonKey(candidate) === lower,
  );
}

function isIssueOrPrTemplate(path: string): boolean {
  const lower = toPathComparisonKey(path);

  return ISSUE_AND_PR_TEMPLATE_PATHS.some((candidate) => {
    const key = toPathComparisonKey(candidate);

    return key.endsWith("/") ? lower.startsWith(key) : lower === key;
  });
}

function isCoverageConfig(path: string): boolean {
  const name = basename(path);

  return (
    COVERAGE_CONFIG_BASENAMES.some((candidate) => candidate === name) ||
    COVERAGE_CONFIG_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

function isEnvironmentExample(path: string): boolean {
  const name = basename(path);

  return (
    name === ".env.example" ||
    name === ".env.sample" ||
    /^(?:config\.(?:example|sample)|(?:example|sample)\.config)\./u.test(name)
  );
}

function isExamplePath(path: string): boolean {
  return toPathComparisonKey(path)
    .split("/")
    .slice(0, -1)
    .some((part) =>
      ["example", "examples", "demo", "sample", "samples"].includes(part),
    );
}

function isTestConfig(path: string): boolean {
  const name = basename(path);

  return (
    ["pytest.ini", "tox.ini", "noxfile.py"].includes(name) ||
    name.startsWith("jest.config.") ||
    name.startsWith("vitest.config.")
  );
}

function isPythonStaticConfig(path: string): boolean {
  const name = basename(path);

  return [
    "ruff.toml",
    ".ruff.toml",
    "mypy.ini",
    ".flake8",
    "pyrightconfig.json",
  ].includes(name);
}

function generatedDirectoryCount(files: readonly NormalizedTreeFile[]): number {
  const directories = new Set<string>();

  for (const file of files) {
    const parts = toPathComparisonKey(file.path).split("/");

    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];

      if (part !== undefined && GENERATED_SEGMENTS.has(part)) {
        directories.add(parts.slice(0, index + 1).join("/"));
      }
    }
  }

  return directories.size;
}

function preferredReadme(
  files: readonly FetchedTextFile[],
): FetchedTextFile | undefined {
  return [...files]
    .filter((file) => isReadme(file.path))
    .sort((left, right) => {
      const leftRoot = directory(left.path) === "" ? 0 : 1;
      const rightRoot = directory(right.path) === "" ? 0 : 1;

      return (
        leftRoot - rightRoot ||
        toPathComparisonKey(left.path).localeCompare(
          toPathComparisonKey(right.path),
          "en-US",
        )
      );
    })[0];
}

interface DocumentedCommandFacts {
  run: boolean;
  build: boolean;
  test: boolean;
  staticCheck: boolean;
}

function commandToken(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/^\.\//u, "")
    .replace(/^["']|["'],?$/gu, "")
    .toLocaleLowerCase("en-US");
}

function commandFacts(tokens: readonly string[]): DocumentedCommandFacts {
  const executable = commandToken(tokens[0]).split("/").at(-1) ?? "";
  const arguments_ = tokens.slice(1).map(commandToken);
  const positional = arguments_.filter((token) => !token.startsWith("-"));
  const empty: DocumentedCommandFacts = {
    run: false,
    build: false,
    test: false,
    staticCheck: false,
  };

  if (["pytest", "unittest", "tox", "nox"].includes(executable)) {
    return { ...empty, test: true };
  }
  if (executable === "python" || executable === "python3") {
    if (arguments_[0] === "-m") {
      const module = arguments_[1];
      const moduleArguments = arguments_.slice(2);

      if (["pytest", "unittest", "tox", "nox"].includes(module ?? "")) {
        return { ...empty, test: true };
      }
      if (
        ["ruff", "mypy", "pyright", "flake8", "pylint"].includes(module ?? "")
      ) {
        return { ...empty, staticCheck: true };
      }
      if (module === "black" && moduleArguments.includes("--check")) {
        return { ...empty, staticCheck: true };
      }
      return empty;
    }
    const target = arguments_[0];

    return {
      ...empty,
      run:
        target !== undefined &&
        !target.startsWith("-") &&
        target !== "pip" &&
        target !== "pip3",
    };
  }
  if (["ruff", "mypy", "pyright", "flake8", "pylint"].includes(executable)) {
    return { ...empty, staticCheck: true };
  }
  if (executable === "black") {
    return { ...empty, staticCheck: arguments_.includes("--check") };
  }
  if (executable === "node") {
    const target = arguments_[0];

    return {
      ...empty,
      run: target !== undefined && !target.startsWith("-"),
      test: target === "--test",
    };
  }
  if (executable === "deno") {
    const action = positional[0];

    return {
      ...empty,
      run: action === "run",
      test: action === "test",
    };
  }

  if (["npm", "pnpm", "yarn", "bun"].includes(executable)) {
    const action = positional[0] === "run" ? positional[1] : positional[0];

    return {
      run: ["start", "dev", "serve"].includes(action ?? ""),
      build: action === "build",
      test: action === "test" || action?.startsWith("test:") === true,
      staticCheck: [
        "lint",
        "typecheck",
        "type-check",
        "check",
        "format:check",
      ].some((prefix) => action?.startsWith(prefix) === true),
    };
  }

  if (["go", "cargo", "dotnet", "swift"].includes(executable)) {
    const action = positional[0];

    return {
      run: action === "run",
      build: action === "build",
      test: action === "test",
      staticCheck: false,
    };
  }
  if (executable === "mvn") {
    return {
      run: positional.some((action) =>
        ["exec:java", "spring-boot:run"].includes(action),
      ),
      build: positional.some((action) =>
        ["compile", "package", "install"].includes(action),
      ),
      test: positional.includes("test"),
      staticCheck: false,
    };
  }
  if (["gradle", "gradlew"].includes(executable)) {
    return {
      run: positional.some((action) => ["run", "bootrun"].includes(action)),
      build: positional.some((action) =>
        ["build", "assemble", "compile"].includes(action),
      ),
      test: positional.includes("test"),
      staticCheck: positional.some((action) =>
        ["lint", "check"].includes(action),
      ),
    };
  }
  if (executable === "docker" || executable === "docker-compose") {
    const dockerArguments =
      executable === "docker" && positional[0] === "compose"
        ? positional.slice(1)
        : positional;
    const action = dockerArguments[0];

    return {
      run: ["run", "up", "start"].includes(action ?? ""),
      build: action === "build",
      test: false,
      staticCheck: false,
    };
  }
  if (["make", "just", "task"].includes(executable)) {
    const action = positional[0];

    return {
      run: ["run", "start", "serve"].includes(action ?? ""),
      build:
        action === undefined || ["build", "all", "install"].includes(action),
      test: action === "test",
      staticCheck: ["lint", "check", "typecheck"].includes(action ?? ""),
    };
  }

  return empty;
}

function documentedCommandFacts(
  invocations: readonly string[][],
): DocumentedCommandFacts {
  return invocations.reduce<DocumentedCommandFacts>(
    (combined, tokens) => {
      const facts = commandFacts(tokens);

      return {
        run: combined.run || facts.run,
        build: combined.build || facts.build,
        test: combined.test || facts.test,
        staticCheck: combined.staticCheck || facts.staticCheck,
      };
    },
    { run: false, build: false, test: false, staticCheck: false },
  );
}

function countMentionedTopLevelAreas(
  readme: string,
  files: readonly NormalizedTreeFile[],
): number {
  const topLevelAreas = new Set(
    files
      .map((file) => toPathComparisonKey(file.path).split("/"))
      .filter((parts) => parts.length > 1)
      .map((parts) => parts[0])
      .filter((part): part is string => part !== undefined),
  );
  const normalized = readme.normalize("NFKC").toLocaleLowerCase("en-US");

  return [...topLevelAreas].filter((area) => {
    const escaped = area.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

    return new RegExp(
      `(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`,
      "iu",
    ).test(normalized);
  }).length;
}

function combineStructured(
  target: StructuredManifestEvidence,
  source: StructuredManifestEvidence,
): void {
  for (const key of Object.keys(target) as Array<
    keyof StructuredManifestEvidence
  >) {
    target[key] ||= source[key];
  }
}

export function analyzeGeneralRepository(
  input: GeneralAnalysisInput,
): GeneralMetrics {
  const positiveTreeFiles = input.tree.files.filter(
    (file) => !isExcludedPath(file.path),
  );
  const positiveFetchedFiles = input.files.filter(
    (file) => !isExcludedPath(file.path),
  );
  const paths = positiveTreeFiles.map((file) => file.path);
  const pathKeys = paths.map(toPathComparisonKey);
  const readme = preferredReadme(positiveFetchedFiles);
  const markdown = findMarkdownEvidence(readme?.text ?? "");
  const structured = emptyStructuredEvidence();
  const parseFailures: GeneralMetrics["parseFailures"] = [];

  for (const file of [...positiveFetchedFiles].sort((left, right) =>
    toPathComparisonKey(left.path).localeCompare(
      toPathComparisonKey(right.path),
      "en-US",
    ),
  )) {
    const key = toPathComparisonKey(file.path);
    let result: StructuredReadResult | undefined;

    if (basename(key) === "package.json") {
      result = readPackageJsonEvidence(file.text);
    } else if (basename(key) === "pyproject.toml") {
      result = readPyprojectTomlEvidence(file.text);
    }

    if (result !== undefined) {
      combineStructured(structured, result.evidence);
      if (result.failure !== null) {
        parseFailures.push({ path: file.path, reason: result.failure });
      }
    }
  }

  const versionHistoryPaths = new Set(
    paths.filter(isVersionHistory).map(toPathComparisonKey),
  );
  const hasVersionHistory = positiveFetchedFiles.some(
    (file) =>
      versionHistoryPaths.has(toPathComparisonKey(file.path)) &&
      hasVersionHeading(file.text),
  );
  let testFileCount = 0;
  let supportedSourceFileCount = 0;

  for (const file of positiveTreeFiles) {
    const classification = classifyFile(file.path, file.size);
    const declarationOnly = /(?:\.d\.ts|\.pyi)$/iu.test(file.path);
    const generated = classification.skipReason === "excluded";

    if (classification.language !== "none" && !declarationOnly && !generated) {
      if (classification.isTest) {
        testFileCount += 1;
      } else {
        supportedSourceFileCount += 1;
      }
    }
  }

  const documented = documentedCommandFacts(markdown.invocations);
  const hasTreeTestConfiguration = paths.some(isTestConfig);

  return {
    hasReadme: paths.some(isReadme),
    installHeading: markdown.installHeading,
    installCommand: markdown.installCommand,
    usageHeading: markdown.usageHeading,
    usageCommand: markdown.usageCommand,
    usageConcreteExample: markdown.usageConcreteExample,
    usageCommandOrExample: markdown.usageCommandOrExample,
    usageProseDescription: markdown.usageProseDescription,
    hasContributing: paths.some(isContribution),
    hasLicenseFile: paths.some(isLicense),
    apiLicenseDetected:
      input.repository.licenseSpdxId !== null &&
      input.repository.licenseSpdxId.trim().length > 0 &&
      !["noassertion", "other"].includes(
        input.repository.licenseSpdxId.toLocaleLowerCase("en-US"),
      ),
    hasArchitectureEvidence:
      paths.some(isArchitecture) || markdown.architectureHeading,
    readmeTopLevelSourceAreaCount: countMentionedTopLevelAreas(
      readme?.text ?? "",
      positiveTreeFiles,
    ),
    hasManifest: paths.some(isManifestPath),
    hasStructuredEntryPoint: structured.hasStructuredEntryPoint,
    hasConventionalEntryPoint: positiveFetchedFiles.some(
      (file) =>
        isConventionalEntryPoint(file.path) &&
        !/(?:\.d\.ts|\.pyi)$/iu.test(file.path) &&
        file.language !== "none",
    ),
    hasRunCommand: structured.hasRunCommand,
    hasBuildCommand: structured.hasBuildCommand,
    hasDocumentedRunCommand: documented.run,
    hasDocumentedBuildCommand: documented.build,
    hasExample:
      positiveFetchedFiles.some((file) => isExamplePath(file.path)) ||
      markdown.usageConcreteExample,
    hasVersionHistory,
    hasManifestVersion: structured.hasManifestVersion,
    hasConfigurationEvidence:
      paths.some(isEnvironmentExample) || markdown.configurationHeading,
    testFileCount,
    supportedSourceFileCount,
    hasTestConfiguration:
      structured.hasTestConfiguration || hasTreeTestConfiguration,
    hasCi: paths.some(isCi),
    hasTestCommand: structured.hasTestCommand,
    hasDocumentedTestCommand: documented.test,
    hasStaticCheckCommand:
      structured.hasStaticCheckCommand || paths.some(isPythonStaticConfig),
    hasDocumentedStaticCheckCommand: documented.staticCheck,
    hasCoverageEvidence:
      structured.hasCoverageEvidence || paths.some(isCoverageConfig),
    hasLockfile: pathKeys.some(isLockfilePath),
    hasDependencyUpdates: paths.some(isDependencyUpdate),
    hasIssueOrPrTemplates: paths.some(isIssueOrPrTemplate),
    hasSecurityPolicy: paths.some(isSecurity),
    hasCodeOfConduct: paths.some(isCodeOfConduct),
    committedGeneratedDirectoryCount: generatedDirectoryCount(input.tree.files),
    parseFailures,
  };
}
