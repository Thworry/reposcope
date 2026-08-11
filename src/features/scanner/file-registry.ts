import type {
  FileCategory,
  FileClassification,
  SourceLanguage,
} from "../analysis/model";

export const DEEP_SOURCE_EXTENSIONS = Object.freeze([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".py",
] as const);

export const RECOGNIZED_SOURCE_EXTENSIONS = Object.freeze([
  ...DEEP_SOURCE_EXTENSIONS,
  ".go",
  ".rs",
  ".c",
  ".h",
  ".cc",
  ".cpp",
  ".cxx",
  ".hpp",
  ".java",
  ".kt",
  ".kts",
  ".cs",
  ".fs",
  ".fsx",
  ".rb",
  ".php",
  ".swift",
  ".dart",
  ".scala",
  ".sc",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".lua",
  ".r",
  ".R",
  ".ex",
  ".exs",
  ".erl",
  ".hrl",
  ".clj",
  ".cljs",
  ".hs",
  ".lhs",
  ".vue",
  ".svelte",
  ".astro",
] as const);

export const DOCUMENTATION_EXTENSIONS = Object.freeze([
  ".md",
  ".mdx",
  ".markdown",
  ".txt",
  ".rst",
  ".adoc",
  ".asciidoc",
] as const);

export const EXCLUDED_PATH_SEGMENTS = Object.freeze([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "vendor",
  "third_party",
  "dist",
  "build",
  "out",
  "coverage",
  ".coverage",
  ".cache",
  ".next",
  ".nuxt",
  "target",
  "bin",
  "obj",
  "__pycache__",
  ".venv",
  "venv",
] as const);

const VERSION_CONTROL_PATH_SEGMENTS = new Set<string>([".git", ".hg", ".svn"]);
const GENERATED_PATH_SEGMENTS = new Set<string>(
  EXCLUDED_PATH_SEGMENTS.filter(
    (segment) => !VERSION_CONTROL_PATH_SEGMENTS.has(segment),
  ),
);

export const PACKAGE_MANIFEST_BASENAMES = Object.freeze([
  "package.json",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "Pipfile",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "Gemfile",
  "Package.swift",
  "pubspec.yaml",
  "CMakeLists.txt",
  "Makefile",
  "Taskfile.yml",
  "Taskfile.yaml",
  "justfile",
] as const);

export const LOCKFILE_BASENAMES = Object.freeze([
  "pnpm-lock.yaml",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "uv.lock",
  "poetry.lock",
  "Pipfile.lock",
  "Cargo.lock",
  "go.sum",
  "composer.lock",
  "Gemfile.lock",
  "Package.resolved",
] as const);

export const CI_PATHS = Object.freeze([
  ".gitlab-ci.yml",
  ".circleci/config.yml",
  "azure-pipelines.yml",
  "Jenkinsfile",
  ".travis.yml",
  "bitbucket-pipelines.yml",
  "appveyor.yml",
] as const);

export const DEPENDENCY_UPDATE_PATHS = Object.freeze([
  ".github/dependabot.yml",
  ".github/dependabot.yaml",
  "renovate.json",
  "renovate.json5",
  ".renovaterc",
  ".renovaterc.json",
  ".renovaterc.json5",
] as const);

export const ISSUE_AND_PR_TEMPLATE_PATHS = Object.freeze([
  ".github/ISSUE_TEMPLATE/",
  ".github/PULL_REQUEST_TEMPLATE/",
  ".github/pull_request_template.md",
] as const);

export const COVERAGE_CONFIG_BASENAMES = Object.freeze([
  ".coveragerc",
  "coverage.xml",
  "codecov.yml",
  "codecov.yaml",
  ".codecov.yml",
  ".codecov.yaml",
] as const);

export const COVERAGE_CONFIG_PREFIXES = Object.freeze([
  "jest.config.",
  "vitest.config.",
  "nyc.config.",
] as const);

export const ENVIRONMENT_EXAMPLE_BASENAMES = Object.freeze([
  ".env.example",
  ".env.sample",
] as const);

export const ENVIRONMENT_EXAMPLE_PATTERNS = Object.freeze([
  "config.example.*",
  "config.sample.*",
  "example.config.*",
  "sample.config.*",
] as const);

function frozenDocumentRule(
  scopes: readonly string[],
  prefixes: readonly string[],
  match: "begins" | "exact" = "begins",
) {
  return Object.freeze({
    scopes: Object.freeze(scopes),
    prefixes: Object.freeze(prefixes),
    match,
  });
}

export const PRIORITY_DOCUMENT_RULES = Object.freeze({
  readme: frozenDocumentRule(["", ".github"], ["readme"]),
  license: frozenDocumentRule([""], ["license", "licence", "copying"]),
  contribution: frozenDocumentRule(["", ".github", "docs"], ["contributing"]),
  security: frozenDocumentRule(["", ".github", "docs"], ["security"], "exact"),
  codeOfConduct: frozenDocumentRule(
    ["", ".github", "docs"],
    ["code_of_conduct"],
  ),
  versionHistory: frozenDocumentRule(
    ["", "docs"],
    ["changelog", "changes", "history", "releases"],
  ),
  architecture: frozenDocumentRule(["", "docs"], ["architecture"]),
  setup: frozenDocumentRule(
    ["", "docs"],
    ["install", "installation", "setup", "getting_started", "quickstart"],
  ),
});

export const HEADING_PHRASES = Object.freeze({
  installation: Object.freeze({
    en: Object.freeze([
      "install",
      "installation",
      "setup",
      "getting started",
      "quick start",
      "prerequisites",
    ]),
    "zh-CN": Object.freeze([
      "安装",
      "配置环境",
      "环境要求",
      "准备工作",
      "快速开始",
    ]),
  }),
  usage: Object.freeze({
    en: Object.freeze([
      "usage",
      "use",
      "run",
      "running",
      "example",
      "examples",
      "quick start",
    ]),
    "zh-CN": Object.freeze(["使用", "用法", "运行", "示例", "快速开始"]),
  }),
  architecture: Object.freeze({
    en: Object.freeze([
      "architecture",
      "structure",
      "project layout",
      "repository layout",
      "codebase",
      "code map",
    ]),
    "zh-CN": Object.freeze([
      "架构",
      "结构",
      "项目结构",
      "目录结构",
      "代码结构",
      "代码地图",
    ]),
  }),
  configuration: Object.freeze({
    en: Object.freeze([
      "configuration",
      "config",
      "environment variables",
      "settings",
    ]),
    "zh-CN": Object.freeze(["配置", "环境变量", "设置"]),
  }),
});

export const COMMAND_EXECUTABLES = Object.freeze([
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "node",
  "deno",
  "python",
  "python3",
  "pip",
  "pip3",
  "uv",
  "poetry",
  "pytest",
  "tox",
  "make",
  "just",
  "task",
  "go",
  "cargo",
  "mvn",
  "gradle",
  "gradlew",
  "dotnet",
  "swift",
  "docker",
  "docker-compose",
] as const);

const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".a",
  ".apk",
  ".avi",
  ".bin",
  ".bmp",
  ".bz2",
  ".class",
  ".db",
  ".dll",
  ".dmg",
  ".doc",
  ".docx",
  ".dylib",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".lockb",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".obj",
  ".otf",
  ".pdf",
  ".png",
  ".pyc",
  ".rar",
  ".so",
  ".sqlite",
  ".sqlite3",
  ".svgz",
  ".tar",
  ".tgz",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".xz",
  ".zip",
]);

const MANIFEST_NAMES = new Set<string>(
  PACKAGE_MANIFEST_BASENAMES.map((name) => name.toLowerCase()),
);
const LOCKFILE_NAMES = new Set<string>(
  LOCKFILE_BASENAMES.map((name) => name.toLowerCase()),
);
const CI_NAMES = new Set<string>(
  CI_PATHS.map((path) => toPathComparisonKey(path)),
);
const DEPENDENCY_UPDATE_NAMES = new Set<string>(DEPENDENCY_UPDATE_PATHS);
const ISSUE_AND_PR_TEMPLATE_KEYS = ISSUE_AND_PR_TEMPLATE_PATHS.map((path) =>
  toPathComparisonKey(path),
);
const DOCUMENTATION_EXTENSION_SET = new Set<string>(DOCUMENTATION_EXTENSIONS);
const EXCLUDED_SEGMENT_SET = new Set<string>(EXCLUDED_PATH_SEGMENTS);
const JS_EXTENSIONS = new Set<string>([".js", ".jsx", ".mjs", ".cjs"]);
const TS_EXTENSIONS = new Set<string>([".ts", ".tsx", ".mts", ".cts"]);
const RECOGNIZED_EXTENSION_SET = new Set<string>(
  RECOGNIZED_SOURCE_EXTENSIONS.map((extension) => extension.toLowerCase()),
);
const TEST_SEGMENTS = new Set<string>([
  "test",
  "tests",
  "__tests__",
  "spec",
  "specs",
]);
const MAX_FILE_BYTES = 256 * 1024;

function lowerParts(path: string): string[] {
  return toPathComparisonKey(path).split("/");
}

export function toPathComparisonKey(path: string): string {
  return path.toLowerCase();
}

function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function extensionOf(path: string): string {
  const basename = basenameOf(path);
  const dot = basename.lastIndexOf(".");

  return dot <= 0 ? "" : basename.slice(dot).toLowerCase();
}

function documentStem(basename: string): string | null {
  const extension = DOCUMENTATION_EXTENSIONS.find((candidate) =>
    basename.endsWith(candidate),
  );

  if (extension !== undefined) {
    return basename.slice(0, -extension.length);
  }

  return basename.includes(".") ? null : basename;
}

function isScopedDocument(
  path: string,
  scopes: readonly string[],
  prefixes: readonly string[],
  match: "begins" | "exact",
): boolean {
  const parts = lowerParts(path);
  const basename = parts.at(-1) ?? "";
  const directory = parts.slice(0, -1).join("/");
  const stem = documentStem(basename);

  return (
    stem !== null &&
    scopes.includes(directory) &&
    prefixes.some((prefix) =>
      match === "exact" ? stem === prefix : stem.startsWith(prefix),
    )
  );
}

export function isPriorityDocumentation(path: string): boolean {
  const lower = toPathComparisonKey(path);

  return Object.values(PRIORITY_DOCUMENT_RULES).some((rule) =>
    isScopedDocument(lower, rule.scopes, rule.prefixes, rule.match),
  );
}

export function isManifestPath(path: string): boolean {
  const lower = toPathComparisonKey(path);
  const basename = basenameOf(lower);

  if (MANIFEST_NAMES.has(basename)) {
    return true;
  }

  return (
    !lower.includes("/") &&
    (basename.endsWith(".csproj") || basename.endsWith(".sln"))
  );
}

export function isLockfilePath(path: string): boolean {
  return LOCKFILE_NAMES.has(basenameOf(toPathComparisonKey(path)));
}

export function isConfigurationPath(path: string): boolean {
  const lower = toPathComparisonKey(path);
  const basename = basenameOf(lower);

  return (
    (lower.startsWith(".github/workflows/") &&
      (lower.endsWith(".yml") || lower.endsWith(".yaml"))) ||
    CI_NAMES.has(lower) ||
    DEPENDENCY_UPDATE_NAMES.has(lower) ||
    ISSUE_AND_PR_TEMPLATE_KEYS.some((candidate) =>
      candidate.endsWith("/")
        ? lower.startsWith(candidate)
        : lower === candidate,
    ) ||
    COVERAGE_CONFIG_BASENAMES.some((candidate) => candidate === basename) ||
    COVERAGE_CONFIG_PREFIXES.some((prefix) => basename.startsWith(prefix)) ||
    ENVIRONMENT_EXAMPLE_BASENAMES.some((candidate) => candidate === basename) ||
    /^(?:config\.(?:example|sample)|(?:example|sample)\.config)\./u.test(
      basename,
    ) ||
    /^(?:eslint|prettier|babel|rollup|webpack|vite|vitest|jest|karma|ava)\.config\./u.test(
      basename,
    ) ||
    /^(?:tsconfig|jsconfig)(?:\.[^.]+)*\.json$/u.test(basename) ||
    [
      "pytest.ini",
      "tox.ini",
      "noxfile.py",
      "mypy.ini",
      ".flake8",
      "ruff.toml",
      ".ruff.toml",
      "pyrightconfig.json",
      "dockerfile",
      "procfile",
      "vercel.json",
      "netlify.toml",
    ].includes(basename) ||
    /^(?:docker-compose|compose)(?:\.[^.]+)?\.ya?ml$/u.test(basename)
  );
}

export function isExcludedPath(path: string): boolean {
  return lowerParts(path).some((segment) => EXCLUDED_SEGMENT_SET.has(segment));
}

function generatedTreeEvidence(
  path: string,
): "generated-directory" | undefined {
  return lowerParts(path).some((segment) =>
    GENERATED_PATH_SEGMENTS.has(segment),
  )
    ? "generated-directory"
    : undefined;
}

function sourceLanguage(path: string): SourceLanguage {
  const lower = toPathComparisonKey(path);
  const extension = extensionOf(lower);

  if (lower.endsWith(".pyi") || extension === ".py") {
    return "python";
  }

  if (TS_EXTENSIONS.has(extension)) {
    return "typescript";
  }

  if (JS_EXTENSIONS.has(extension)) {
    return "javascript";
  }

  return RECOGNIZED_EXTENSION_SET.has(extension)
    ? "recognized-unsupported"
    : "none";
}

function isTestPath(path: string, language: SourceLanguage): boolean {
  const lower = toPathComparisonKey(path);
  const parts = lower.split("/");
  const basename = parts.at(-1) ?? "";

  if (parts.slice(0, -1).some((segment) => TEST_SEGMENTS.has(segment))) {
    return true;
  }

  if (
    (language === "javascript" || language === "typescript") &&
    (basename.includes(".test.") || basename.includes(".spec."))
  ) {
    return true;
  }

  return (
    language === "python" &&
    (/^test_.+\.py$/u.test(basename) || /.+_test\.py$/u.test(basename))
  );
}

function baseClassification(
  language: SourceLanguage,
  category: FileCategory,
  deep: boolean,
  isTest: boolean,
): FileClassification {
  return { eligible: true, language, category, deep, isTest };
}

export function classifyFile(path: string, size: number): FileClassification {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error("Invalid file size");
  }

  const lower = toPathComparisonKey(path);
  const extension = extensionOf(lower);
  const language = sourceLanguage(path);
  const isTest = isTestPath(path, language);
  const sourceCategory: FileCategory = isTest ? "test" : "source";

  if (isExcludedPath(path)) {
    const treeEvidence = generatedTreeEvidence(path);

    return {
      eligible: false,
      language,
      category: sourceCategory,
      deep: false,
      isTest,
      ...(treeEvidence === undefined ? {} : { treeEvidence }),
      skipReason: "excluded",
    };
  }

  const basename = basenameOf(lower);
  const minifiedExtension = extensionOf(lower);
  const minifiedStem = basename.slice(0, -minifiedExtension.length);
  const isRecognizedTextExtension =
    RECOGNIZED_EXTENSION_SET.has(minifiedExtension) ||
    DOCUMENTATION_EXTENSION_SET.has(minifiedExtension) ||
    minifiedExtension === ".pyi";

  if (isRecognizedTextExtension && /.+(?:[._-])min$/u.test(minifiedStem)) {
    return {
      eligible: false,
      language,
      category: sourceCategory,
      deep: false,
      isTest,
      skipReason: "excluded",
    };
  }

  if (isLockfilePath(path)) {
    return {
      eligible: false,
      language: "none",
      category: "configuration",
      deep: false,
      isTest: false,
      treeEvidence: "lockfile",
      skipReason: "excluded",
    };
  }

  if (lower.endsWith(".map") || BINARY_EXTENSIONS.has(extension)) {
    return {
      eligible: false,
      language: "none",
      category: "configuration",
      deep: false,
      isTest: false,
      skipReason: "binary",
    };
  }

  let classification: FileClassification;

  if (isManifestPath(path)) {
    classification = baseClassification("none", "manifest", false, false);
  } else if (isConfigurationPath(path)) {
    classification = baseClassification("none", "configuration", false, false);
  } else if (isPriorityDocumentation(path)) {
    classification = baseClassification("none", "documentation", false, false);
  } else if (language === "recognized-unsupported") {
    classification = {
      eligible: false,
      language,
      category: sourceCategory,
      deep: false,
      isTest,
      skipReason: "unsupported",
    };
  } else if (language !== "none") {
    const declarationOnly = lower.endsWith(".d.ts") || lower.endsWith(".pyi");
    classification = baseClassification(
      language,
      sourceCategory,
      !declarationOnly,
      isTest,
    );
  } else if (DOCUMENTATION_EXTENSION_SET.has(extension)) {
    classification = baseClassification("none", "documentation", false, false);
  } else {
    classification = {
      eligible: false,
      language: "none",
      category: "configuration",
      deep: false,
      isTest: false,
      skipReason: "unsupported",
    };
  }

  if (classification.eligible && size > MAX_FILE_BYTES) {
    return {
      ...classification,
      eligible: false,
      skipReason: "oversized",
    };
  }

  return classification;
}

export function isConventionalEntryPoint(path: string): boolean {
  const lower = toPathComparisonKey(path);
  const basename = basenameOf(lower);
  const stem = basename.replace(/(?:\.d)?\.[^.]+$/u, "");
  const topLevel = !lower.includes("/");

  if (lower.endsWith(".py") || lower.endsWith(".pyi")) {
    return (
      basename === "__main__.py" ||
      (topLevel && ["main", "app", "cli"].includes(stem))
    );
  }

  return ["index", "main", "app", "server", "cli"].includes(stem);
}
