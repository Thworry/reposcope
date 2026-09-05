import type { ReaderCommandKind } from "../../analysis/model";
import { toPathComparisonKey } from "../../scanner/file-registry";

const README_DOCUMENT_EXTENSIONS = Object.freeze([
  ".asciidoc",
  ".markdown",
  ".adoc",
  ".mdx",
  ".txt",
  ".rst",
  ".md",
] as const);

function containsUnsafeHeadingCodePoint(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0);

    if (
      point === undefined ||
      point <= 31 ||
      (point >= 127 && point <= 159) ||
      (point >= 0xd800 && point <= 0xdfff) ||
      point === 0x061c ||
      point === 0x200e ||
      point === 0x200f ||
      point === 0x2028 ||
      point === 0x2029 ||
      (point >= 0x202a && point <= 0x202e) ||
      (point >= 0x2066 && point <= 0x2069)
    ) {
      return true;
    }
  }

  return false;
}

/** Normalizes a safe README heading for exact lookup without changing display text. */
export function normalizeReadmeHeading(value: string): string {
  if (containsUnsafeHeadingCodePoint(value)) return "";
  let normalized = value.normalize("NFKC");
  if (containsUnsafeHeadingCodePoint(normalized)) return "";

  normalized = normalized
    .trim()
    .replace(/^#{1,6}\s+/u, "")
    .replace(/\s+#+\s*$/u, "")
    .replace(/[*_~]+/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

  for (let pass = 0; pass < 2; pass += 1) {
    normalized = normalized
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .replace(/^(?:\d{1,3})\s*[.)、:：-]\s*/u, "")
      .trimStart();
  }

  return normalized
    .replace(/[^\p{L}\p{N}]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function readmePathParts(path: string): {
  directory: string;
  stem: string;
} | null {
  const normalized = toPathComparisonKey(path.normalize("NFKC"));
  const slash = normalized.lastIndexOf("/");
  const directory = slash === -1 ? "" : normalized.slice(0, slash);
  const basename = slash === -1 ? normalized : normalized.slice(slash + 1);
  const extension = README_DOCUMENT_EXTENSIONS.find((candidate) =>
    basename.endsWith(candidate),
  );
  const stem =
    extension === undefined
      ? basename.includes(".")
        ? null
        : basename
      : basename.slice(0, -extension.length);

  return stem === null ? null : { directory, stem };
}

/** One stable README identity used by selection, extraction, and validation. */
export function isCanonicalReadmePath(path: string): boolean {
  const parts = readmePathParts(path);

  return (
    parts !== null &&
    (parts.directory === "" || parts.directory === ".github") &&
    (parts.stem === "readme" || /^readme[-_.]/u.test(parts.stem))
  );
}

/** Stable binary preference: root, exact README stem, normalized path, spelling. */
export function compareReadmePaths(left: string, right: string): number {
  const leftParts = readmePathParts(left);
  const rightParts = readmePathParts(right);
  const leftRoot = leftParts?.directory === "" ? 0 : 1;
  const rightRoot = rightParts?.directory === "" ? 0 : 1;
  const leftExact = leftParts?.stem === "readme" ? 0 : 1;
  const rightExact = rightParts?.stem === "readme" ? 0 : 1;
  const leftKey = toPathComparisonKey(left.normalize("NFKC"));
  const rightKey = toPathComparisonKey(right.normalize("NFKC"));

  return (
    leftRoot - rightRoot ||
    leftExact - rightExact ||
    (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0) ||
    (left < right ? -1 : left > right ? 1 : 0)
  );
}

export const README_PROFILE_CAPS = Object.freeze({
  overview: 4,
  audiences: 4,
  problems: 4,
  useCases: 4,
  capabilityGroups: 9,
  capabilityFacts: 6,
  workflow: 8,
  dependencies: 8,
  limitations: 6,
  maturity: 6,
} as const);

export const README_SECTION_HEADINGS = Object.freeze({
  overview: Object.freeze([
    "overview",
    "introduction",
    "about",
    "project overview",
    "project introduction",
    "project positioning",
    "简介",
    "项目介绍",
    "项目简介",
    "项目定位",
    "概述",
  ] as const),
  audiences: Object.freeze([
    "who is this for",
    "audience",
    "intended users",
    "target users",
    "适合谁",
    "适用人群",
    "目标用户",
  ] as const),
  problems: Object.freeze([
    "problem",
    "why",
    "motivation",
    "pain points",
    "problems solved",
    "解决的问题",
    "要解决的问题",
    "痛点",
    "为什么",
  ] as const),
  useCases: Object.freeze([
    "use cases",
    "typical use cases",
    "when to use",
    "scenarios",
    "business scenarios",
    "用途",
    "典型场景",
    "业务场景",
    "适用场景",
    "使用场景",
  ] as const),
  capabilities: Object.freeze([
    "features",
    "key features",
    "core features",
    "what it does",
    "what you can do",
    "capabilities",
    "功能",
    "特性",
    "核心能力",
    "主要功能",
    "功能概览",
    "现在已经能做什么",
  ] as const),
  workflow: Object.freeze([
    "workflow",
    "typical workflow",
    "usage workflow",
    "typical usage path",
    "user journey",
    "how it works",
    "core concepts",
    "流程",
    "工作流",
    "工作原理",
    "核心概念",
    "典型使用路径",
    "使用流程",
    "操作流程",
  ] as const),
  dependencies: Object.freeze([
    "requirements",
    "system requirements",
    "setup requirements",
    "prerequisites",
    "installation",
    "installation and setup",
    "deployment",
    "providers",
    "integrations",
    "configuration",
    "environment variables",
    "environment configuration",
    "environment variable configuration",
    "configure environment variables",
    "依赖",
    "环境要求",
    "环境变量",
    "环境配置",
    "环境变量配置",
    "配置环境变量",
    "前置条件",
    "安装",
    "安装与准备",
    "部署",
    "模型服务",
    "集成",
    "配置",
  ] as const),
  limitations: Object.freeze([
    "limitations",
    "caveats",
    "constraints",
    "known issues",
    "important notes",
    "disclaimer",
    "license",
    "licensing",
    "security",
    "security and privacy",
    "privacy",
    "risks",
    "data handling",
    "限制",
    "注意事项",
    "已知问题",
    "说明",
    "重要说明",
    "补充说明",
    "许可证",
    "许可协议",
    "安全",
    "安全与隐私",
    "隐私",
    "风险",
    "数据处理",
  ] as const),
  maturity: Object.freeze([
    "roadmap",
    "project roadmap",
    "current roadmap",
    "latest update",
    "latest updates",
    "recent updates",
    "updates",
    "status",
    "current status",
    "maintenance status",
    "migration",
    "preview",
    "beta",
    "路线图",
    "当前路线图",
    "最新更新",
    "最近更新",
    "更新记录",
    "项目状态",
    "当前状态",
    "维护状态",
    "迁移",
    "预览",
    "测试版",
  ] as const),
} as const);

export const README_COMMAND_SECTION_HEADINGS = Object.freeze({
  install: Object.freeze([
    "install",
    "installation",
    "install dependencies",
    "dependency installation",
    "installation guide",
    "download and install",
    "desktop installation",
    "setup",
    "安装",
    "安装依赖",
    "配置环境",
    "下载安装",
    "下载与安装",
    "安装方式",
    "安装指南",
    "客户端安装",
  ] as const),
  run: Object.freeze([
    "usage",
    "run",
    "start",
    "launch",
    "start development",
    "quick start",
    "quickstart",
    "getting started",
    "usage guide",
    "user guide",
    "tutorial",
    "使用",
    "运行",
    "启动",
    "启动开发环境",
    "开始使用",
    "快速开始",
    "快速上手",
    "使用教程",
    "使用方法",
    "用户指南",
    "操作指南",
    "新手入门",
  ] as const),
  develop: Object.freeze([
    "development",
    "develop",
    "developer guide",
    "local development",
    "开发",
    "开发指南",
    "本地开发",
    "二次开发",
  ] as const),
  test: Object.freeze(["test", "testing", "测试"] as const),
  build: Object.freeze(["build", "building", "构建"] as const),
} as const satisfies Readonly<Record<ReaderCommandKind, readonly string[]>>);

export const README_LEGACY_SECTION_HEADINGS = Object.freeze({
  scenarios: Object.freeze([
    "use cases",
    "who is this for",
    "examples",
    "business scenarios",
    "用途",
    "适用场景",
    "使用场景",
    "示例",
  ] as const),
  architecture: Object.freeze([
    "architecture",
    "technical architecture",
    "tech stack and architecture",
    "tech stack & architecture",
    "technology stack and architecture",
    "project structure",
    "repository structure",
    "design",
    "how it works",
    "internals",
    "架构",
    "技术栈与架构",
    "系统架构",
    "项目结构",
    "仓库结构",
    "设计",
    "工作原理",
    "实现原理",
  ] as const),
  securityPrivacy: Object.freeze([
    "security",
    "security and privacy",
    "privacy",
    "permissions",
    "data handling",
    "安全",
    "安全与隐私",
    "隐私",
    "权限",
    "数据处理",
  ] as const),
} as const);

export type ReadmeProfileSection = keyof typeof README_SECTION_HEADINGS;
export type ReadmeLegacySection = keyof typeof README_LEGACY_SECTION_HEADINGS;

const PROFILE_HEADING_LOOKUP = new Map<string, ReadmeProfileSection>();
const COMMAND_HEADING_LOOKUP = new Map<string, ReaderCommandKind>();
const LEGACY_HEADING_LOOKUP = new Map<string, ReadmeLegacySection>();

const PROFILE_HEADING_ALIASES = {
  "feature preview": "capabilities",
  "feature overview": "capabilities",
  "feature highlights": "capabilities",
  功能预览: "capabilities",
  功能演示: "capabilities",
  功能介绍: "capabilities",
  功能详解: "capabilities",
  "desktop edition": "dependencies",
  "desktop app": "dependencies",
  桌面版: "dependencies",
  客户端: "dependencies",
} as const satisfies Readonly<Record<string, ReadmeProfileSection>>;

for (const [section, headings] of Object.entries(
  README_SECTION_HEADINGS,
) as Array<[ReadmeProfileSection, readonly string[]]>) {
  for (const heading of headings) {
    PROFILE_HEADING_LOOKUP.set(normalizeReadmeHeading(heading), section);
  }
}
PROFILE_HEADING_LOOKUP.set("problems", "problems");
for (const [heading, section] of Object.entries(PROFILE_HEADING_ALIASES)) {
  PROFILE_HEADING_LOOKUP.set(heading, section);
}

for (const [kind, headings] of Object.entries(
  README_COMMAND_SECTION_HEADINGS,
) as Array<[ReaderCommandKind, readonly string[]]>) {
  for (const heading of headings) {
    COMMAND_HEADING_LOOKUP.set(normalizeReadmeHeading(heading), kind);
  }
}

for (const [section, headings] of Object.entries(
  README_LEGACY_SECTION_HEADINGS,
) as Array<[ReadmeLegacySection, readonly string[]]>) {
  for (const heading of headings) {
    LEGACY_HEADING_LOOKUP.set(normalizeReadmeHeading(heading), section);
  }
}

export function readmeProfileSection(
  normalizedHeading: string,
): ReadmeProfileSection | null {
  const heading = normalizeReadmeHeading(normalizedHeading);
  const section = PROFILE_HEADING_LOOKUP.get(heading);
  if (section !== undefined) return section;

  // Human onboarding chapters include explanations alongside shell commands.
  // Keep those explanations even when the chapter only has a command alias.
  const commandKind = COMMAND_HEADING_LOOKUP.get(heading);
  if (commandKind === "install") return "dependencies";
  if (commandKind === "run" || commandKind === "develop") return "workflow";
  return null;
}

export function readmeCommandKind(
  normalizedHeading: string,
): ReaderCommandKind | null {
  return (
    COMMAND_HEADING_LOOKUP.get(normalizeReadmeHeading(normalizedHeading)) ??
    null
  );
}

export function readmeLegacySection(
  normalizedHeading: string,
): ReadmeLegacySection | null {
  return (
    LEGACY_HEADING_LOOKUP.get(normalizeReadmeHeading(normalizedHeading)) ?? null
  );
}
