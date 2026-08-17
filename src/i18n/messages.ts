import type {
  AnalysisReport,
  Language,
  LocalizedDescriptor,
  MessageArgument,
} from "../features/analysis/model";
import type { RuleId } from "../features/rules/rules";

const baseEn = {
  brand: "RepoScope 项目透视",
  tagline:
    "Understand what a public project does, how to use it, and what to verify.",
  heroTitle: "Understand a public project before you depend on it.",
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
  reportIndex: "GUIDED PROJECT REPORT",
  reportOverallScore: "Overall score",
  reportOverallStrong: "Strong evidence",
  reportOverallSolid: "Solid foundation",
  reportOverallNeedsAttention: "Needs attention",
  reportOverallLimited: "Limited evidence",
  reportGeneralOnly: "General-only",
  reportPreliminary: "Preliminary",
  reportConfidence: "Confidence",
  confidenceHigh: "High confidence",
  confidenceMedium: "Medium confidence",
  confidenceLow: "Low confidence",
  reportScope: "{selected} selected · {fetched} fetched · {parsed} parsed",
  reportCommit: "Inspected commit",
  reportAnalyzedAt: "Scanned",
  reportDefaultBranch: "Default branch",
  reportRepositoryLink: "Open repository on GitHub",
  projectBriefRegion: "Project brief",
  projectBriefWhat: "What it does",
  projectBriefFit: "Likely fit",
  projectBriefKind: "What it is",
  projectBriefCautions: "Before you use it",
  projectBriefInsufficient:
    "Public repository evidence is insufficient to explain this project reliably.",
  projectBriefFitKnown:
    "If the stated purpose matches your needs, this project may be worth considering based on detected kind evidence: {kinds}.",
  projectBriefFitInsufficient: "Public evidence is insufficient to judge fit.",
  projectBriefFitUnknown:
    "Compare the stated purpose with your needs; the repository type could not be established reliably.",
  projectBriefKindUnknown: "Unknown from public evidence.",
  projectBriefNoCautions: "No additional cautions are included in this brief.",
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
  projectCautionInsufficientExplanation:
    "The public description and README do not explain the project clearly enough.",
  projectCautionLicenseEvidenceAbsent:
    "No recognized license evidence was detected.",
  projectCautionEntryPointEvidenceAbsent:
    "No structured or conventional entry point was detected.",
  readerDecisionIndex: "REPOSITORY DECISION",
  readerDecisionHeading: "Project decision summary",
  readerStatusContinue: "Sufficient evidence to continue evaluation",
  readerStatusVerify: "Key gaps require verification before use",
  readerStatusInsufficient: "Public evidence is insufficient to judge",
  readerPurposeHeading: "Purpose and practical scenarios",
  readerReliabilityHeading: "Evidence of reliability",
  readerArchitectureHeading: "Core principles and code architecture",
  readerGettingStartedHeading: "Install, run, and develop",
  readerSecurityHeading: "Security and privacy risks",
  readerMaintenanceHeading: "Activity, maintenance, and alternatives",
  readerUnavailable: "Repository does not provide this evidence.",
  readerStepUnavailable: "Repository does not provide this step.",
  readerNotEstablished: "Not established from the scanned public evidence.",
  readerCommandReview: "Repository-provided command — review before running.",
  readerCommandWithheld:
    "A documented command exists, but RepoScope did not copy it because it did not pass the safe-text boundary.",
  readerSecurityBoundary:
    "RepoScope does not execute the project, scan dependencies for vulnerabilities, observe runtime traffic, verify permissions, detect malicious behavior, or prove privacy compliance.",
  technicalAppendixHeading: "Technical evidence and methodology",
  readerStatedPurpose: "Stated purpose",
  readerScenariosHeading: "Practical scenarios",
  readerScenariosMissing:
    "Repository does not publicly describe specific usage scenarios.",
  readerKindsHeading: "Observed project kinds",
  readerCautionsHeading: "Repository cautions",
  readerEvidenceStatus: "Evidence status",
  readerReliabilityReasons: "Evidence behind this status",
  readerQuestionsHeading: "What to verify",
  readerQuickStartHeading: "Shortest documented path",
  readerArchitectureEvidence: "Repository architecture explanation",
  readerArchitectureDocuments: "Architecture documents",
  readerArchitectureEntryPoints: "Observed entry points",
  readerArchitectureSourceAreas: "Top-level source areas",
  readerArchitectureEcosystems: "Observed ecosystems",
  readerGettingStartedCommands: "Repository-provided steps",
  readerSecurityObserved: "Observed security and privacy signals",
  readerSecurityDeclarations: "Repository declarations",
  readerMaintenanceEvidence: "Observed maintenance evidence",
  readerMaintenanceFacts: "GitHub maintenance facts",
  readerAlternativesHeading: "Compare alternatives",
  readerComparisonHeading: "Use the same checks for every repository",
  readerAlternativeSearch:
    "Search GitHub repositories using these evidence terms",
  readerSourceDocumentation: "{path} at inspected commit",
  readerSourceDeterministicAnalysis: "Deterministic analysis",
  readerSignalStatePresent: "Present",
  readerSignalStateAbsent: "Not present",
  readerSignalStateUnknown: "Not established",
  readerSignalArchived: "Archived",
  readerSignalInstall: "Installation path",
  readerSignalRun: "Start or run path",
  readerSignalLicense: "Recognized license evidence",
  readerSignalRecentActivity: "Activity within 180 UTC days",
  readerSignalTests: "Automated test evidence",
  readerSignalCi: "Continuous integration",
  readerSignalCoverage: "Coverage evidence",
  readerSignalSecurityPolicy: "Security policy",
  readerSignalVersionHistory: "Version history",
  readerSignalContributing: "Contribution guide",
  readerSignalIssueTemplates: "Issue or pull-request templates",
  readerSignalDependencyUpdates: "Dependency-update automation",
  readerSignalConfiguration: "Configuration examples",
  readerQuestionLicense: "Is the license compatible with the intended use?",
  readerQuestionInstallRun:
    "Can the documented install and start path be reproduced in an isolated environment?",
  readerQuestionRuntimeData:
    "Which data leaves the local environment at runtime?",
  readerQuestionVulnerabilities:
    "How are vulnerabilities reported and patched?",
  readerQuestionRelease:
    "Is the last supported release compatible with the intended platform?",
  readerCommandInstall: "Install",
  readerCommandRun: "Run",
  readerCommandDevelop: "Develop",
  readerCommandTest: "Test",
  readerCommandBuild: "Build",
  readerEcosystemJavaScript: "JavaScript / TypeScript",
  readerEcosystemPython: "Python",
  readerEcosystemGo: "Go",
  readerEcosystemRust: "Rust",
  readerEcosystemJava: "Java / JVM",
  readerEcosystemDotNet: ".NET",
  readerEcosystemRuby: "Ruby",
  readerEcosystemPhp: "PHP",
  readerEcosystemSwift: "Swift",
  readerEcosystemDart: "Dart",
  readerEcosystemOther: "Other",
  readerYes: "Yes",
  readerNo: "No",
  readerArchivedLabel: "Archived",
  readerLastPush: "Last push: {date}",
  readerActivity: "{days} elapsed UTC days ({band})",
  readerActivityWithin180: "within 180 days",
  readerActivity181To365: "181–365 days",
  readerActivityOver365: "over 365 days",
  readerOpenIssues: "Open issues reported by GitHub: {count}",
  readerComparisonPurpose: "Purpose",
  readerComparisonLicense: "License",
  readerComparisonOnboarding: "Onboarding",
  readerComparisonTests: "Automated tests",
  readerComparisonSecurity: "Security process",
  readerComparisonMaintenance: "Maintenance",
  readerComparisonEcosystem: "Ecosystem fit",
  readerComparisonOperations: "Operational constraints",
  dimensionIndex: "02 / SIX DIMENSIONS",
  dimensionsHeading: "Dimension scores",
  dimensionDocumentation: "Documentation and onboarding",
  dimensionOperability: "Operability evidence",
  dimensionReadability: "Code readability",
  dimensionComplexity: "Complexity and structure",
  dimensionTesting: "Testing and automation",
  dimensionMaintenance: "Maintenance health",
  dimensionDocumentationDescription:
    "README, onboarding, licensing, contribution, and architecture evidence.",
  dimensionOperabilityDescription:
    "Detected entry points, commands, examples, configuration, and release evidence—not execution proof.",
  dimensionReadabilityDescription:
    "Parsed function size, nesting, naming heuristics, and adjacent documentation.",
  dimensionComplexityDescription:
    "Parsed branching, file size, approximate duplication, and resolved internal cycles.",
  dimensionTestingDescription:
    "Detected test files, automation, commands, static checks, and coverage configuration—not test results.",
  dimensionMaintenanceDescription:
    "Recent activity and detected maintenance, policy, template, and dependency-update files.",
  scoreOutOf: "{score} / 100",
  scoreAccessible: "{dimension}: {score} out of 100",
  unavailable: "Unavailable",
  strengthsIndex: "03 / EVIDENCE-BACKED STRENGTHS",
  strengthsHeading: "What the project already does well",
  noStrengths:
    "No passed rule with concrete evidence was selected as a strength.",
  strengthItem: "Strength: {ruleId}",
  improvementsIndex: "04 / PRIORITIZED IMPROVEMENTS",
  improvementsHeading: "What to improve next",
  noImprovements:
    "No failed or partial rule with concrete evidence needs action.",
  improvementItem: "Improvement: {ruleId}",
  priorityHigh: "High priority",
  priorityMedium: "Medium priority",
  priorityLow: "Low priority",
  lostPoints: "{points} points available",
  evidenceLabel: "Evidence",
  suggestedAction: "Suggested action",
  referencesLabel: "References",
  coverageIndex: "05 / INSPECTION COVERAGE",
  coverageHeading: "Coverage and limits",
  coverageSelected: "Selected files",
  coverageFetched: "Fetched files",
  coverageParsed: "Parsed files",
  coverageSkipped: "Skipped files",
  coverageFailed: "Failed files",
  coverageUnsupported: "Unsupported files",
  coverageEligibleBytes: "Eligible bytes",
  coverageSelectedBytes: "Selected bytes",
  coverageFetchedBytes: "Fetched bytes",
  coverageParsedBytes: "Parsed bytes",
  coverageEligibleSourceBytes: "Eligible source bytes",
  coverageParsedSupportedBytes: "Parsed supported bytes",
  coveragePartialTree: "Partial GitHub tree",
  coverageLimitReached: "Inspection limit reached",
  coverageComplete: "Available tree inspected within configured limits",
  coverageDetails: "Skipped and failed file details",
  coverageSkippedReason: "Skipped: {reason}",
  coverageFailureReason: "{stage} failed: {reason}",
  coverageStageFetch: "Fetch",
  coverageStageParse: "Parse",
  skipExcluded: "excluded path",
  skipBinary: "binary or invalid text",
  skipOversized: "oversized file",
  skipUnsupported: "unsupported source",
  skipBudget: "inspection budget",
  skipInvalidEntry: "invalid tree entry",
  failureNotFound: "not found",
  failureRateLimit: "rate limit",
  failureNetwork: "network",
  failureApi: "GitHub API",
  failureInvalidResponse: "invalid response",
  failureFileLimit: "file limit",
  failureInvalidText: "invalid text",
  failureTimeout: "timeout",
  failureBudget: "inspection budget",
  failureSyntax: "syntax parse",
  evidenceIndex: "06 / RULE EVIDENCE",
  evidenceExplorerHeading: "Evidence explorer",
  evidenceDisclosure: "Filter and inspect versioned rule evidence",
  dimensionFilter: "Dimension",
  severityFilter: "Severity",
  stateFilter: "State",
  filterAll: "All",
  statePassed: "Passed",
  statePartial: "Partial",
  stateFailed: "Failed",
  stateNotApplicable: "Not applicable",
  severityNotPrioritized: "Not prioritized",
  rulesShownOne: "{count} rule shown",
  rulesShownMany: "{count} rules shown",
  noEvidenceMatches: "No evidence matches these filters.",
  noActionForRule: "No improvement is suggested for this rule state.",
  fileLine: "{path}, line {start}",
  fileLineRange: "{path}, lines {start}–{end}",
  copyChecklist: "Copy improvement checklist",
  copyWorking: "Copying",
  copySuccess: "Copied",
  copyFailure: "Copy failed",
  refreshPublicData: "Refresh public data",
  methodologyReportIndex: "07 / VERSIONED METHOD",
  methodologyRegion: "Methodology",
  methodologyDisclosure: "Weights, thresholds, exclusions, and limitations",
  methodologyWeights: "Dimension weights",
  methodologyOverallThresholds:
    "Overall labels: 85–100 strong evidence; 70–84 solid foundation; 50–69 needs attention; 0–49 limited evidence.",
  methodologyConfidenceThresholds:
    "Confidence labels: 80–100 high; 60–79 medium; 0–59 low. Confidence is separate from quality.",
  methodologyApplicability:
    "Not-applicable points are removed. An unavailable dimension is shown as unavailable, and general-only reports are preliminary and not directly comparable with complete reports.",
  methodologyCompleteLink: "Read the complete versioned methodology",
  staleReport: "Refresh failed. Showing the report from {timestamp}.",
  errorIndex: "ERROR / SAFE RECOVERY",
  errorHeading: "Analysis could not be completed",
  errorInvalidUrl: "Enter a valid public GitHub repository URL and try again.",
  errorNotFound: "The repository was not found or is not public.",
  errorRateLimit: "GitHub's public API rate limit has been reached.",
  errorRateReset: "GitHub rate limit resets at {timestamp}.",
  errorRateResetUnknown: "GitHub did not provide a valid reset time.",
  errorEmpty: "This repository has no source tree to inspect.",
  errorNetwork: "The network request failed. Check your connection and retry.",
  errorApi:
    "GitHub could not complete the request. Retry when the service is available.",
  errorInvalidResponse:
    "GitHub returned an unexpected response. Retry the analysis.",
  errorWorker: "The browser analysis worker stopped. Start a clean retry.",
  retryAnalysis: "Retry analysis",
  rateLimitDocumentation: "GitHub rate-limit documentation",
  markdownTitle: "RepoScope improvement checklist",
  markdownRepository: "Repository",
  markdownCommit: "Commit",
  markdownRuleset: "Ruleset",
  markdownConfidence: "Confidence",
  markdownScope: "Scope",
  markdownImprovements: "Ordered improvements",
  markdownNoImprovements: "No prioritized improvements were detected.",
  markdownEvidence: "Evidence",
  markdownAction: "Action",
  markdownReferences: "References",
} as const;

const baseZh = {
  brand: "RepoScope 项目透视",
  tagline: "看懂一个公开项目做什么、怎么使用，以及哪些事项必须核实。",
  heroTitle: "在依赖一个公开项目之前，先真正看懂它。",
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
  reportIndex: "引导式项目报告",
  reportOverallScore: "综合评分",
  reportOverallStrong: "证据较强",
  reportOverallSolid: "基础扎实",
  reportOverallNeedsAttention: "需要关注",
  reportOverallLimited: "证据有限",
  reportGeneralOnly: "仅通用分析",
  reportPreliminary: "初步报告",
  reportConfidence: "置信度",
  confidenceHigh: "高可信度",
  confidenceMedium: "中可信度",
  confidenceLow: "低可信度",
  reportScope:
    "已选择 {selected} 个 · 已获取 {fetched} 个 · 已解析 {parsed} 个",
  reportCommit: "检查的提交",
  reportAnalyzedAt: "检查时间",
  reportDefaultBranch: "默认分支",
  reportRepositoryLink: "在 GitHub 打开项目",
  projectBriefRegion: "项目速览",
  projectBriefWhat: "项目用途",
  projectBriefFit: "可能适用",
  projectBriefKind: "项目类型",
  projectBriefCautions: "使用前注意",
  projectBriefInsufficient: "公开仓库证据不足，无法可靠说明这个项目的用途。",
  projectBriefFitKnown:
    "若项目陈述的用途符合你的需求，可依据检测到的类型证据进一步考虑：{kinds}。",
  projectBriefFitInsufficient: "公开证据不足，无法判断是否适用。",
  projectBriefFitUnknown:
    "请将公开说明与自己的需求对照；目前无法可靠确定仓库类型。",
  projectBriefKindUnknown: "公开证据无法确定。",
  projectBriefNoCautions: "此速览未列出其他注意事项。",
  projectBriefSourceDescription: "GitHub 仓库说明",
  projectBriefSourceReadme: "{path}（检查的提交）",
  projectBriefSourceManifest: "{path}（检查的提交）",
  projectBriefSourceTree: "{path}（检查的提交）",
  projectBriefSourceMetadata: "GitHub 仓库元数据",
  projectBriefSourceAnalysis: "仓库检查证据",
  projectKindApplication: "应用程序",
  projectKindCommandLineTool: "命令行工具",
  projectKindLibrary: "软件库",
  projectKindPlugin: "插件",
  projectKindTemplate: "模板或起步项目",
  projectKindDocumentation: "文档项目",
  projectCautionArchived: "此仓库已归档。",
  projectCautionInsufficientExplanation:
    "公开说明和 README 未能足够清楚地解释这个项目。",
  projectCautionLicenseEvidenceAbsent: "未检测到受识别的许可证证据。",
  projectCautionEntryPointEvidenceAbsent: "未检测到结构化或约定式入口。",
  readerDecisionIndex: "项目决策",
  readerDecisionHeading: "项目决策摘要",
  readerStatusContinue: "有较充分证据，可以继续评估",
  readerStatusVerify: "存在关键缺口，使用前需要核实",
  readerStatusInsufficient: "公开证据不足，暂时无法判断",
  readerPurposeHeading: "项目用途与具体业务场景",
  readerReliabilityHeading: "是否靠谱",
  readerArchitectureHeading: "核心原理与代码架构",
  readerGettingStartedHeading: "安装、运行和二次开发",
  readerSecurityHeading: "安全与隐私风险",
  readerMaintenanceHeading: "活跃度、维护状况和替代方案",
  readerUnavailable: "仓库未提供这项证据。",
  readerStepUnavailable: "仓库未提供这一步骤。",
  readerNotEstablished: "无法从已扫描的公开证据中确认。",
  readerCommandReview: "仓库提供的命令——运行前请先检查。",
  readerCommandWithheld:
    "仓库提供了命令，但该内容未通过安全文本边界，因此 RepoScope 未复制。",
  readerSecurityBoundary:
    "RepoScope 不会执行项目、扫描依赖漏洞、观察运行时流量、验证权限、检测恶意行为或证明隐私合规。",
  technicalAppendixHeading: "技术证据与方法",
  readerStatedPurpose: "项目陈述的用途",
  readerScenariosHeading: "具体业务场景",
  readerScenariosMissing: "仓库未公开说明具体使用场景。",
  readerKindsHeading: "观察到的项目类型",
  readerCautionsHeading: "仓库注意事项",
  readerEvidenceStatus: "证据状态",
  readerReliabilityReasons: "此状态所依据的证据",
  readerQuestionsHeading: "需要核实的问题",
  readerQuickStartHeading: "最短文档路径",
  readerArchitectureEvidence: "仓库架构说明",
  readerArchitectureDocuments: "架构文档",
  readerArchitectureEntryPoints: "观察到的入口",
  readerArchitectureSourceAreas: "顶层源码区域",
  readerArchitectureEcosystems: "观察到的技术生态",
  readerGettingStartedCommands: "仓库提供的步骤",
  readerSecurityObserved: "观察到的安全与隐私信号",
  readerSecurityDeclarations: "仓库声明",
  readerMaintenanceEvidence: "观察到的维护证据",
  readerMaintenanceFacts: "GitHub 维护事实",
  readerAlternativesHeading: "比较替代方案",
  readerComparisonHeading: "用相同标准检查每个仓库",
  readerAlternativeSearch: "使用这些证据词搜索 GitHub 仓库",
  readerSourceDocumentation: "{path}（检查的提交）",
  readerSourceDeterministicAnalysis: "确定性分析",
  readerSignalStatePresent: "存在",
  readerSignalStateAbsent: "不存在",
  readerSignalStateUnknown: "无法确认",
  readerSignalArchived: "已归档",
  readerSignalInstall: "安装路径",
  readerSignalRun: "启动或运行路径",
  readerSignalLicense: "受识别的许可证证据",
  readerSignalRecentActivity: "180 个 UTC 日内有活动",
  readerSignalTests: "自动化测试证据",
  readerSignalCi: "持续集成",
  readerSignalCoverage: "覆盖率证据",
  readerSignalSecurityPolicy: "安全政策",
  readerSignalVersionHistory: "版本历史",
  readerSignalContributing: "贡献指南",
  readerSignalIssueTemplates: "Issue 或拉取请求模板",
  readerSignalDependencyUpdates: "依赖更新自动化",
  readerSignalConfiguration: "配置示例",
  readerQuestionLicense: "许可证是否与预期用途兼容？",
  readerQuestionInstallRun: "能否在隔离环境中复现文档中的安装与启动流程？",
  readerQuestionRuntimeData: "运行时有哪些数据会离开本地环境？",
  readerQuestionVulnerabilities: "漏洞如何报告和修复？",
  readerQuestionRelease: "最近受支持的版本是否与预期平台兼容？",
  readerCommandInstall: "安装",
  readerCommandRun: "运行",
  readerCommandDevelop: "开发",
  readerCommandTest: "测试",
  readerCommandBuild: "构建",
  readerEcosystemJavaScript: "JavaScript / TypeScript",
  readerEcosystemPython: "Python",
  readerEcosystemGo: "Go",
  readerEcosystemRust: "Rust",
  readerEcosystemJava: "Java / JVM",
  readerEcosystemDotNet: ".NET",
  readerEcosystemRuby: "Ruby",
  readerEcosystemPhp: "PHP",
  readerEcosystemSwift: "Swift",
  readerEcosystemDart: "Dart",
  readerEcosystemOther: "其他",
  readerYes: "是",
  readerNo: "否",
  readerArchivedLabel: "是否归档",
  readerLastPush: "最近推送：{date}",
  readerActivity: "已过 {days} 个 UTC 日（{band}）",
  readerActivityWithin180: "180 日以内",
  readerActivity181To365: "181–365 日",
  readerActivityOver365: "超过 365 日",
  readerOpenIssues: "GitHub 报告的未关闭 Issue 数：{count}",
  readerComparisonPurpose: "用途",
  readerComparisonLicense: "许可证",
  readerComparisonOnboarding: "上手流程",
  readerComparisonTests: "自动化测试",
  readerComparisonSecurity: "安全流程",
  readerComparisonMaintenance: "维护状况",
  readerComparisonEcosystem: "生态适配",
  readerComparisonOperations: "运行约束",
  dimensionIndex: "02 / 六项维度",
  dimensionsHeading: "维度评分",
  dimensionDocumentation: "文档与上手体验",
  dimensionOperability: "可运行性证据",
  dimensionReadability: "代码可读性",
  dimensionComplexity: "复杂度与结构",
  dimensionTesting: "测试与自动化",
  dimensionMaintenance: "维护健康度",
  dimensionDocumentationDescription: "README、上手说明、许可、贡献和架构证据。",
  dimensionOperabilityDescription:
    "检测到的入口、命令、示例、配置和版本证据，不代表实际运行验证。",
  dimensionReadabilityDescription:
    "已解析的函数长度、嵌套、命名启发式指标和相邻文档。",
  dimensionComplexityDescription:
    "已解析的分支、文件长度、近似重复和可解析的内部循环依赖。",
  dimensionTestingDescription:
    "检测到的测试文件、自动化、命令、静态检查和覆盖率配置，不代表测试结果。",
  dimensionMaintenanceDescription:
    "近期活动，以及检测到的维护、政策、模板和依赖更新文件。",
  scoreOutOf: "{score} / 100",
  scoreAccessible: "{dimension}：100 分中得 {score} 分",
  unavailable: "不可用",
  strengthsIndex: "03 / 有证据支持的优点",
  strengthsHeading: "项目已经做得好的地方",
  noStrengths: "没有通过且带有具体证据的规则入选优点。",
  strengthItem: "优点：{ruleId}",
  improvementsIndex: "04 / 优先改进事项",
  improvementsHeading: "下一步改进什么",
  noImprovements: "没有需要行动且带有具体证据的失败或部分通过规则。",
  improvementItem: "改进：{ruleId}",
  priorityHigh: "高优先级",
  priorityMedium: "中优先级",
  priorityLow: "低优先级",
  lostPoints: "可得 {points} 分",
  evidenceLabel: "证据",
  suggestedAction: "建议行动",
  referencesLabel: "引用位置",
  coverageIndex: "05 / 检查覆盖范围",
  coverageHeading: "覆盖范围与边界",
  coverageSelected: "已选择文件",
  coverageFetched: "已获取文件",
  coverageParsed: "已解析文件",
  coverageSkipped: "已跳过文件",
  coverageFailed: "失败文件",
  coverageUnsupported: "不支持文件",
  coverageEligibleBytes: "符合条件的字节",
  coverageSelectedBytes: "已选择字节",
  coverageFetchedBytes: "已获取字节",
  coverageParsedBytes: "已解析字节",
  coverageEligibleSourceBytes: "符合条件的源码字节",
  coverageParsedSupportedBytes: "已解析支持语言字节",
  coveragePartialTree: "GitHub 文件树不完整",
  coverageLimitReached: "已达到检查边界",
  coverageComplete: "可用文件树已在配置边界内完成检查",
  coverageDetails: "已跳过和失败的文件详情",
  coverageSkippedReason: "已跳过：{reason}",
  coverageFailureReason: "{stage}失败：{reason}",
  coverageStageFetch: "获取",
  coverageStageParse: "解析",
  skipExcluded: "排除路径",
  skipBinary: "二进制或无效文本",
  skipOversized: "文件过大",
  skipUnsupported: "不支持的源码",
  skipBudget: "检查预算",
  skipInvalidEntry: "无效文件树条目",
  failureNotFound: "未找到",
  failureRateLimit: "频率限制",
  failureNetwork: "网络",
  failureApi: "GitHub API",
  failureInvalidResponse: "无效响应",
  failureFileLimit: "文件边界",
  failureInvalidText: "无效文本",
  failureTimeout: "超时",
  failureBudget: "检查预算",
  failureSyntax: "语法解析",
  evidenceIndex: "06 / 规则证据",
  evidenceExplorerHeading: "证据浏览器",
  evidenceDisclosure: "筛选并检查版本化规则证据",
  dimensionFilter: "维度",
  severityFilter: "优先级",
  stateFilter: "状态",
  filterAll: "全部",
  statePassed: "通过",
  statePartial: "部分通过",
  stateFailed: "失败",
  stateNotApplicable: "不适用",
  severityNotPrioritized: "未列入改进优先级",
  rulesShownOne: "显示 {count} 条规则",
  rulesShownMany: "显示 {count} 条规则",
  noEvidenceMatches: "没有符合筛选条件的证据。",
  noActionForRule: "此规则状态没有改进建议。",
  fileLine: "{path}，第 {start} 行",
  fileLineRange: "{path}，第 {start}–{end} 行",
  copyChecklist: "复制改进清单",
  copyWorking: "正在复制",
  copySuccess: "已复制",
  copyFailure: "复制失败",
  refreshPublicData: "刷新公开数据",
  methodologyReportIndex: "07 / 版本化方法",
  methodologyRegion: "方法说明",
  methodologyDisclosure: "权重、阈值、排除项与限制",
  methodologyWeights: "维度权重",
  methodologyOverallThresholds:
    "综合标签：85–100 为证据较强；70–84 为基础扎实；50–69 为需要关注；0–49 为证据有限。",
  methodologyConfidenceThresholds:
    "置信度标签：80–100 为高；60–79 为中；0–59 为低。置信度与质量相互独立。",
  methodologyApplicability:
    "不适用的分值会被移除；无适用分值的维度显示为不可用。仅通用分析属于初步报告，不能与完整报告直接比较。",
  methodologyCompleteLink: "阅读完整的版本化方法说明",
  staleReport: "刷新失败，当前显示 {timestamp} 生成的报告。",
  errorIndex: "错误 / 安全恢复",
  errorHeading: "未能完成分析",
  errorInvalidUrl: "请输入有效的公开 GitHub 项目网址后重试。",
  errorNotFound: "未找到该项目，或该项目不是公开项目。",
  errorRateLimit: "已达到 GitHub 公开 API 的频率限制。",
  errorRateReset: "GitHub 频率限制将在 {timestamp} 重置。",
  errorRateResetUnknown: "GitHub 未提供有效的重置时间。",
  errorEmpty: "这个项目没有可供检查的源码文件树。",
  errorNetwork: "网络请求失败，请检查网络连接后重试。",
  errorApi: "GitHub 暂时无法完成请求，请在服务可用时重试。",
  errorInvalidResponse: "GitHub 返回了异常响应，请重新分析。",
  errorWorker: "浏览器分析进程已停止，请进行一次全新重试。",
  retryAnalysis: "重新分析",
  rateLimitDocumentation: "GitHub 频率限制文档",
  markdownTitle: "RepoScope 改进清单",
  markdownRepository: "项目",
  markdownCommit: "提交",
  markdownRuleset: "规则版本",
  markdownConfidence: "置信度",
  markdownScope: "范围",
  markdownImprovements: "按优先级排序的改进事项",
  markdownNoImprovements: "未检测到优先改进事项。",
  markdownEvidence: "证据",
  markdownAction: "行动",
  markdownReferences: "引用位置",
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

function formatArgument(language: Language, value: MessageArgument): string {
  if (typeof value === "boolean") {
    if (language === "zh-CN") return value ? "是" : "否";
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return new Intl.NumberFormat(language).format(value);
  }
  return value;
}

export function formatMessage(
  language: Language,
  key: AppMessageKey,
  args: Readonly<Record<string, MessageArgument>> = {},
): string {
  return messages[language][key].replace(
    /\{([A-Za-z][A-Za-z0-9]*)\}/gu,
    (placeholder, name: string) => {
      const value = args[name];
      return value === undefined
        ? placeholder
        : formatArgument(language, value);
    },
  );
}

export function formatLocalizedDescriptor(
  language: Language,
  descriptor: LocalizedDescriptor,
): string {
  if (!(descriptor.key in messages[language])) {
    return descriptor.key;
  }
  return formatMessage(
    language,
    descriptor.key as AppMessageKey,
    descriptor.args,
  );
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]<>#])/gu, "\\$1");
}

function referenceText(
  path: string,
  startLine?: number,
  endLine?: number,
): string {
  if (startLine === undefined) return path;
  if (endLine !== undefined && endLine > startLine) {
    return `${path}:L${String(startLine)}-L${String(endLine)}`;
  }
  return `${path}:L${String(startLine)}`;
}

export function buildImprovementMarkdown(
  report: AnalysisReport,
  language: Language,
): string {
  const copy = messages[language];
  const scopeLabels =
    language === "zh-CN"
      ? [
          ...(report.overall.generalOnly ? ["仅通用分析"] : ["完整维度"]),
          ...(report.overall.preliminary ? ["初步报告"] : ["非初步报告"]),
        ]
      : [
          ...(report.overall.generalOnly
            ? ["general-only"]
            : ["complete dimensions"]),
          ...(report.overall.preliminary
            ? ["preliminary"]
            : ["not preliminary"]),
        ];
  const confidenceKey = {
    high: "confidenceHigh",
    medium: "confidenceMedium",
    low: "confidenceLow",
  } as const;
  const priorityKey = {
    high: "priorityHigh",
    medium: "priorityMedium",
    low: "priorityLow",
  } as const;
  const separator = language === "zh-CN" ? "：" : ": ";
  const lines = [
    `# ${copy.markdownTitle}`,
    "",
    `- ${copy.markdownRepository}${separator}${escapeMarkdown(report.repository.fullName)}`,
    `- ${copy.markdownCommit}${separator}${escapeMarkdown(report.repository.commitSha)}`,
    `- ${copy.markdownRuleset}${separator}${escapeMarkdown(report.rulesetVersion)}`,
    `- ${copy.markdownConfidence}${separator}${String(report.confidence.percent)}% (${copy[confidenceKey[report.confidence.label]]})`,
    `- ${copy.markdownScope}${separator}${scopeLabels.join(language === "zh-CN" ? "、" : ", ")}; ${formatMessage(
      language,
      "reportScope",
      {
        selected: report.coverage.selectedFiles,
        fetched: report.coverage.fetchedFiles,
        parsed: report.coverage.parsedFiles,
      },
    )}`,
    "",
    `## ${copy.markdownImprovements}`,
    "",
  ];

  if (report.weaknesses.length === 0) {
    lines.push(copy.markdownNoImprovements);
  } else {
    report.weaknesses.slice(0, 39).forEach((improvement, index) => {
      lines.push(
        `${String(index + 1)}. **${copy[priorityKey[improvement.severity]]}** \`${escapeMarkdown(improvement.ruleId)}\``,
        `   - ${copy.markdownEvidence}${separator}${escapeMarkdown(formatLocalizedDescriptor(language, improvement.evidence))}`,
        `   - ${copy.markdownAction}${separator}${escapeMarkdown(formatLocalizedDescriptor(language, improvement.recommendation))}`,
      );
      if (improvement.references.length > 0) {
        lines.push(
          `   - ${copy.markdownReferences}${separator}${improvement.references
            .slice(0, 20)
            .map(
              (reference) =>
                `\`${escapeMarkdown(
                  referenceText(
                    reference.path,
                    reference.startLine,
                    reference.endLine,
                  ),
                )}\``,
            )
            .join(", ")}`,
        );
      }
    });
  }

  return `${lines.join("\n")}\n`;
}
