import { describe, expect, it } from "vitest";

import { messages } from "./messages";
import { getInitialLanguage } from "./use-language";
import { RULE_IDS } from "../features/rules/rules";

const placeholders = (value: string) =>
  [...value.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/gu)]
    .map((match) => match[1])
    .sort();

describe("bilingual message contract", () => {
  it("keeps English and Chinese keys exhaustive and selects browser Chinese", () => {
    expect(Object.keys(messages.en).sort()).toEqual(
      Object.keys(messages["zh-CN"]).sort(),
    );
    expect(getInitialLanguage(["zh-CN", "en"], null)).toBe("zh-CN");
    expect(getInitialLanguage(["fr-BE"], null)).toBe("en");
    expect(getInitialLanguage(["en"], "zh-CN")).toBe("zh-CN");
  });

  it("keeps placeholders identical across English and Chinese", () => {
    for (const key of Object.keys(messages.en) as Array<
      keyof typeof messages.en
    >) {
      expect(placeholders(messages["zh-CN"][key]), key).toEqual(
        placeholders(messages.en[key]),
      );
    }
  });

  it("uses native Chinese copy and stable community terminology", () => {
    expect(messages["zh-CN"]).toMatchObject({
      heroTitle: "先看懂一个公开项目，再决定要不要用。",
      privacy:
        "不需要登录，也不用提供 GitHub 访问令牌。RepoScope 只读取 GitHub 上的公开信息，基础分析直接在当前浏览器中完成，不会发送到 RepoScope 服务器。",
      progressWorking:
        "这一阶段的耗时会随仓库大小变化，暂时无法准确估算剩余时间。",
      reportOverallStrong: "依据较充分",
      reportOverallSolid: "基础较扎实",
      reportOverallNeedsAttention: "有几项需要关注",
      reportOverallLimited: "现有依据有限",
      reportConfidence: "分析把握度",
      confidenceHigh: "把握较高",
      confidenceMedium: "把握一般",
      confidenceLow: "把握较低",
      readerDecisionHeading: "是否值得继续了解",
      readerTakeawayCapabilitiesHeading: "主要功能",
      readerTakeawayWorkflowHeading: "怎么使用",
      readerTakeawayArchitectureHeading: "代码大致怎么组织",
      readerTakeawayRiskHeading: "使用前还要确认",
      readerCommunityStars: "Star 数",
      readerCommunityWatch: "Watch 数",
      readerCommunityForks: "Fork 数",
      readerCommunityOpenIssues: "未关闭的 Issue 和 PR",
      readerCommunityFactAccessible: "{label}：{value}",
      readerSignalStateSummary: "{signal}：{state}",
      readerAlternativeSearchTerm: "在 GitHub 搜索“{term}”",
      methodologyWeightItem: "{name}：{value}",
      readerTakeawayWorkflow: "README 或仓库提供了{details}。",
      readerTakeawayArchitecture: "仓库目录显示：{details}。",
      readerTakeawayArchitectureKinds: "项目类型为{kinds}",
      readerTakeawayArchitectureEcosystems: "主要使用{ecosystems}",
      readerTakeawayArchitectureAreas: "源码主要分布在{areas}",
      readerTakeawayRisk: "公开信息显示：{details}。",
      readerTakeawayRiskLicense: "{state}许可证文件或 GitHub 识别信息",
      readerTakeawayRiskSecurity: "{state}安全说明",
      readerTakeawayRiskConfiguration: "{state}配置示例",
      readerTakeawayBoundary:
        "以上内容来自公开仓库信息，只适合用于初步判断，不代表项目已经过运行、安全或适用性验证。",
      deepValueUnavailable: "暂无数据",
      deepEvidenceGithub: "GitHub 公开信息",
      deepEvidenceReadme: "README 原文：{path}",
      deepEvidenceDocumentation: "项目文档：{path}",
      deepEvidenceManifest: "项目清单：{path}",
      deepEvidenceTree: "仓库目录",
      deepEvidenceAlternative: "对比项目",
      deepExpertHeading: "生成更深入的项目解读",
      deepProgressHeading: "正在生成深入解读",
      deepStageConsulting: "并行分析用途、上手方式和可靠性",
      deepStageChallenging: "交叉核对初步结论",
      deepDisagreements: "哪些结论仍需确认",
    });

    expect(messages.en).toMatchObject({
      readerCommunityFactAccessible: "{label}: {value}",
      readerSignalStateSummary: "{signal}: {state}",
      readerAlternativeSearchTerm: "Search GitHub for: {term}",
      methodologyWeightItem: "{name}: {value}",
      readerTakeawayWorkflow: "The README or repository provides {details}.",
      readerTakeawayArchitecture: "The repository suggests {details}.",
      readerTakeawayRisk: "Public evidence shows {details}.",
      readerTakeawayArchitectureKinds: "Project type: {kinds}",
      readerTakeawayArchitectureEcosystems:
        "Technology ecosystem: {ecosystems}",
      readerTakeawayArchitectureAreas: "Source layout: {areas}",
      readerTakeawayRiskLicense: "License information: {state}",
      readerTakeawayRiskSecurity: "Security policy: {state}",
      readerTakeawayRiskConfiguration: "Configuration examples: {state}",
      deepEvidenceDocumentation: "Documentation: {path}",
      deepEvidenceManifest: "Manifest: {path}",
    });

    const chineseCopy = Object.values(messages["zh-CN"]).join("\n");
    for (const translatedPhrase of [
      "证据档案",
      "能力轮廓",
      "实现轮廓",
      "采用边界",
      "宽泛",
      "有边界",
      "UTC 日",
      "安全文本边界",
      "确定性分析",
      "Forks（派生）",
      "—",
      "–",
    ]) {
      expect(chineseCopy, translatedPhrase).not.toContain(translatedPhrase);
    }
  });

  it("contains exhaustive bilingual evidence and recommendation templates", () => {
    for (const ruleId of RULE_IDS) {
      expect(`evidence.${ruleId}` in messages.en).toBe(true);
      expect(`evidence.${ruleId}` in messages["zh-CN"]).toBe(true);
      expect(`recommendation.${ruleId}` in messages.en).toBe(true);
      expect(`recommendation.${ruleId}` in messages["zh-CN"]).toBe(true);
    }
  });

  it("freezes the human-reader landing and decision copy in both languages", () => {
    expect({
      tagline: messages.en.tagline,
      heroTitle: messages.en.heroTitle,
      decision: messages.en.readerDecisionHeading,
      continue: messages.en.readerStatusContinue,
      verify: messages.en.readerStatusVerify,
      insufficient: messages.en.readerStatusInsufficient,
      purpose: messages.en.readerPurposeHeading,
      reliability: messages.en.readerReliabilityHeading,
      architecture: messages.en.readerArchitectureHeading,
      gettingStarted: messages.en.readerGettingStartedHeading,
      security: messages.en.readerSecurityHeading,
      maintenance: messages.en.readerMaintenanceHeading,
      unavailable: messages.en.readerUnavailable,
      stepUnavailable: messages.en.readerStepUnavailable,
      notEstablished: messages.en.readerNotEstablished,
      review: messages.en.readerCommandReview,
      withheld: messages.en.readerCommandWithheld,
      boundary: messages.en.readerSecurityBoundary,
      appendix: messages.en.technicalAppendixHeading,
    }).toEqual({
      tagline:
        "Understand what a public project does, how to use it, and what to verify.",
      heroTitle: "Understand a public project before you depend on it.",
      decision: "Project decision summary",
      continue: "Sufficient evidence to continue evaluation",
      verify: "Key gaps require verification before use",
      insufficient: "Public evidence is insufficient to judge",
      purpose: "Project-fit cautions",
      reliability: "Evidence of reliability",
      architecture: "How it broadly works",
      gettingStarted: "Install, run, and develop",
      security: "Security and privacy risks",
      maintenance: "Activity, maintenance, and alternatives",
      unavailable: "Repository does not provide this evidence.",
      stepUnavailable: "Repository does not provide this step.",
      notEstablished: "Not established from the scanned public evidence.",
      review: "Repository-provided command — review before running.",
      withheld:
        "A documented command exists, but RepoScope did not copy it because it did not pass the safe-text boundary.",
      boundary:
        "RepoScope does not execute the project, scan dependencies for vulnerabilities, observe runtime traffic, verify permissions, detect malicious behavior, or prove privacy compliance.",
      appendix: "Technical evidence and methodology",
    });

    expect({
      tagline: messages["zh-CN"].tagline,
      heroTitle: messages["zh-CN"].heroTitle,
      decision: messages["zh-CN"].readerDecisionHeading,
      continue: messages["zh-CN"].readerStatusContinue,
      verify: messages["zh-CN"].readerStatusVerify,
      insufficient: messages["zh-CN"].readerStatusInsufficient,
      purpose: messages["zh-CN"].readerPurposeHeading,
      reliability: messages["zh-CN"].readerReliabilityHeading,
      architecture: messages["zh-CN"].readerArchitectureHeading,
      gettingStarted: messages["zh-CN"].readerGettingStartedHeading,
      security: messages["zh-CN"].readerSecurityHeading,
      maintenance: messages["zh-CN"].readerMaintenanceHeading,
      unavailable: messages["zh-CN"].readerUnavailable,
      stepUnavailable: messages["zh-CN"].readerStepUnavailable,
      notEstablished: messages["zh-CN"].readerNotEstablished,
      review: messages["zh-CN"].readerCommandReview,
      withheld: messages["zh-CN"].readerCommandWithheld,
      boundary: messages["zh-CN"].readerSecurityBoundary,
      appendix: messages["zh-CN"].technicalAppendixHeading,
    }).toEqual({
      tagline: "快速了解公开项目的用途、使用方法和采用前需要确认的事项。",
      heroTitle: "先看懂一个公开项目，再决定要不要用。",
      decision: "是否值得继续了解",
      continue: "信息较完整，可以继续了解",
      verify: "还有重要问题，使用前需要确认",
      insufficient: "公开信息太少，暂时无法判断",
      purpose: "这个项目适合做什么",
      reliability: "项目是否靠谱",
      architecture: "代码大致怎么组织",
      gettingStarted: "如何安装、运行和二次开发",
      security: "是否存在安全或隐私风险",
      maintenance: "项目还在维护吗",
      unavailable: "本次分析没有找到这方面的信息。",
      stepUnavailable: "本次分析没有找到这一步的说明。",
      notEstablished: "现有公开信息还无法确认。",
      review: "这是仓库提供的命令。运行前请先确认它会安装什么、修改什么。",
      withheld:
        "这条命令可能包含敏感或异常内容，RepoScope 没有直接复制。请打开来源核对。",
      boundary:
        "这份报告只分析公开文件，不会实际运行项目。因此，报告无法替你确认依赖漏洞、真实网络请求、权限使用、恶意行为或隐私合规情况。",
      appendix: "技术附录与分析方法",
    });
  });

  it("keeps every verification question and comparison item bilingual", () => {
    expect([
      messages.en.readerQuestionLicense,
      messages.en.readerQuestionInstallRun,
      messages.en.readerQuestionRuntimeData,
      messages.en.readerQuestionVulnerabilities,
      messages.en.readerQuestionRelease,
    ]).toEqual([
      "Is the license compatible with the intended use?",
      "Can the documented install and start path be reproduced in an isolated environment?",
      "Which data leaves the local environment at runtime?",
      "How are vulnerabilities reported and patched?",
      "Is the last supported release compatible with the intended platform?",
    ]);
    expect([
      messages["zh-CN"].readerQuestionLicense,
      messages["zh-CN"].readerQuestionInstallRun,
      messages["zh-CN"].readerQuestionRuntimeData,
      messages["zh-CN"].readerQuestionVulnerabilities,
      messages["zh-CN"].readerQuestionRelease,
    ]).toEqual([
      "许可证是否与预期用途兼容？",
      "能否在隔离环境中复现文档中的安装与启动流程？",
      "运行时有哪些数据会离开本地环境？",
      "漏洞如何报告和修复？",
      "最近受支持的版本是否与预期平台兼容？",
    ]);

    expect([
      messages.en.readerComparisonPurpose,
      messages.en.readerComparisonLicense,
      messages.en.readerComparisonOnboarding,
      messages.en.readerComparisonTests,
      messages.en.readerComparisonSecurity,
      messages.en.readerComparisonMaintenance,
      messages.en.readerComparisonEcosystem,
      messages.en.readerComparisonOperations,
    ]).toEqual([
      "Purpose",
      "License",
      "Onboarding",
      "Automated tests",
      "Security process",
      "Maintenance",
      "Ecosystem fit",
      "Operational constraints",
    ]);
  });

  it("keeps the expert disclosure, progress, chapters, and empty states bilingual", () => {
    expect([
      messages.en.deepDisclosureEvidence,
      messages.en.deepDisclosureAllowance,
      messages.en.deepDisclosureNoExecution,
      messages.en.deepDisclosureFallback,
    ]).toEqual([
      "Selected text from this public repository—including README, documentation, manifests, and public GitHub facts—is sent to GitHub Copilot.",
      "The analysis uses your GitHub Copilot entitlement and may count against its allowance.",
      "RepoScope does not execute repository code, install dependencies, run commands, or give the panel tools.",
      "If authorization or the panel fails, the deterministic browser report stays intact.",
    ]);
    expect([
      messages.en.deepChapterOrientation,
      messages.en.deepChapterFit,
      messages.en.deepChapterSituations,
      messages.en.deepChapterCapabilities,
      messages.en.deepChapterArchitecture,
      messages.en.deepChapterOnboarding,
      messages.en.deepChapterTrust,
      messages.en.deepChapterMaintenance,
      messages.en.deepChapterAlternatives,
      messages.en.deepChapterVerdict,
    ]).toHaveLength(10);
    expect(messages.en.deepProgressCacheHit).toMatch(/saved briefing/iu);
    expect(messages["zh-CN"].deepProgressCacheHit).toMatch(/之前生成的简报/u);
    expect(messages.en.deepAlternativesUnavailable).toMatch(
      /no verified alternative/iu,
    );
    expect(messages["zh-CN"].deepAlternativesUnavailable).toMatch(
      /没有找到可以核对信息的替代项目/u,
    );
    expect(Object.keys(messages.en).sort()).toEqual(
      Object.keys(messages["zh-CN"]).sort(),
    );
  });

  it("freezes the README interpretation structure and commentary in both languages", () => {
    expect([
      messages.en.readerOrientationHeading,
      messages.en.readerCommunityHeading,
      messages.en.readerReadmeNarrativeHeading,
      messages.en.readerCapabilitiesHeading,
      messages.en.readerWorkflowHeading,
      messages.en.readerClaimObservationHeading,
      messages.en.readerCommentaryHeading,
    ]).toEqual([
      "Project orientation",
      "Community and maintenance facts",
      "What the README says",
      "Core capabilities",
      "Documented workflow",
      "README claims and repository observations",
      "RepoScope commentary",
    ]);
    expect([
      messages["zh-CN"].readerOrientationHeading,
      messages["zh-CN"].readerCommunityHeading,
      messages["zh-CN"].readerReadmeNarrativeHeading,
      messages["zh-CN"].readerCapabilitiesHeading,
      messages["zh-CN"].readerWorkflowHeading,
      messages["zh-CN"].readerClaimObservationHeading,
      messages["zh-CN"].readerCommentaryHeading,
    ]).toEqual([
      "项目是做什么的",
      "社区热度与维护数据",
      "README 里怎么说",
      "主要功能",
      "README 给出的使用流程",
      "README 的说法与仓库情况",
      "RepoScope 怎么看",
    ]);

    expect(messages.en.readerArchitectureHeading).toBe("How it broadly works");
    expect(messages["zh-CN"].readerArchitectureHeading).toBe(
      "代码大致怎么组织",
    );
    expect(messages.en.readerCommunityPopularity).toBe(
      "Popularity reflects attention, not proof of quality or safety.",
    );
    expect(messages["zh-CN"].readerCommunityPopularity).toBe(
      "这些数字只能说明项目受关注的程度，不能直接证明质量或安全性。",
    );
  });
});
