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
  viewReport: "View report",
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
    "No license file or recognized GitHub license metadata was detected.",
  projectCautionEntryPointEvidenceAbsent:
    "No structured or conventional entry point was detected.",
  readerDecisionIndex: "REPOSITORY DECISION",
  readerDecisionHeading: "Project decision summary",
  readerNavigationLabel: "Reader report contents",
  readerNavigationHeading: "Jump to a question",
  readerStatusContinue: "Sufficient evidence to continue evaluation",
  readerStatusVerify: "Key gaps require verification before use",
  readerStatusInsufficient: "Public evidence is insufficient to judge",
  readerPurposeHeading: "Project-fit cautions",
  readerReliabilityHeading: "Evidence of reliability",
  readerArchitectureHeading: "How it broadly works",
  readerGettingStartedHeading: "Install, run, and develop",
  readerSecurityHeading: "Security and privacy risks",
  readerMaintenanceHeading: "Activity, maintenance, and alternatives",
  readerInterpretationIndex: "README EVIDENCE DOSSIER",
  readerInterpretationTitle: "README-first project interpretation",
  readerOrientationHeading: "Project orientation",
  readerCommunityHeading: "Community and maintenance facts",
  readerTakeawaysHeading: "Reader takeaways",
  readerTakeawayCapabilitiesHeading: "Capability shape",
  readerTakeawayCapabilities: "The README groups {count}: {labels}.",
  readerTakeawayCapabilitiesMissing:
    "The README does not provide a bounded capability list.",
  readerTakeawayWorkflowHeading: "Typical path",
  readerTakeawayWorkflow: "The README or repository provides {details}.",
  readerTakeawayWorkflowMissing:
    "No ordered README workflow or reusable onboarding command was established.",
  readerTakeawayArchitectureHeading: "Implementation outline",
  readerTakeawayArchitecture: "The repository suggests {details}.",
  readerTakeawayArchitectureKinds: "Project type: {kinds}",
  readerTakeawayArchitectureEcosystems: "Technology ecosystem: {ecosystems}",
  readerTakeawayArchitectureAreas: "Source layout: {areas}",
  readerTakeawayArchitectureDocumented:
    "The repository provides {references} that outline components or responsibilities.",
  readerTakeawayArchitectureMissing:
    "The scan does not establish a broad implementation outline.",
  readerTakeawayRiskHeading: "Adoption boundary",
  readerTakeawayRisk: "Public evidence shows {details}.",
  readerTakeawayRiskLicense: "License information: {state}",
  readerTakeawayRiskSecurity: "Security policy: {state}",
  readerTakeawayRiskConfiguration: "Configuration examples: {state}",
  readerTakeawayBoundary:
    "This overview summarizes public repository evidence. It does not verify runtime behavior, security, or suitability.",
  readerCountCapabilityGroup: "{count} capability area",
  readerCountCapabilityGroups: "{count} capability areas",
  readerCountEvidenceCapabilityGroup: "{count} capability group",
  readerCountEvidenceCapabilityGroups: "{count} capability groups",
  readerCountWorkflowStep: "{count} ordered step",
  readerCountWorkflowSteps: "{count} ordered steps",
  readerCountOnboardingCommand: "{count} onboarding command type",
  readerCountOnboardingCommands: "{count} onboarding command types",
  readerCountSourceArea: "{count} named source area",
  readerCountSourceAreas: "{count} named source areas",
  readerCountArchitectureReference: "{count} architecture reference",
  readerCountArchitectureReferences: "{count} architecture references",
  readerCountRequirement: "{count} external requirement",
  readerCountRequirements: "{count} external requirements",
  readerCountCitedStatement: "{count} cited statement",
  readerCountCitedStatements: "{count} cited statements",
  readerCountDocumentedStep: "{count} documented step",
  readerCountDocumentedSteps: "{count} documented steps",
  readerReadmeNarrativeHeading: "What the README says",
  readerCapabilitiesHeading: "Core capabilities",
  readerWorkflowHeading: "Documented workflow",
  readerClaimObservationHeading: "README claims and repository observations",
  readerCommentaryHeading: "RepoScope commentary",
  readerOrientationIntro:
    "Start with the project's own public description. The cited lines below are retained as repository evidence, not rewritten as fact.",
  readerCommunityStars: "Stars",
  readerCommunityWatch: "Watchers",
  readerCommunityForks: "Forks",
  readerCommunityOpenIssues: "Open issues and PRs",
  readerCommunityLastPush: "Last push",
  readerCommunityLicense: "License",
  readerCommunityFactAccessible: "{label}: {value}",
  readerCommunityPopularity:
    "Popularity reflects attention, not proof of quality or safety.",
  readerLicensePresent: "Evidence found",
  readerLicenseAbsent: "Not present",
  readerLicenseUnknown: "Not established",
  readerReadmeMissing: "No README interpretation is available.",
  readerReadmePartial:
    "README interpretation is partial; scan coverage may explain omissions.",
  readerPartialEvidence:
    "The scan was incomplete. The evidence below is retained, but this chapter may omit relevant files.",
  readerReadmeSectionMissing:
    "The scanned README evidence does not establish this section.",
  readerReadmeOverviewSubheading: "Project overview",
  readerReadmeAudienceSubheading: "Intended audience",
  readerReadmeProblemsSubheading: "Problems described",
  readerReadmeUseCasesSubheading: "Use cases described",
  readerReadmeDependenciesSubheading: "Requirements and dependencies",
  readerReadmeLimitationsSubheading: "Limitations stated",
  readerReadmeMaturitySubheading: "Maturity statements",
  readerCapabilitiesMissing:
    "The scanned README does not establish a bounded capability list.",
  readerWorkflowMissing:
    "The scanned README does not establish an ordered workflow.",
  readerComparisonClaimsHeading: "README evidence map",
  readerComparisonObservationsHeading: "Repository structure shows",
  readerComparisonKindsHeading: "Broad project kinds",
  readerComparisonEcosystemsHeading: "Observed ecosystems",
  readerComparisonSourceAreasHeading: "Top-level source areas",
  readerComparisonClaimsMissing:
    "The scanned README evidence does not provide a broad claim to compare.",
  readerComparisonObservationsMissing:
    "The scanned repository evidence does not establish a broad structural observation.",
  readerCommentaryWorthHeading: "Worth noting",
  readerCommentaryVerifyHeading: "Verify before relying on it",
  readerCommentaryPracticalHeading: "What this means in practice",
  readerCommentaryMissing:
    "The scanned evidence does not produce additional README commentary.",
  readerCommentarySubstantialOverview:
    "The README explains enough of the project position to support a first-pass fit check; its claims still need to be tested against your use case.",
  readerCommentaryAudience:
    "The README identifies an audience or concrete use cases, so compare those stated situations with the work you actually need to complete.",
  readerCommentaryCapabilities:
    "The README organizes capabilities into a bounded scope; use those groups as a trial checklist rather than proof that every path works.",
  readerCommentaryWorkflow:
    "The ordered README workflow gives a practical trial path; verify checkpoints, failure recovery, and required services as you follow it.",
  readerCommentaryOnboarding:
    "The README documents an onboarding path for installing, running, or developing the project; review repository-provided commands before execution.",
  readerCommentaryLimitations:
    "The README states project limitations; compare them with the boundaries and failure modes that matter to your deployment.",
  readerCommentaryMaturity:
    "The README includes maturity or project-status information; confirm release compatibility and unresolved issues before depending on it.",
  readerCommentaryCorroboration:
    "The repository's broad structure corroborates the README description.",
  readerCommentarySecurityGap:
    "Runtime security and data flow are not established. Before providing keys, accounts, or private content, confirm destinations, permissions, and retention.",
  readerCommentaryLimitationsGap:
    "The README does not establish project limitations. Trial the failure paths and operating boundaries that matter to you.",
  readerCommentaryMaturityGap:
    "The README does not establish project maturity. Check releases, issue history, and compatibility before long-term adoption.",
  readerCommentaryStructureVerification:
    "A broad README structure claim still needs verification against the repository tree.",
  readerCommentaryDependencies:
    "The README declares external requirements or dependencies; include their access, cost, availability, and data handling in the adoption decision.",
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
  readerGettingStartedRequirements: "README requirements and configuration",
  readerGettingStartedCommands: "Repository-provided steps",
  readerSecurityObserved: "Observed security and privacy signals",
  readerSecurityDeclarations: "Repository declarations",
  readerMaintenanceEvidence: "Observed maintenance evidence",
  readerMaintenanceFacts: "GitHub maintenance facts",
  readerAlternativesHeading: "Compare alternatives",
  readerComparisonHeading: "Use the same checks for every repository",
  readerAlternativeSearch:
    "Search GitHub repositories using these evidence terms",
  readerAlternativeSearchTerm: "Search GitHub for: {term}",
  readerSourceDocumentation: "{path} at inspected commit",
  readerSourceDeterministicAnalysis: "Deterministic analysis",
  readerSignalStateSummary: "{signal}: {state}",
  readerSignalStatePresent: "Present",
  readerSignalStateAbsent: "Not present",
  readerSignalStateUnknown: "Not established",
  readerSignalArchived: "Archived",
  readerSignalInstall: "Installation path",
  readerSignalRun: "Start or run path",
  readerSignalLicense: "License file or recognized metadata",
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
  readerActivity181To365: "more than 180 and up to 365 days",
  readerActivityOver365: "over 365 days",
  readerOpenIssues: "Open issues and PRs reported by GitHub: {count}",
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
  methodologyWeightItem: "{name}: {value}",
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
  deepExpertIndex: "OPTIONAL EXPERT BRIEFING",
  deepExpertHeading: "A human-readable second opinion",
  deepExpertIntro:
    "The review reads the README first, checks the repository’s own evidence, challenges weak claims, and turns the result into a practical briefing. The deterministic report remains available below.",
  deepChecking: "Checking whether expert interpretation is available…",
  deepGenerate: "Generate expert interpretation",
  deepRegenerate: "Regenerate expert interpretation",
  deepDisclosureHeading: "Before the expert panel starts",
  deepDisclosureEvidence:
    "Selected text from this public repository—including README, documentation, manifests, and public GitHub facts—is sent to GitHub Copilot.",
  deepDisclosureAllowance:
    "The analysis uses your GitHub Copilot entitlement and may count against its allowance.",
  deepDisclosureNoExecution:
    "RepoScope does not execute repository code, install dependencies, run commands, or give the panel tools.",
  deepDisclosureFallback:
    "If authorization or the panel fails, the deterministic browser report stays intact.",
  deepConsentConfirm: "Agree and continue with GitHub",
  deepConsentCancel: "Not now",
  deepAutomatic: "Generate automatically for later repositories",
  deepAutomaticHelp:
    "Only this preference is stored in the browser. GitHub credentials stay in the short-lived server session.",
  deepSignOut: "Sign out of expert mode",
  deepCancel: "Cancel expert analysis",
  deepRetry: "Try expert analysis again",
  deepReadyNote:
    "Ready to interpret the inspected commit. Existing scores and evidence will not be changed.",
  deepErrorCopilot:
    "GitHub Copilot is unavailable for this account or session. The deterministic report is still complete.",
  deepErrorAllowance:
    "The current Copilot allowance cannot complete this briefing. The deterministic report is unchanged.",
  deepErrorRateLimit:
    "Expert analysis has reached its temporary start limit. Try again later.",
  deepErrorRepository:
    "The repository changed since the browser scan. Refresh public data before generating a briefing.",
  deepErrorGitHub:
    "GitHub could not provide the bounded public evidence for this briefing.",
  deepErrorEvidence:
    "The expert output did not pass RepoScope’s evidence and safety checks, so it was not shown.",
  deepErrorCancelled: "Expert analysis was cancelled.",
  deepErrorInternal:
    "Expert analysis could not be completed. The deterministic report remains available.",
  deepProgressHeading: "Expert panel in progress",
  deepProgressLabel: "Expert analysis progress",
  deepStagePreparing: "Prepare public evidence",
  deepStageConsulting: "Consult three specialists",
  deepStageChallenging: "Challenge the findings",
  deepStageEditing: "Edit the briefing",
  deepStageValidating: "Validate every source",
  deepProgressPending: "Pending",
  deepProgressRunning: "In progress",
  deepProgressComplete: "Complete",
  deepProgressFailed: "Unavailable",
  deepProgressReused: "Reused saved briefing",
  deepProgressCacheHit:
    "A saved briefing was found. RepoScope is refreshing public facts and validating its sources.",
  deepRoleProduct: "Product and practical-use interpreter",
  deepRoleOnboarding: "Onboarding and broad-architecture reviewer",
  deepRoleTrust: "Trust, maintenance, and alternatives reviewer",
  deepReportIndex: "EXPERT INTERPRETATION",
  deepReportHeading: "Repository briefing",
  deepReportMethod:
    "README-first interpretation, checked against immutable repository evidence. Unsupported claims are marked as unknown.",
  deepCoverageFull: "Full panel coverage",
  deepCoverageReduced: "Reduced panel coverage",
  deepCapabilityAuto: "GitHub automatic model selection",
  deepCapabilityMulti: "Multiple eligible model families",
  deepChapterOrientation: "Thirty-second orientation",
  deepChapterFit: "Good fit / poor fit",
  deepChapterSituations: "Practical situations",
  deepChapterCapabilities: "Capabilities and workflow",
  deepChapterArchitecture: "How it broadly works",
  deepChapterOnboarding: "Install, run, and extend",
  deepChapterTrust: "Reliability, security, and privacy",
  deepChapterMaintenance: "Maintenance and community",
  deepChapterAlternatives: "Alternatives worth comparing",
  deepChapterVerdict: "Expert verdict",
  deepGoodFor: "Good fit",
  deepPoorFor: "Poor fit",
  deepCapabilities: "Capabilities",
  deepWorkflow: "Typical workflow",
  deepArchitectureSummary: "Product shape",
  deepArchitectureTechnologies: "Technology family",
  deepArchitectureConcepts: "Core concepts",
  deepPrerequisites: "Prerequisites",
  deepInstall: "Install",
  deepRun: "Run",
  deepDevelop: "Secondary development",
  deepCautions: "Cautions before executing anything",
  deepReliability: "Reliability signals",
  deepSecurity: "Security",
  deepPrivacy: "Privacy",
  deepUnknowns: "Not established",
  deepMaintenanceSignals: "Observed signals",
  deepCommunityStars: "Stars",
  deepCommunityWatchers: "Watch",
  deepCommunityForks: "Forks",
  deepCommunityIssues: "Open issues and PRs",
  deepCommunityPush: "Last push",
  deepCommunityArchived: "Archived",
  deepCommunityLicense: "License",
  deepPopularityCaveat:
    "Popularity indicates attention—not reliability, security, or suitability.",
  deepAlternativeRepository: "Repository",
  deepAlternativeWhy: "Why compare",
  deepAlternativeActivity: "Community and activity",
  deepAlternativesUnavailable:
    "No verified alternative repositories were available for this briefing.",
  deepDisagreements: "What the panel challenged",
  deepNextChecks: "What you should verify next",
  deepDecisionWorthTrying: "Worth trying",
  deepDecisionCompareFirst: "Compare first",
  deepDecisionNotEnough: "Not enough evidence",
  deepEvidenceDrawer: "Evidence cited by this briefing",
  deepEvidenceOpen: "Open immutable source",
  deepEvidenceUnavailable: "Source link unavailable",
  deepValueUnavailable: "No data",
  deepEvidenceGithub: "Public GitHub information",
  deepEvidenceReadme: "README source: {path}",
  deepEvidenceDocumentation: "Documentation: {path}",
  deepEvidenceManifest: "Manifest: {path}",
  deepEvidenceTree: "Repository tree",
  deepEvidenceAlternative: "Comparison repository",
  deepProvenanceRepository: "Repository states",
  deepProvenanceObserved: "Repository shows",
  deepProvenanceInterpretation: "Expert interpretation",
  deepProvenanceUnknown: "Not established",
  deepConfidenceHigh: "High confidence",
  deepConfidenceMedium: "Medium confidence",
  deepConfidenceLow: "Low confidence",
  privacyOptional:
    "The deterministic scan stays in this browser. An expert briefing runs only after authorization and sends selected public evidence to GitHub Copilot.",
  privacyOptionalMark: "BROWSER / OPTIONAL COPILOT",
  methodologyBoundaryOptional:
    "Repository source remains untrusted text and is never executed. The deterministic scan is local; only an authorized expert run sends selected public evidence to GitHub Copilot with zero tools.",
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
  tagline: "快速了解公开项目的用途、使用方法和采用前需要确认的事项。",
  heroTitle: "先看懂一个公开项目，再决定要不要用。",
  landingIndex: "公开项目解读",
  english: "English",
  simplifiedChinese: "简体中文",
  languageSwitcher: "语言",
  skipToContent: "跳到项目解读",
  privacy:
    "不需要登录，也不用提供 GitHub 访问令牌。RepoScope 只读取 GitHub 上的公开信息，基础分析直接在当前浏览器中完成，不会发送到 RepoScope 服务器。",
  privacyMark: "浏览器本地处理 / GITHUB",
  main: "RepoScope 公开项目解读",
  repositoryLabel: "公开 GitHub 仓库地址",
  repositoryHelper: "例如：https://github.com/owner/repository",
  repositoryError:
    "请输入有效的公开 GitHub 仓库地址，例如 https://github.com/owner/repository。",
  analyzeRepository: "开始解读",
  viewReport: "查看解读",
  analysisRunning: "正在解读项目",
  examplesLabel: "试试这些公开项目",
  methodology: "查看分析方法 1.0.0",
  methodologyIndex: "分析方法",
  methodologyHeading: "分析方法 1.0.0",
  methodologyIntro:
    "RepoScope 按固定规则检查 GitHub 上的公开信息，并从六个方面给出参考分：文档 15 分、可运行性 20 分、可读性 20 分、复杂度 20 分、测试 15 分、维护状况 10 分。",
  methodologyScope:
    "所有项目都会接受通用检查。JavaScript、TypeScript 和 Python 还会分析更多代码指标。其他语言仍有通用结果，但分析把握度会相应降低。",
  methodologySampling:
    "每次检查都会固定到一个提交，并按同一套顺序选择文本。最多读取 200 个文件和 10 MiB 解码文本，单个文件最多读取 256 KiB。",
  methodologyExclusions:
    "二进制、压缩、第三方源码、自动生成内容，以及依赖、构建产物、覆盖率、缓存和版本控制目录不会进入分析。",
  methodologyBoundary:
    "源码只会作为文本读取，RepoScope 不会运行其中的代码。基础分析不需要登录、访问令牌、后端或 AI 服务，也不会把仓库内容发送到 RepoScope 服务器。",
  methodologyLimitations:
    "评分只反映本次找到的信息和实际读取范围。规则判断与近似重复率不能证明软件一定能运行、足够安全或适合采用。",
  scanIndex: "实时解读",
  scanHeading: "正在读取项目",
  scanProgressLabel: "项目解读进度",
  cancelAnalysis: "取消分析",
  progressFiles: "已处理 {completed}/{total} 个文件",
  progressBytes: "已读取 {completed}/{total}",
  progressWorking: "这一阶段的耗时会随仓库大小变化，暂时无法准确估算剩余时间。",
  statusStarting: "开始解读项目",
  statusComplete: "项目解读完成",
  statusError: "未能完成项目解读",
  "phase.validating": "检查仓库地址",
  "phase.repository": "读取仓库目录",
  "phase.selecting": "确定读取范围",
  "phase.fetching": "读取公开文本",
  "phase.analyzing": "整理信息并评分",
  reportIndex: "项目解读报告",
  reportOverallScore: "综合评分",
  reportOverallStrong: "依据较充分",
  reportOverallSolid: "基础较扎实",
  reportOverallNeedsAttention: "有几项需要关注",
  reportOverallLimited: "现有依据有限",
  reportGeneralOnly: "仅通用分析",
  reportPreliminary: "初步报告",
  reportConfidence: "分析把握度",
  confidenceHigh: "把握较高",
  confidenceMedium: "把握一般",
  confidenceLow: "把握较低",
  reportScope: "选取 {selected} 个文件，读取 {fetched} 个，解析 {parsed} 个",
  reportCommit: "本次查看的提交",
  reportAnalyzedAt: "分析时间",
  reportDefaultBranch: "默认分支",
  reportRepositoryLink: "在 GitHub 打开项目",
  projectBriefRegion: "项目概览",
  projectBriefWhat: "这是做什么的",
  projectBriefFit: "可能适合谁",
  projectBriefKind: "属于哪类项目",
  projectBriefCautions: "使用前先看",
  projectBriefInsufficient: "目前找到的公开信息还不足以说明这个项目的用途。",
  projectBriefFitKnown:
    "如果项目说明符合你的需求，可以继续了解。仓库看起来属于这些类型：{kinds}。",
  projectBriefFitInsufficient: "现有公开信息还不足以判断它是否适合你。",
  projectBriefFitUnknown:
    "可以先把项目自己的介绍与你的需求对照。目前还无法可靠判断项目类型。",
  projectBriefKindUnknown: "暂时无法从公开信息判断。",
  projectBriefNoCautions: "这份概览没有列出其他注意事项。",
  projectBriefSourceDescription: "GitHub 仓库说明",
  projectBriefSourceReadme: "{path}（本次查看的提交）",
  projectBriefSourceManifest: "{path}（本次查看的提交）",
  projectBriefSourceTree: "{path}（本次查看的提交）",
  projectBriefSourceMetadata: "GitHub 仓库元数据",
  projectBriefSourceAnalysis: "RepoScope 规则分析",
  projectKindApplication: "应用程序",
  projectKindCommandLineTool: "命令行工具",
  projectKindLibrary: "软件库",
  projectKindPlugin: "插件",
  projectKindTemplate: "模板或起步项目",
  projectKindDocumentation: "文档项目",
  projectCautionArchived: "此仓库已归档。",
  projectCautionInsufficientExplanation:
    "公开说明和 README 没有讲清楚这个项目。",
  projectCautionLicenseEvidenceAbsent:
    "没有找到许可证文件，也没有看到 GitHub 识别出的许可证信息。",
  projectCautionEntryPointEvidenceAbsent: "没有找到明确的程序入口。",
  readerDecisionIndex: "先看结论",
  readerDecisionHeading: "是否值得继续了解",
  readerNavigationLabel: "项目解读目录",
  readerNavigationHeading: "快速查看你关心的内容",
  readerStatusContinue: "信息较完整，可以继续了解",
  readerStatusVerify: "还有重要问题，使用前需要确认",
  readerStatusInsufficient: "公开信息太少，暂时无法判断",
  readerPurposeHeading: "这个项目适合做什么",
  readerReliabilityHeading: "项目是否靠谱",
  readerArchitectureHeading: "代码大致怎么组织",
  readerGettingStartedHeading: "如何安装、运行和二次开发",
  readerSecurityHeading: "是否存在安全或隐私风险",
  readerMaintenanceHeading: "项目还在维护吗",
  readerInterpretationIndex: "README 解读",
  readerInterpretationTitle: "从 README 开始了解项目",
  readerOrientationHeading: "项目是做什么的",
  readerCommunityHeading: "社区热度与维护数据",
  readerTakeawaysHeading: "先看重点",
  readerTakeawayCapabilitiesHeading: "主要功能",
  readerTakeawayCapabilities: "README 把主要功能分成 {count}：{labels}。",
  readerTakeawayCapabilitiesMissing: "README 没有列出清晰的功能分组。",
  readerTakeawayWorkflowHeading: "怎么使用",
  readerTakeawayWorkflow: "README 或仓库提供了{details}。",
  readerTakeawayWorkflowMissing:
    "README 没有给出明确的操作步骤或可直接参考的命令。",
  readerTakeawayArchitectureHeading: "代码大致怎么组织",
  readerTakeawayArchitecture: "仓库目录显示：{details}。",
  readerTakeawayArchitectureKinds: "项目类型为{kinds}",
  readerTakeawayArchitectureEcosystems: "主要使用{ecosystems}",
  readerTakeawayArchitectureAreas: "源码主要分布在{areas}",
  readerTakeawayArchitectureDocumented:
    "仓库提供了 {references}，可以帮助理解模块职责。",
  readerTakeawayArchitectureMissing: "现有目录和文档还不足以说明代码如何组织。",
  readerTakeawayRiskHeading: "使用前还要确认",
  readerTakeawayRisk: "公开信息显示：{details}。",
  readerTakeawayRiskLicense: "{state}许可证文件或 GitHub 识别信息",
  readerTakeawayRiskSecurity: "{state}安全说明",
  readerTakeawayRiskConfiguration: "{state}配置示例",
  readerTakeawayBoundary:
    "以上内容来自公开仓库信息，只适合用于初步判断，不代表项目已经过运行、安全或适用性验证。",
  readerCountCapabilityGroup: "{count} 个主要功能分组",
  readerCountCapabilityGroups: "{count} 个主要功能分组",
  readerCountEvidenceCapabilityGroup: "{count} 个功能分组",
  readerCountEvidenceCapabilityGroups: "{count} 个功能分组",
  readerCountWorkflowStep: "{count} 个操作步骤",
  readerCountWorkflowSteps: "{count} 个操作步骤",
  readerCountOnboardingCommand: "{count} 类可参考命令",
  readerCountOnboardingCommands: "{count} 类可参考命令",
  readerCountSourceArea: "{count} 个主要区域",
  readerCountSourceAreas: "{count} 个主要区域",
  readerCountArchitectureReference: "{count} 处架构说明",
  readerCountArchitectureReferences: "{count} 处架构说明",
  readerCountRequirement: "{count} 项外部依赖或要求",
  readerCountRequirements: "{count} 项外部依赖或要求",
  readerCountCitedStatement: "{count} 条 README 原文",
  readerCountCitedStatements: "{count} 条 README 原文",
  readerCountDocumentedStep: "{count} 个文档步骤",
  readerCountDocumentedSteps: "{count} 个文档步骤",
  readerReadmeNarrativeHeading: "README 里怎么说",
  readerCapabilitiesHeading: "主要功能",
  readerWorkflowHeading: "README 给出的使用流程",
  readerClaimObservationHeading: "README 的说法与仓库情况",
  readerCommentaryHeading: "RepoScope 怎么看",
  readerOrientationIntro:
    "先看项目自己的介绍。下面会保留 README 原文，并与仓库中能确认的信息分开显示。",
  readerCommunityStars: "Star 数",
  readerCommunityWatch: "Watch 数",
  readerCommunityForks: "Fork 数",
  readerCommunityOpenIssues: "未关闭的 Issue 和 PR",
  readerCommunityLastPush: "最近推送",
  readerCommunityLicense: "许可证",
  readerCommunityFactAccessible: "{label}：{value}",
  readerCommunityPopularity:
    "这些数字只能说明项目受关注的程度，不能直接证明质量或安全性。",
  readerLicensePresent: "找到许可证文件或 GitHub 识别出的许可证信息",
  readerLicenseAbsent: "未找到许可证文件或 GitHub 识别出的许可证信息",
  readerLicenseUnknown: "暂时无法确认",
  readerReadmeMissing: "没有找到可供解读的 README。",
  readerReadmePartial:
    "本次未能完整获取首选 README，下面的解读可能来自有限的替代信息。",
  readerPartialEvidence:
    "本次没有读完所有可用文件。下面的信息仍可参考，但相关内容可能不完整。",
  readerReadmeSectionMissing: "已读取的 README 没有说明这一部分。",
  readerReadmeOverviewSubheading: "项目概述",
  readerReadmeAudienceSubheading: "适合谁",
  readerReadmeProblemsSubheading: "想解决什么问题",
  readerReadmeUseCasesSubheading: "适用场景",
  readerReadmeDependenciesSubheading: "运行要求与外部依赖",
  readerReadmeLimitationsSubheading: "已说明的限制",
  readerReadmeMaturitySubheading: "项目目前处于什么阶段",
  readerCapabilitiesMissing: "已读取的 README 没有列出清晰的功能范围。",
  readerWorkflowMissing: "已读取的 README 没有给出明确的操作顺序。",
  readerComparisonClaimsHeading: "README 提到的内容",
  readerComparisonObservationsHeading: "仓库里实际能看到什么",
  readerComparisonKindsHeading: "项目类型",
  readerComparisonEcosystemsHeading: "技术栈",
  readerComparisonSourceAreasHeading: "主要源码目录",
  readerComparisonClaimsMissing:
    "已读取的 README 没有提供可与仓库结构对照的说明。",
  readerComparisonObservationsMissing:
    "目前读取到的仓库信息还不足以看清整体结构。",
  readerCommentaryWorthHeading: "值得留意",
  readerCommentaryVerifyHeading: "使用前先确认",
  readerCommentaryPracticalHeading: "对你有什么影响",
  readerCommentaryMissing: "现有信息不足以给出更多解读。",
  readerCommentarySubstantialOverview:
    "README 已经把项目定位讲得比较清楚，可以先据此判断是否符合需求，再结合自己的场景试用。",
  readerCommentaryAudience:
    "README 提到了适用人群或具体场景，可以直接与你要完成的工作对照。",
  readerCommentaryCapabilities:
    "README 列出了清晰的功能范围。可以把这些分组当作试用清单，但不能据此认定所有功能都已验证。",
  readerCommentaryWorkflow:
    "README 给出了可以照着尝试的流程。实际执行时，还要留意失败后的处理方式和所需外部服务。",
  readerCommentaryOnboarding:
    "README 说明了如何安装、运行或参与开发。执行仓库中的命令前，仍需逐条检查。",
  readerCommentaryLimitations:
    "README 主动说明了项目限制。采用前还要确认这些限制是否会影响你的部署和使用。",
  readerCommentaryMaturity:
    "README 提到了项目阶段或当前状态。长期使用前，还要确认版本兼容性和未解决的问题。",
  readerCommentaryCorroboration:
    "仓库目录提供了项目类型和主要技术栈方面的结构信息。",
  readerCommentarySecurityGap:
    "目前还不知道项目运行时会把数据发往哪里。提供密钥、账号或未公开内容前，请先确认发送目标、权限范围和数据保留方式。",
  readerCommentaryLimitationsGap:
    "README 没有说明项目限制。试用时要重点检查你在意的失败场景和运行范围。",
  readerCommentaryMaturityGap:
    "README 没有说明项目目前是否成熟。长期使用前，请查看发布记录、Issue 历史和兼容范围。",
  readerCommentaryStructureVerification:
    "README 对项目结构的说明还需要结合实际目录确认。",
  readerCommentaryDependencies:
    "README 提到了外部要求或依赖。决定采用前，还要考虑访问条件、成本、可用性和数据处理方式。",
  readerUnavailable: "本次分析没有找到这方面的信息。",
  readerStepUnavailable: "本次分析没有找到这一步的说明。",
  readerNotEstablished: "现有公开信息还无法确认。",
  readerCommandReview:
    "这是仓库提供的命令。运行前请先确认它会安装什么、修改什么。",
  readerCommandWithheld:
    "这条命令可能包含敏感或异常内容，RepoScope 没有直接复制。请打开来源核对。",
  readerSecurityBoundary:
    "这份报告只分析公开文件，不会实际运行项目。因此，报告无法替你确认依赖漏洞、真实网络请求、权限使用、恶意行为或隐私合规情况。",
  technicalAppendixHeading: "技术附录与分析方法",
  readerStatedPurpose: "项目自己怎么介绍用途",
  readerScenariosHeading: "具体业务场景",
  readerScenariosMissing: "仓库未公开说明具体使用场景。",
  readerKindsHeading: "可能属于哪类项目",
  readerCautionsHeading: "使用前需要注意",
  readerEvidenceStatus: "当前判断",
  readerReliabilityReasons: "判断依据",
  readerQuestionsHeading: "还需要确认",
  readerQuickStartHeading: "最快上手方式",
  readerArchitectureEvidence: "仓库如何说明架构",
  readerArchitectureDocuments: "架构文档",
  readerArchitectureEntryPoints: "可能的程序入口",
  readerArchitectureSourceAreas: "主要源码目录",
  readerArchitectureEcosystems: "技术栈",
  readerGettingStartedRequirements: "运行前要准备什么",
  readerGettingStartedCommands: "仓库提供的命令",
  readerSecurityObserved: "本次找到的安全与隐私信息",
  readerSecurityDeclarations: "项目方的说明",
  readerMaintenanceEvidence: "仓库里的维护机制",
  readerMaintenanceFacts: "GitHub 维护数据",
  readerAlternativesHeading: "还可以对比哪些项目",
  readerComparisonHeading: "对比时建议统一检查这些方面",
  readerAlternativeSearch: "可用这些关键词在 GitHub 查找同类仓库",
  readerAlternativeSearchTerm: "在 GitHub 搜索“{term}”",
  readerSourceDocumentation: "{path}（本次查看的提交）",
  readerSourceDeterministicAnalysis: "RepoScope 规则分析",
  readerSignalStateSummary: "{signal}：{state}",
  readerSignalStatePresent: "已找到",
  readerSignalStateAbsent: "未找到",
  readerSignalStateUnknown: "暂时无法确认",
  readerSignalArchived: "归档标记",
  readerSignalInstall: "安装说明",
  readerSignalRun: "运行说明",
  readerSignalLicense: "许可证文件或 GitHub 识别信息",
  readerSignalRecentActivity: "近 180 天有更新",
  readerSignalTests: "自动化测试",
  readerSignalCi: "CI 配置",
  readerSignalCoverage: "测试覆盖率配置",
  readerSignalSecurityPolicy: "安全说明",
  readerSignalVersionHistory: "版本更新记录",
  readerSignalContributing: "参与贡献指南",
  readerSignalIssueTemplates: "Issue 或 PR 模板",
  readerSignalDependencyUpdates: "自动更新依赖",
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
  readerArchivedLabel: "归档状态",
  readerLastPush: "最近推送：{date}",
  readerActivity: "距今 {days} 天（{band}）",
  readerActivityWithin180: "近 180 天有更新",
  readerActivity181To365: "已有半年至一年未更新",
  readerActivityOver365: "已超过一年未更新",
  readerOpenIssues: "未关闭的 Issue 和 PR：{count}",
  readerComparisonPurpose: "用途",
  readerComparisonLicense: "许可证",
  readerComparisonOnboarding: "上手流程",
  readerComparisonTests: "自动化测试",
  readerComparisonSecurity: "安全流程",
  readerComparisonMaintenance: "维护状况",
  readerComparisonEcosystem: "生态适配",
  readerComparisonOperations: "运行约束",
  dimensionIndex: "02 / 六方面参考",
  dimensionsHeading: "各方面得分",
  dimensionDocumentation: "文档与上手体验",
  dimensionOperability: "安装与运行准备",
  dimensionReadability: "代码可读性",
  dimensionComplexity: "复杂度与结构",
  dimensionTesting: "测试与自动化",
  dimensionMaintenance: "维护状况",
  dimensionDocumentationDescription:
    "查看 README、上手说明、许可证、贡献指南和架构文档是否齐全。",
  dimensionOperabilityDescription:
    "查看项目入口、命令、示例、配置和版本信息是否齐全，但不会实际运行项目。",
  dimensionReadabilityDescription:
    "参考函数长度、嵌套层级、命名和相邻文档，帮助发现可能难读的代码。",
  dimensionComplexityDescription:
    "参考分支数量、文件长度、近似重复代码和能够识别的内部循环依赖。",
  dimensionTestingDescription:
    "查看测试文件、自动化流程、测试命令、静态检查和覆盖率配置，但不会实际执行测试。",
  dimensionMaintenanceDescription:
    "查看近期更新，以及维护说明、社区模板和依赖更新配置。",
  scoreOutOf: "{score} / 100",
  scoreAccessible: "{dimension}：{score} 分（满分 100）",
  unavailable: "暂无数据",
  strengthsIndex: "03 / 项目做得不错的地方",
  strengthsHeading: "目前能确认的优点",
  noStrengths: "暂时没有找到足够明确、可以列为优点的信息。",
  strengthItem: "优点：{ruleId}",
  improvementsIndex: "04 / 可以继续完善的地方",
  improvementsHeading: "建议优先改进",
  noImprovements: "当前规则没有列出适用的优先改进项。",
  improvementItem: "改进：{ruleId}",
  priorityHigh: "高优先级",
  priorityMedium: "中优先级",
  priorityLow: "低优先级",
  lostPoints: "这项最多可提升 {points} 分",
  evidenceLabel: "判断依据",
  suggestedAction: "建议怎么做",
  referencesLabel: "信息来源",
  coverageIndex: "05 / 本次读取范围",
  coverageHeading: "读了哪些内容，还有哪些限制",
  coverageSelected: "已选择文件",
  coverageFetched: "已获取文件",
  coverageParsed: "已解析文件",
  coverageSkipped: "已跳过文件",
  coverageFailed: "失败文件",
  coverageUnsupported: "不支持文件",
  coverageEligibleBytes: "可读取内容大小",
  coverageSelectedBytes: "选取内容大小",
  coverageFetchedBytes: "实际读取大小",
  coverageParsedBytes: "完成解析的大小",
  coverageEligibleSourceBytes: "可读取源码大小",
  coverageParsedSupportedBytes: "已解析的支持语言源码大小",
  coveragePartialTree: "GitHub 文件树不完整",
  coverageLimitReached: "已达到本次读取上限",
  coverageComplete: "已在设置的范围内读完可用目录",
  coverageDetails: "未读取或读取失败的文件",
  coverageSkippedReason: "已跳过：{reason}",
  coverageFailureReason: "{stage}失败：{reason}",
  coverageStageFetch: "获取",
  coverageStageParse: "解析",
  skipExcluded: "排除路径",
  skipBinary: "二进制或无效文本",
  skipOversized: "文件过大",
  skipUnsupported: "不支持的源码",
  skipBudget: "读取上限",
  skipInvalidEntry: "无效文件树条目",
  failureNotFound: "未找到",
  failureRateLimit: "频率限制",
  failureNetwork: "网络",
  failureApi: "GitHub API",
  failureInvalidResponse: "无效响应",
  failureFileLimit: "文件数量上限",
  failureInvalidText: "无效文本",
  failureTimeout: "超时",
  failureBudget: "读取上限",
  failureSyntax: "语法解析",
  evidenceIndex: "06 / 评分依据",
  evidenceExplorerHeading: "查看规则依据",
  evidenceDisclosure: "按维度、优先级和状态筛选",
  dimensionFilter: "维度",
  severityFilter: "优先级",
  stateFilter: "状态",
  filterAll: "全部",
  statePassed: "已满足",
  statePartial: "部分满足",
  stateFailed: "未满足",
  stateNotApplicable: "不适用",
  severityNotPrioritized: "无需优先处理",
  rulesShownOne: "显示 {count} 条规则",
  rulesShownMany: "显示 {count} 条规则",
  noEvidenceMatches: "没有符合当前筛选条件的内容。",
  noActionForRule: "这项目前没有改进建议。",
  fileLine: "{path}，第 {start} 行",
  fileLineRange: "{path}，第 {start} 至 {end} 行",
  copyChecklist: "复制改进清单",
  copyWorking: "正在复制",
  copySuccess: "已复制",
  copyFailure: "复制失败",
  refreshPublicData: "刷新公开数据",
  methodologyReportIndex: "07 / 分析方法",
  methodologyRegion: "分析方法",
  methodologyDisclosure: "查看权重、分档、排除项和使用限制",
  methodologyWeights: "各方面分值",
  methodologyWeightItem: "{name}：{value}",
  methodologyOverallThresholds:
    "总分分档：85 至 100 分表示依据较充分，70 至 84 分表示基础较扎实，50 至 69 分表示有几项需要关注，0 至 49 分表示现有依据有限。",
  methodologyConfidenceThresholds:
    "分析把握度：80 至 100 分为较高，60 至 79 分为一般，0 至 59 分为较低。它只表示本次读取的信息是否完整，不代表项目质量。",
  methodologyApplicability:
    "不适用的规则不会计分，没有可用信息的方面会显示为暂无数据。只做通用分析时，报告属于初步结果，不能与完整报告直接比较。",
  methodologyCompleteLink: "阅读完整分析方法",
  staleReport: "刷新失败，当前显示 {timestamp} 生成的报告。",
  errorIndex: "遇到问题",
  errorHeading: "这次没有分析成功",
  errorInvalidUrl: "请输入有效的公开 GitHub 仓库地址后重试。",
  errorNotFound: "未找到该项目，或该项目不是公开项目。",
  errorRateLimit: "GitHub 公开 API 的访问次数暂时用完了。",
  errorRateReset: "预计可在 {timestamp} 后重新请求 GitHub。",
  errorRateResetUnknown: "GitHub 没有提供可用的恢复时间。",
  errorEmpty: "这个项目没有可供读取的源码目录。",
  errorNetwork: "网络请求失败，请检查网络连接后重试。",
  errorApi: "GitHub 暂时无法完成请求，请在服务可用时重试。",
  errorInvalidResponse: "GitHub 返回的内容无法识别，请重新分析。",
  errorWorker: "浏览器中的分析进程已停止，请重新开始。",
  retryAnalysis: "重新分析",
  rateLimitDocumentation: "GitHub 频率限制文档",
  deepExpertIndex: "可选：深入解读",
  deepExpertHeading: "生成更深入的项目解读",
  deepExpertIntro:
    "这项功能会先阅读 README，再结合仓库内容复核关键说法，最后生成一份便于阅读的简报。前面的基础报告不会被覆盖。",
  deepChecking: "正在检查深入解读是否可用……",
  deepGenerate: "生成深入解读",
  deepRegenerate: "重新生成深入解读",
  deepDisclosureHeading: "开始前请确认",
  deepDisclosureEvidence:
    "项目中选取的 README、文档、清单和 GitHub 公开信息会发送给 GitHub Copilot。",
  deepDisclosureAllowance:
    "本次深入解读会使用你的 GitHub Copilot 权益，也可能占用相应额度。",
  deepDisclosureNoExecution:
    "RepoScope 不会执行项目代码、安装依赖或运行命令，分析模型也不能调用工具。",
  deepDisclosureFallback:
    "即使授权或深入解读失败，也不会影响浏览器里已有的基础报告。",
  deepConsentConfirm: "同意并使用 GitHub 继续",
  deepConsentCancel: "暂不使用",
  deepAutomatic: "以后搜索其他项目时自动生成深入解读",
  deepAutomaticHelp:
    "浏览器只保存这个偏好。GitHub 凭据只会短暂保存在服务端会话中。",
  deepSignOut: "退出深入解读",
  deepCancel: "取消深入解读",
  deepRetry: "重新尝试深入解读",
  deepReadyNote: "已准备好分析本次查看的提交。前面的评分和依据不会改变。",
  deepErrorCopilot:
    "当前账号或会话无法使用 GitHub Copilot，已有基础报告不受影响。",
  deepErrorAllowance: "当前 Copilot 额度不足，已有基础报告不受影响。",
  deepErrorRateLimit: "深入解读已达到临时启动上限，请稍后重试。",
  deepErrorRepository:
    "仓库在浏览器读取后有了更新，请先刷新公开信息再生成简报。",
  deepErrorGitHub: "GitHub 暂时无法提供本次深入解读需要的公开信息。",
  deepErrorEvidence:
    "深入解读的内容没有通过 RepoScope 的来源与安全检查，因此不会展示。",
  deepErrorCancelled: "深入解读已取消。",
  deepErrorInternal: "深入解读未能完成，已有基础报告仍然可用。",
  deepProgressHeading: "正在生成深入解读",
  deepProgressLabel: "深入解读进度",
  deepStagePreparing: "整理公开信息",
  deepStageConsulting: "并行分析用途、上手方式和可靠性",
  deepStageChallenging: "交叉核对初步结论",
  deepStageEditing: "整理最终简报",
  deepStageValidating: "逐条检查引用来源",
  deepProgressPending: "等待中",
  deepProgressRunning: "进行中",
  deepProgressComplete: "已完成",
  deepProgressFailed: "未能完成",
  deepProgressReused: "使用已核对的简报",
  deepProgressCacheHit:
    "已找到之前生成的简报。RepoScope 正在刷新公开信息，并重新核对引用来源。",
  deepRoleProduct: "产品用途与实际场景",
  deepRoleOnboarding: "上手方式与代码结构",
  deepRoleTrust: "可靠性、维护状态与替代方案",
  deepReportIndex: "深入解读",
  deepReportHeading: "项目简报",
  deepReportMethod:
    "先读 README，再与本次查看的提交逐条核对。没有足够依据的内容会标为“尚未确认”。",
  deepCoverageFull: "三项专项分析均已完成",
  deepCoverageReduced: "仅完成部分专项分析",
  deepCapabilityAuto: "GitHub 自动选择模型",
  deepCapabilityMulti: "按可用模型分配",
  deepChapterOrientation: "30 秒了解项目",
  deepChapterFit: "适合谁，不适合谁",
  deepChapterSituations: "可以用在哪些场景",
  deepChapterCapabilities: "主要功能和使用流程",
  deepChapterArchitecture: "代码大致怎么组织",
  deepChapterOnboarding: "如何安装、运行和二次开发",
  deepChapterTrust: "是否可靠，有哪些安全和隐私风险",
  deepChapterMaintenance: "项目还在维护吗",
  deepChapterAlternatives: "还可以对比哪些项目",
  deepChapterVerdict: "综合判断",
  deepGoodFor: "适合",
  deepPoorFor: "不适合",
  deepCapabilities: "核心能力",
  deepWorkflow: "怎么使用",
  deepArchitectureSummary: "整体结构",
  deepArchitectureTechnologies: "主要技术栈",
  deepArchitectureConcepts: "核心概念",
  deepPrerequisites: "前置条件",
  deepInstall: "安装",
  deepRun: "运行",
  deepDevelop: "二次开发",
  deepCautions: "开始前先确认",
  deepReliability: "可靠性依据",
  deepSecurity: "安全",
  deepPrivacy: "隐私",
  deepUnknowns: "尚未确认",
  deepMaintenanceSignals: "维护情况",
  deepCommunityStars: "Star 数",
  deepCommunityWatchers: "Watch 数",
  deepCommunityForks: "Fork 数",
  deepCommunityIssues: "未关闭的 Issue 和 PR",
  deepCommunityPush: "最近推送",
  deepCommunityArchived: "归档状态",
  deepCommunityLicense: "许可证",
  deepPopularityCaveat:
    "这些数字只能说明项目受关注的程度，不能直接证明它可靠、安全或适合你的场景。",
  deepAlternativeRepository: "项目",
  deepAlternativeWhy: "为什么值得对比",
  deepAlternativeActivity: "社区与活跃度",
  deepAlternativesUnavailable: "这次没有找到可以核对信息的替代项目。",
  deepDisagreements: "哪些结论仍需确认",
  deepNextChecks: "接下来还要确认什么",
  deepDecisionWorthTrying: "值得尝试",
  deepDecisionCompareFirst: "先做对比",
  deepDecisionNotEnough: "现有信息不足",
  deepEvidenceDrawer: "查看这份简报引用的来源",
  deepEvidenceOpen: "打开本次查看的原始资料",
  deepEvidenceUnavailable: "暂无可打开的来源链接",
  deepValueUnavailable: "暂无数据",
  deepEvidenceGithub: "GitHub 公开信息",
  deepEvidenceReadme: "README 原文：{path}",
  deepEvidenceDocumentation: "项目文档：{path}",
  deepEvidenceManifest: "项目清单：{path}",
  deepEvidenceTree: "仓库目录",
  deepEvidenceAlternative: "对比项目",
  deepProvenanceRepository: "项目方说明",
  deepProvenanceObserved: "仓库中可确认",
  deepProvenanceInterpretation: "分析判断",
  deepProvenanceUnknown: "尚未确认",
  deepConfidenceHigh: "把握较高",
  deepConfidenceMedium: "把握一般",
  deepConfidenceLow: "把握较低",
  privacyOptional:
    "基础分析仍在此浏览器中完成。只有经过授权的深入解读会把选定公开信息发送给 GitHub Copilot。",
  privacyOptionalMark: "浏览器 / 可选 COPILOT",
  methodologyBoundaryOptional:
    "项目源码仍只会作为文本读取，RepoScope 不会运行其中的代码。基础分析在浏览器中完成；只有你同意生成深入解读时，选取的公开信息才会发送给 GitHub Copilot，模型不会获得工具调用权限。",
  markdownTitle: "RepoScope 改进清单",
  markdownRepository: "项目",
  markdownCommit: "提交",
  markdownRuleset: "规则版本",
  markdownConfidence: "分析把握度",
  markdownScope: "范围",
  markdownImprovements: "按优先级排序的改进事项",
  markdownNoImprovements: "当前规则没有列出适用的优先改进项。",
  markdownEvidence: "判断依据",
  markdownAction: "建议",
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
      zh: "首选 README：{exists}。",
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
      zh: "贡献指南：{exists}。",
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
      zh: "添加常见的许可证文件，明确项目使用条款。",
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
      zh: "标准包或构建清单：{exists}。",
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
      zh: "在 {total} 个函数中，{count} 个包含错误处理结构。",
    },
    recommendation: {
      en: "Add explicit error handling where failures cross function boundaries; this metric is only structural evidence.",
      zh: "当错误需要从一个函数传递到另一个函数时，请明确处理方式。这个数字只能说明代码结构。",
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
      zh: "配置示例或配置章节：{exists}。",
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
      zh: "发现 {components} 组循环导入，最大一组涉及 {largest} 个文件。",
    },
    recommendation: {
      en: "Break resolvable internal import cycles by moving shared contracts behind one dependency direction.",
      zh: "把共用类型或接口放到依赖方向更清楚的位置，逐步拆开能够识别的循环导入。",
    },
  },
  "testing.test-files": {
    evidence: {
      en: "Recognized test files: {count}; test configuration: {configuration}.",
      zh: "受识别的测试文件：{count}；测试配置：{configuration}。",
    },
    recommendation: {
      en: "Add recognized test files, not only test-tool configuration.",
      zh: "添加实际测试文件，不要只提交测试工具配置。",
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
      zh: "CI 配置：{exists}。",
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
      zh: "覆盖率配置或命令：{exists}。",
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
      zh: "标准依赖锁文件：{exists}。",
    },
    recommendation: {
      en: "Commit the standard dependency lockfile when the project ecosystem uses one.",
      zh: "若项目生态使用锁文件，请提交标准依赖锁文件。",
    },
  },
  "maintenance.dependency-updates": {
    evidence: {
      en: "Automated dependency-update configuration present: {exists}.",
      zh: "自动更新依赖的配置：{exists}。",
    },
    recommendation: {
      en: "Configure Dependabot or Renovate for routine dependency updates.",
      zh: "配置 Dependabot 或 Renovate 进行常规依赖更新。",
    },
  },
  "maintenance.templates": {
    evidence: {
      en: "Issue or pull-request templates present: {exists}.",
      zh: "Issue 或 PR 模板：{exists}。",
    },
    recommendation: {
      en: "Add issue or pull-request templates that request actionable context.",
      zh: "添加 Issue 或 PR 模板，引导提交者提供处理问题所需的信息。",
    },
  },
  "maintenance.security": {
    evidence: {
      en: "Security policy present: {exists}.",
      zh: "安全说明文件：{exists}。",
    },
    recommendation: {
      en: "Add a SECURITY policy with a private vulnerability-reporting path.",
      zh: "添加 SECURITY 政策，并提供私密漏洞报告渠道。",
    },
  },
  "maintenance.code-of-conduct": {
    evidence: {
      en: "Code of conduct present: {exists}.",
      zh: "社区行为准则：{exists}。",
    },
    recommendation: {
      en: "Add a code of conduct for community participation.",
      zh: "添加社区参与行为准则。",
    },
  },
  "maintenance.version-history": {
    evidence: {
      en: "Versioned changelog or release-notes file present: {exists}.",
      zh: "带版本号的更新日志或发布说明：{exists}。",
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
    `- ${copy.markdownScope}${separator}${scopeLabels.join(language === "zh-CN" ? "、" : ", ")}${language === "zh-CN" ? "；" : "; "}${formatMessage(
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
