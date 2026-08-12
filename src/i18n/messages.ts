import type { Language } from "../features/analysis/model";
import type { RuleId } from "../features/rules/rules";

const baseEn = {
  brand: "RepoScope 项目透视",
  tagline: "See a public project's quality, complexity, and room to improve.",
  heroTitle: "Inspect a public project before you depend on it.",
  landingIndex: "PUBLIC REPOSITORY INSPECTION",
  english: "English",
  simplifiedChinese: "简体中文",
  languageSwitcher: "Language",
  skipToContent: "Skip to inspection",
  privacy:
    "Read-only. No login or token. Your device downloads public data from GitHub and analyzes it in this browser; the publisher's computer is not involved.",
  privacyMark: "DEVICE / GITHUB",
  main: "RepoScope project analysis",
  repositoryLabel: "Public GitHub repository URL",
  repositoryHelper:
    "Use a public github.com URL with exactly an owner and repository.",
  repositoryError:
    "Enter a public GitHub repository URL like https://github.com/owner/repository.",
  analyzeRepository: "Analyze repository",
  analysisRunning: "Analysis running",
  examplesLabel: "Try a public example",
  methodology: "Read methodology 1.0.0",
  methodologyIndex: "VERSIONED METHOD",
  methodologyHeading: "Methodology 1.0.0",
  methodologyIntro:
    "RepoScope applies a deterministic ruleset to public GitHub evidence. Its six dimensions are documentation (15), operability (20), readability (20), complexity (20), testing (15), and maintenance (10).",
  methodologyScope:
    "Every repository receives a general inspection. JavaScript, TypeScript, and Python can also receive deep parser metrics; unsupported languages retain general results with lower confidence.",
  methodologySampling:
    "A scan pins one commit, ranks eligible text deterministically, and stops at 200 files, 10 MiB of decoded text, or 256 KiB for one file.",
  methodologyExclusions:
    "Binary, minified, vendored, generated, dependency, build, coverage, cache, and version-control paths are excluded.",
  methodologyBoundary:
    "Repository source is untrusted text and is never executed. No login, token, backend, AI service, analytics, or publisher computer participates.",
  methodologyLimitations:
    "Scores describe detected evidence and sampled coverage. Heuristics and approximate duplication do not prove that software works, is secure, or is safe to adopt.",
  scanIndex: "LIVE INSPECTION",
  scanHeading: "Repository scan in progress",
  scanProgressLabel: "Repository scan progress",
  cancelAnalysis: "Cancel analysis",
  progressFiles: "{completed} of {total} files",
  progressBytes: "{completed} of {total}",
  progressWorking:
    "Working through this phase. No estimated progress is fabricated.",
  statusStarting: "Starting repository analysis",
  statusComplete: "Repository analysis complete",
  statusError: "Repository analysis could not be completed",
  "phase.validating": "Validate repository URL",
  "phase.repository": "Fetch repository structure",
  "phase.selecting": "Plan inspection scope",
  "phase.fetching": "Download public text",
  "phase.analyzing": "Parse and score",
} as const;

const baseZh = {
  brand: "RepoScope 项目透视",
  tagline: "看懂一个公开项目的质量、复杂度与改进空间。",
  heroTitle: "在依赖一个公开项目之前，先看清它。",
  landingIndex: "公开项目检验",
  english: "English",
  simplifiedChinese: "简体中文",
  languageSwitcher: "语言",
  skipToContent: "跳到项目检验",
  privacy:
    "只读，无需登录或令牌。你的设备直接从 GitHub 下载公开数据并在此浏览器中分析；发布者的电脑不会参与。",
  privacyMark: "设备 / GITHUB",
  main: "RepoScope 项目分析",
  repositoryLabel: "公开 GitHub 项目网址",
  repositoryHelper: "请使用仅包含所有者和项目名的公开 github.com 网址。",
  repositoryError:
    "请输入公开 GitHub 项目网址，例如 https://github.com/owner/repository。",
  analyzeRepository: "分析项目",
  analysisRunning: "正在分析",
  examplesLabel: "试用公开示例",
  methodology: "查看方法说明 1.0.0",
  methodologyIndex: "版本化方法",
  methodologyHeading: "方法说明 1.0.0",
  methodologyIntro:
    "RepoScope 使用确定性的版本化规则检查公开 GitHub 证据。六个维度分别为文档（15）、可运行性证据（20）、可读性（20）、复杂度（20）、测试（15）和维护健康度（10）。",
  methodologyScope:
    "所有项目都会接受通用检查；JavaScript、TypeScript 和 Python 还可获得深度解析指标。不支持的语言会保留通用结果，并降低置信度。",
  methodologySampling:
    "检查会固定到一个提交，按确定性顺序选择文本，并在 200 个文件、10 MiB 解码文本或单文件 256 KiB 的边界停止。",
  methodologyExclusions:
    "二进制、压缩、供应商、生成、依赖、构建、覆盖率、缓存和版本控制路径会被排除。",
  methodologyBoundary:
    "项目源码始终被视为不可信文本且绝不执行；无需登录、令牌、后端或 AI 服务，也不使用分析统计或发布者的电脑。",
  methodologyLimitations:
    "评分只描述已检测证据和抽样覆盖。启发式指标与近似重复率不能证明软件可运行、安全或值得采用。",
  scanIndex: "实时检验",
  scanHeading: "正在检查项目",
  scanProgressLabel: "项目检查进度",
  cancelAnalysis: "取消分析",
  progressFiles: "{completed}/{total} 个文件",
  progressBytes: "{completed}/{total}",
  progressWorking: "正在处理此阶段；不会虚构预计进度。",
  statusStarting: "开始分析项目",
  statusComplete: "项目分析完成",
  statusError: "项目分析未能完成",
  "phase.validating": "验证项目网址",
  "phase.repository": "获取项目结构",
  "phase.selecting": "规划检查范围",
  "phase.fetching": "下载公开文本",
  "phase.analyzing": "解析并评分",
} as const satisfies Record<keyof typeof baseEn, string>;

interface BilingualTemplate {
  en: string;
  zh: string;
}

interface RuleCopy {
  evidence: BilingualTemplate;
  recommendation: BilingualTemplate;
}

const ruleCopy = {
  "documentation.readme": {
    evidence: {
      en: "Preferred README present: {exists}.",
      zh: "首选 README 是否存在：{exists}。",
    },
    recommendation: {
      en: "Add a clear README at the repository root or in .github.",
      zh: "在仓库根目录或 .github 中添加清晰的 README。",
    },
  },
  "documentation.installation": {
    evidence: {
      en: "Installation heading: {heading}; runnable command: {command}.",
      zh: "安装标题：{heading}；可运行命令：{command}。",
    },
    recommendation: {
      en: "Document setup under an installation heading and include a runnable command.",
      zh: "在安装标题下说明配置步骤，并提供可运行命令。",
    },
  },
  "documentation.usage": {
    evidence: {
      en: "Usage heading: {heading}; command or concrete example: {concrete}.",
      zh: "使用标题：{heading}；命令或具体示例：{concrete}。",
    },
    recommendation: {
      en: "Add a usage section with a command or concrete example.",
      zh: "添加使用章节，并提供命令或具体示例。",
    },
  },
  "documentation.contributing": {
    evidence: {
      en: "Contribution guide present: {exists}.",
      zh: "贡献指南是否存在：{exists}。",
    },
    recommendation: {
      en: "Add a CONTRIBUTING guide with a practical contributor path.",
      zh: "添加 CONTRIBUTING 指南，说明实际贡献流程。",
    },
  },
  "documentation.license": {
    evidence: {
      en: "License file: {file}; API license metadata: {metadata}.",
      zh: "许可证文件：{file}；API 许可证元数据：{metadata}。",
    },
    recommendation: {
      en: "Add a recognized license file that states the project terms.",
      zh: "添加受识别的许可证文件，明确项目条款。",
    },
  },
  "documentation.architecture": {
    evidence: {
      en: "Explicit architecture evidence: {explicit}; named source areas: {areaCount}.",
      zh: "明确的架构说明：{explicit}；已命名源码区域：{areaCount}。",
    },
    recommendation: {
      en: "Explain the architecture, code map, or at least three top-level source areas.",
      zh: "说明架构、代码地图，或至少三个顶层源码区域。",
    },
  },
  "operability.manifest": {
    evidence: {
      en: "Recognized package or build manifest present: {exists}.",
      zh: "是否存在受识别的包或构建清单：{exists}。",
    },
    recommendation: {
      en: "Add the standard package or build manifest for the project stack.",
      zh: "为项目技术栈添加标准包或构建清单。",
    },
  },
  "operability.entry-point": {
    evidence: {
      en: "Structured entry point: {structured}; conventional entry path: {conventional}.",
      zh: "结构化入口：{structured}；约定入口路径：{conventional}。",
    },
    recommendation: {
      en: "Declare an application, CLI, or library entry point in the manifest.",
      zh: "在清单中声明应用、命令行或库入口。",
    },
  },
  "operability.run-build": {
    evidence: {
      en: "Run behavior evidenced: {run}; build behavior evidenced: {build}.",
      zh: "运行行为证据：{run}；构建行为证据：{build}。",
    },
    recommendation: {
      en: "Provide documented or manifest-backed run and build commands.",
      zh: "提供有文档或清单支持的运行与构建命令。",
    },
  },
  "operability.example": {
    evidence: {
      en: "Concrete example: {concrete}; prose usage description: {prose}.",
      zh: "具体示例：{concrete}；文字用法说明：{prose}。",
    },
    recommendation: {
      en: "Add a demo, sample, or concrete API usage example.",
      zh: "添加演示、示例项目或具体 API 用法。",
    },
  },
  "operability.error-handling": {
    evidence: {
      en: "Functions with error-handling constructs: {count} of {total}.",
      zh: "包含错误处理结构的函数：{count}/{total}。",
    },
    recommendation: {
      en: "Add explicit error handling where failures cross function boundaries; this metric is only structural evidence.",
      zh: "在故障跨越函数边界的位置添加明确错误处理；此指标仅代表结构证据。",
    },
  },
  "operability.version-history": {
    evidence: {
      en: "Versioned history file: {history}; manifest version only: {manifestVersion}.",
      zh: "含版本的历史文件：{history}；仅有清单版本：{manifestVersion}。",
    },
    recommendation: {
      en: "Maintain a changelog or release-notes file with version headings.",
      zh: "维护带版本标题的更新日志或发布说明文件。",
    },
  },
  "operability.configuration": {
    evidence: {
      en: "Configuration example or section present: {exists}.",
      zh: "配置示例或配置章节是否存在：{exists}。",
    },
    recommendation: {
      en: "Document configuration and provide a safe example file where useful.",
      zh: "说明配置方式，并在适用时提供安全的示例文件。",
    },
  },
  "readability.median-function-length": {
    evidence: {
      en: "Median non-test function length: {median} logical lines.",
      zh: "非测试函数长度中位数：{median} 个逻辑行。",
    },
    recommendation: {
      en: "Keep the median at 40 logical lines or fewer by extracting focused units.",
      zh: "通过拆分职责明确的单元，将中位数控制在 40 个逻辑行以内。",
    },
  },
  "readability.p90-function-length": {
    evidence: {
      en: "90th-percentile non-test function length: {p90} logical lines.",
      zh: "非测试函数长度第 90 百分位：{p90} 个逻辑行。",
    },
    recommendation: {
      en: "Reduce long-tail functions toward 80 logical lines or fewer.",
      zh: "缩短长尾函数，目标为 80 个逻辑行以内。",
    },
  },
  "readability.large-file-ratio": {
    evidence: {
      en: "Files over 500 logical lines: {count} of {total}.",
      zh: "超过 500 个逻辑行的文件：{count}/{total}。",
    },
    recommendation: {
      en: "Split large source files so no more than 10% exceed 500 logical lines.",
      zh: "拆分大型源码文件，使超过 500 个逻辑行的比例不高于 10%。",
    },
  },
  "readability.median-nesting": {
    evidence: {
      en: "Median function nesting depth: {median}.",
      zh: "函数嵌套深度中位数：{median}。",
    },
    recommendation: {
      en: "Flatten control flow toward a median nesting depth of three or less.",
      zh: "简化控制流，将嵌套深度中位数降至 3 以内。",
    },
  },
  "readability.ambiguous-identifiers": {
    evidence: {
      en: "Ambiguous short identifiers: {count} of {total} occurrences.",
      zh: "含义模糊的短标识符：{count}/{total} 次。",
    },
    recommendation: {
      en: "Rename unclear short identifiers where context does not make intent obvious; this is a heuristic.",
      zh: "在上下文无法清楚表达意图时重命名短标识符；此项仅为启发式指标。",
    },
  },
  "readability.documented-exports": {
    evidence: {
      en: "Documented exported or public declarations: {count} of {total}.",
      zh: "有文档的导出或公开声明：{count}/{total}。",
    },
    recommendation: {
      en: "Add adjacent API documentation to at least 20% of exported or public declarations.",
      zh: "为至少 20% 的导出或公开声明添加相邻 API 文档。",
    },
  },
  "complexity.median-cyclomatic": {
    evidence: {
      en: "Median function cyclomatic complexity: {median}.",
      zh: "函数圈复杂度中位数：{median}。",
    },
    recommendation: {
      en: "Simplify typical decision paths toward a median complexity of five or less.",
      zh: "简化常见决策路径，将圈复杂度中位数降至 5 以内。",
    },
  },
  "complexity.p90-cyclomatic": {
    evidence: {
      en: "90th-percentile function cyclomatic complexity: {p90}.",
      zh: "函数圈复杂度第 90 百分位：{p90}。",
    },
    recommendation: {
      en: "Refactor high-complexity functions toward a 90th percentile of 15 or less.",
      zh: "重构高复杂度函数，将第 90 百分位降至 15 以内。",
    },
  },
  "complexity.max-nesting": {
    evidence: {
      en: "Maximum function nesting depth: {max}.",
      zh: "函数最大嵌套深度：{max}。",
    },
    recommendation: {
      en: "Use guard clauses or extraction to keep maximum nesting at five or less.",
      zh: "使用提前返回或函数拆分，将最大嵌套控制在 5 以内。",
    },
  },
  "complexity.very-large-files": {
    evidence: {
      en: "Files over 1,000 logical lines: {count} of {total}.",
      zh: "超过 1,000 个逻辑行的文件：{count}/{total}。",
    },
    recommendation: {
      en: "Split files over 1,000 logical lines into cohesive modules.",
      zh: "将超过 1,000 个逻辑行的文件拆分为内聚模块。",
    },
  },
  "complexity.duplication": {
    evidence: {
      en: "Approximate duplicated normalized tokens: {count} of {total}; ratio {ratio}.",
      zh: "近似重复的规范化词元：{count}/{total}；比例 {ratio}。",
    },
    recommendation: {
      en: "Consolidate repeated non-test spans to keep approximate duplication at 5% or less.",
      zh: "合并重复的非测试代码片段，将近似重复率控制在 5% 以内。",
    },
  },
  "complexity.circular-imports": {
    evidence: {
      en: "Circular-import components: {components}; largest component: {largest} files.",
      zh: "循环导入组件数：{components}；最大组件：{largest} 个文件。",
    },
    recommendation: {
      en: "Break resolvable internal import cycles by moving shared contracts behind one dependency direction.",
      zh: "将共享约定移到单向依赖边界后，消除可解析的内部导入环。",
    },
  },
  "testing.test-files": {
    evidence: {
      en: "Recognized test files: {count}; test configuration: {configuration}.",
      zh: "受识别的测试文件：{count}；测试配置：{configuration}。",
    },
    recommendation: {
      en: "Add recognized test files, not only test-tool configuration.",
      zh: "添加受识别的测试文件，而不仅是测试工具配置。",
    },
  },
  "testing.test-source-ratio": {
    evidence: {
      en: "Test files: {count}; supported non-test source files: {total}.",
      zh: "测试文件：{count}；受支持的非测试源码文件：{total}。",
    },
    recommendation: {
      en: "Grow the test-file ratio toward at least one test file per four supported source files.",
      zh: "将测试文件比例提高到每四个受支持源码文件至少一个测试文件。",
    },
  },
  "testing.ci": {
    evidence: {
      en: "Recognized continuous-integration configuration present: {exists}.",
      zh: "是否存在受识别的持续集成配置：{exists}。",
    },
    recommendation: {
      en: "Add a CI workflow that runs repository checks automatically.",
      zh: "添加可自动运行仓库检查的持续集成工作流。",
    },
  },
  "testing.test-command": {
    evidence: {
      en: "Structured test command: {structured}; README-only command: {documented}.",
      zh: "结构化测试命令：{structured}；仅 README 命令：{documented}。",
    },
    recommendation: {
      en: "Expose the test command through the manifest or standard project configuration.",
      zh: "通过清单或标准项目配置公开测试命令。",
    },
  },
  "testing.static-check": {
    evidence: {
      en: "Structured static-check command: {structured}; README-only command: {documented}.",
      zh: "结构化静态检查命令：{structured}；仅 README 命令：{documented}。",
    },
    recommendation: {
      en: "Configure a repeatable lint, type-check, or static-check command.",
      zh: "配置可重复运行的代码检查、类型检查或静态检查命令。",
    },
  },
  "testing.coverage": {
    evidence: {
      en: "Coverage configuration or command present: {exists}.",
      zh: "覆盖率配置或命令是否存在：{exists}。",
    },
    recommendation: {
      en: "Add coverage-tool configuration or a coverage command.",
      zh: "添加覆盖率工具配置或覆盖率命令。",
    },
  },
  "maintenance.activity": {
    evidence: {
      en: "Archived: {archived}; exact elapsed days since last push: {elapsedDays}.",
      zh: "是否归档：{archived}；距上次推送的精确天数：{elapsedDays}。",
    },
    recommendation: {
      en: "Clarify maintenance status when the repository is archived or has not been pushed within 180 days.",
      zh: "当仓库已归档或超过 180 天未推送时，明确说明维护状态。",
    },
  },
  "maintenance.lockfile": {
    evidence: {
      en: "Recognized dependency lockfile present: {exists}.",
      zh: "是否存在受识别的依赖锁文件：{exists}。",
    },
    recommendation: {
      en: "Commit the standard dependency lockfile when the project ecosystem uses one.",
      zh: "若项目生态使用锁文件，请提交标准依赖锁文件。",
    },
  },
  "maintenance.dependency-updates": {
    evidence: {
      en: "Automated dependency-update configuration present: {exists}.",
      zh: "是否存在自动依赖更新配置：{exists}。",
    },
    recommendation: {
      en: "Configure Dependabot or Renovate for routine dependency updates.",
      zh: "配置 Dependabot 或 Renovate 进行常规依赖更新。",
    },
  },
  "maintenance.templates": {
    evidence: {
      en: "Issue or pull-request templates present: {exists}.",
      zh: "是否存在 Issue 或拉取请求模板：{exists}。",
    },
    recommendation: {
      en: "Add issue or pull-request templates that request actionable context.",
      zh: "添加可收集有效上下文的 Issue 或拉取请求模板。",
    },
  },
  "maintenance.security": {
    evidence: {
      en: "Security policy present: {exists}.",
      zh: "安全政策是否存在：{exists}。",
    },
    recommendation: {
      en: "Add a SECURITY policy with a private vulnerability-reporting path.",
      zh: "添加 SECURITY 政策，并提供私密漏洞报告渠道。",
    },
  },
  "maintenance.code-of-conduct": {
    evidence: {
      en: "Code of conduct present: {exists}.",
      zh: "行为准则是否存在：{exists}。",
    },
    recommendation: {
      en: "Add a code of conduct for community participation.",
      zh: "添加社区参与行为准则。",
    },
  },
  "maintenance.version-history": {
    evidence: {
      en: "Versioned changelog or release-notes file present: {exists}.",
      zh: "是否存在含版本的更新日志或发布说明：{exists}。",
    },
    recommendation: {
      en: "Record user-visible changes in a versioned history file.",
      zh: "在含版本的历史文件中记录用户可见变更。",
    },
  },
  "maintenance.generated-directories": {
    evidence: {
      en: "Committed dependency, build, or cache directories: {count}.",
      zh: "已提交的依赖、构建或缓存目录：{count}。",
    },
    recommendation: {
      en: "Remove committed generated directories and exclude them with ignore rules.",
      zh: "移除已提交的生成目录，并通过忽略规则排除它们。",
    },
  },
} as const satisfies Record<RuleId, RuleCopy>;

type RuleMessageKey = `evidence.${RuleId}` | `recommendation.${RuleId}`;
export type AppMessageKey = keyof typeof baseEn | RuleMessageKey;

function buildRuleMessages(
  language: "en" | "zh",
): Record<RuleMessageKey, string> {
  const output = {} as Record<RuleMessageKey, string>;

  for (const ruleId of Object.keys(ruleCopy) as RuleId[]) {
    output[`evidence.${ruleId}`] = ruleCopy[ruleId].evidence[language];
    output[`recommendation.${ruleId}`] =
      ruleCopy[ruleId].recommendation[language];
  }

  return output;
}

export const messages: Record<Language, Record<AppMessageKey, string>> = {
  en: { ...baseEn, ...buildRuleMessages("en") },
  "zh-CN": { ...baseZh, ...buildRuleMessages("zh") },
};
