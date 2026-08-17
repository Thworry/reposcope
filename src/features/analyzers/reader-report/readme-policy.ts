import type { ReaderCommandKind } from "../../analysis/model";

export const README_PROFILE_CAPS = Object.freeze({
  overview: 4,
  audiences: 4,
  problems: 4,
  useCases: 4,
  capabilityGroups: 6,
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
    "简介",
    "项目介绍",
    "概述",
  ] as const),
  audiences: Object.freeze([
    "who is this for",
    "audience",
    "适合谁",
    "目标用户",
  ] as const),
  problems: Object.freeze([
    "problem",
    "why",
    "motivation",
    "解决的问题",
    "为什么",
  ] as const),
  useCases: Object.freeze([
    "use cases",
    "business scenarios",
    "用途",
    "适用场景",
    "使用场景",
  ] as const),
  capabilities: Object.freeze([
    "features",
    "capabilities",
    "功能",
    "特性",
    "核心能力",
  ] as const),
  workflow: Object.freeze([
    "workflow",
    "how it works",
    "core concepts",
    "流程",
    "工作流",
    "工作原理",
    "核心概念",
  ] as const),
  dependencies: Object.freeze([
    "requirements",
    "prerequisites",
    "installation",
    "deployment",
    "providers",
    "integrations",
    "configuration",
    "依赖",
    "环境要求",
    "安装",
    "部署",
    "模型服务",
    "集成",
    "配置",
  ] as const),
  limitations: Object.freeze([
    "limitations",
    "known issues",
    "security",
    "privacy",
    "data handling",
    "限制",
    "已知问题",
    "安全",
    "隐私",
    "数据处理",
  ] as const),
  maturity: Object.freeze([
    "roadmap",
    "status",
    "migration",
    "preview",
    "beta",
    "路线图",
    "项目状态",
    "迁移",
    "预览",
    "测试版",
  ] as const),
} as const);

export const README_COMMAND_SECTION_HEADINGS = Object.freeze({
  install: Object.freeze([
    "install",
    "installation",
    "setup",
    "安装",
    "配置环境",
  ] as const),
  run: Object.freeze([
    "usage",
    "run",
    "quick start",
    "使用",
    "运行",
    "快速开始",
  ] as const),
  develop: Object.freeze([
    "development",
    "develop",
    "开发",
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
    "design",
    "how it works",
    "internals",
    "架构",
    "设计",
    "工作原理",
    "实现原理",
  ] as const),
  securityPrivacy: Object.freeze([
    "security",
    "privacy",
    "permissions",
    "data handling",
    "安全",
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

for (const [section, headings] of Object.entries(
  README_SECTION_HEADINGS,
) as Array<[ReadmeProfileSection, readonly string[]]>) {
  for (const heading of headings) PROFILE_HEADING_LOOKUP.set(heading, section);
}
PROFILE_HEADING_LOOKUP.set("problems", "problems");

for (const [kind, headings] of Object.entries(
  README_COMMAND_SECTION_HEADINGS,
) as Array<[ReaderCommandKind, readonly string[]]>) {
  for (const heading of headings) COMMAND_HEADING_LOOKUP.set(heading, kind);
}

for (const [section, headings] of Object.entries(
  README_LEGACY_SECTION_HEADINGS,
) as Array<[ReadmeLegacySection, readonly string[]]>) {
  for (const heading of headings) LEGACY_HEADING_LOOKUP.set(heading, section);
}

export function readmeProfileSection(
  normalizedHeading: string,
): ReadmeProfileSection | null {
  return PROFILE_HEADING_LOOKUP.get(normalizedHeading) ?? null;
}

export function readmeCommandKind(
  normalizedHeading: string,
): ReaderCommandKind | null {
  return COMMAND_HEADING_LOOKUP.get(normalizedHeading) ?? null;
}

export function readmeLegacySection(
  normalizedHeading: string,
): ReadmeLegacySection | null {
  return LEGACY_HEADING_LOOKUP.get(normalizedHeading) ?? null;
}
