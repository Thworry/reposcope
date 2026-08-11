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
const TEST_TOOLS = new Set(["pytest", "unittest", "tox", "nox"]);
const STATIC_TOOLS = new Set([
  "ruff",
  "mypy",
  "pyright",
  "flake8",
  "pylint",
  "black",
]);

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

function nonEmptyValue(value: unknown): boolean {
  return (
    (typeof value === "string" && value.trim().length > 0) ||
    (isRecord(value) && Object.keys(value).length > 0)
  );
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
  const evidence: StructuredManifestEvidence = {
    hasStructuredEntryPoint: [
      "main",
      "module",
      "browser",
      "bin",
      "exports",
    ].some((field) => nonEmptyValue(parsed[field])),
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

function hasRecord(value: Record<string, unknown> | undefined): boolean {
  return value !== undefined && Object.keys(value).length > 0;
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
  const testConfiguration = ["pytest", "unittest", "tox", "nox"].some((key) =>
    hasRecord(childRecord(tool, key)),
  );
  const evidence: StructuredManifestEvidence = {
    hasStructuredEntryPoint: [
      childRecord(project, "scripts"),
      childRecord(project, "gui-scripts"),
      childRecord(projectEntryPoints, "console_scripts"),
      childRecord(poetry, "scripts"),
    ].some(hasRecord),
    hasRunCommand: false,
    hasBuildCommand: false,
    hasTestCommand: testConfiguration,
    hasStaticCheckCommand: [
      "ruff",
      "mypy",
      "pyright",
      "flake8",
      "pylint",
      "black",
    ].some((key) => hasRecord(childRecord(tool, key))),
    hasCoverageEvidence: hasRecord(childRecord(tool, "coverage")),
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

function invocationTool(tokens: readonly string[]): string | undefined {
  const first = tokens[0]?.replace(/^\.\//u, "").toLocaleLowerCase("en-US");

  if (first === "python" || first === "python3") {
    const moduleIndex = tokens.indexOf("-m");

    if (moduleIndex >= 0) {
      return tokens[moduleIndex + 1]?.toLocaleLowerCase("en-US");
    }
  }

  return first?.split("/").at(-1);
}

function documentedRun(invocations: readonly string[][]): boolean {
  return invocations.some((tokens) => {
    const tool = invocationTool(tokens);
    const argumentsText = tokens.slice(1).join(" ").toLocaleLowerCase("en-US");

    return (
      [
        "node",
        "deno",
        "python",
        "python3",
        "go",
        "cargo",
        "mvn",
        "gradle",
        "gradlew",
        "dotnet",
        "swift",
        "docker",
        "docker-compose",
      ].includes(tool ?? "") ||
      (["npm", "pnpm", "yarn", "bun"].includes(tool ?? "") &&
        /(?:^|\s)(?:run\s+)?(?:start|dev|serve)(?:\s|$)/u.test(argumentsText))
    );
  });
}

function documentedBuild(invocations: readonly string[][]): boolean {
  return invocations.some((tokens) => {
    const tool = invocationTool(tokens);
    const argumentsText = tokens.slice(1).join(" ").toLocaleLowerCase("en-US");

    return (
      [
        "make",
        "gradle",
        "gradlew",
        "mvn",
        "cargo",
        "go",
        "dotnet",
        "swift",
        "docker",
      ].includes(tool ?? "") ||
      (["npm", "pnpm", "yarn", "bun"].includes(tool ?? "") &&
        /(?:^|\s)(?:run\s+)?build(?:\s|$)/u.test(argumentsText))
    );
  });
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
  const paths = input.tree.files.map((file) => file.path);
  const pathKeys = paths.map(toPathComparisonKey);
  const readme = preferredReadme(input.files);
  const markdown = findMarkdownEvidence(readme?.text ?? "");
  const structured = emptyStructuredEvidence();
  const parseFailures: GeneralMetrics["parseFailures"] = [];

  for (const file of [...input.files].sort((left, right) =>
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
  const hasVersionHistory = input.files.some(
    (file) =>
      versionHistoryPaths.has(toPathComparisonKey(file.path)) &&
      hasVersionHeading(file.text),
  );
  let testFileCount = 0;
  let supportedSourceFileCount = 0;

  for (const file of input.tree.files) {
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

  const documentedTools = markdown.invocations.map(invocationTool);
  const hasDocumentedTestCommand = documentedTools.some((tool) =>
    TEST_TOOLS.has(tool ?? ""),
  );
  const hasDocumentedStaticCheckCommand = markdown.invocations.some(
    (tokens) => {
      const tool = invocationTool(tokens);

      return (
        STATIC_TOOLS.has(tool ?? "") &&
        (tool !== "black" || tokens.includes("--check"))
      );
    },
  );
  const hasTreeTestConfiguration = paths.some(isTestConfig);

  return {
    hasReadme: paths.some(isReadme),
    installHeading: markdown.installHeading,
    installCommand: markdown.installCommand,
    usageHeading: markdown.usageHeading,
    usageCommandOrExample: markdown.usageCommandOrExample,
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
      input.tree.files,
    ),
    hasManifest: paths.some(isManifestPath),
    hasStructuredEntryPoint: structured.hasStructuredEntryPoint,
    hasConventionalEntryPoint: input.files.some(
      (file) =>
        isConventionalEntryPoint(file.path) &&
        !/(?:\.d\.ts|\.pyi)$/iu.test(file.path) &&
        file.language !== "none",
    ),
    hasRunCommand: structured.hasRunCommand,
    hasBuildCommand: structured.hasBuildCommand,
    hasDocumentedRunCommand: documentedRun(markdown.invocations),
    hasDocumentedBuildCommand: documentedBuild(markdown.invocations),
    hasExample:
      input.files.some((file) => isExamplePath(file.path)) ||
      markdown.usageCommandOrExample,
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
    hasDocumentedTestCommand,
    hasStaticCheckCommand:
      structured.hasStaticCheckCommand || paths.some(isPythonStaticConfig),
    hasDocumentedStaticCheckCommand,
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
