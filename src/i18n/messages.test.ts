import { describe, expect, it } from "vitest";

import { messages } from "./messages";
import { getInitialLanguage } from "./use-language";
import { RULE_IDS } from "../features/rules/rules";

describe("bilingual message contract", () => {
  it("keeps English and Chinese keys exhaustive and selects browser Chinese", () => {
    expect(Object.keys(messages.en).sort()).toEqual(
      Object.keys(messages["zh-CN"]).sort(),
    );
    expect(getInitialLanguage(["zh-CN", "en"], null)).toBe("zh-CN");
    expect(getInitialLanguage(["fr-BE"], null)).toBe("en");
    expect(getInitialLanguage(["en"], "zh-CN")).toBe("zh-CN");
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
      tagline: "看懂一个公开项目做什么、怎么使用，以及哪些事项必须核实。",
      heroTitle: "在依赖一个公开项目之前，先真正看懂它。",
      decision: "项目决策摘要",
      continue: "有较充分证据，可以继续评估",
      verify: "存在关键缺口，使用前需要核实",
      insufficient: "公开证据不足，暂时无法判断",
      purpose: "项目适用性注意事项",
      reliability: "是否靠谱",
      architecture: "整体如何运作",
      gettingStarted: "安装、运行和二次开发",
      security: "安全与隐私风险",
      maintenance: "活跃度、维护状况和替代方案",
      unavailable: "仓库未提供这项证据。",
      stepUnavailable: "仓库未提供这一步骤。",
      notEstablished: "无法从已扫描的公开证据中确认。",
      review: "仓库提供的命令——运行前请先检查。",
      withheld:
        "仓库提供了命令，但该内容未通过安全文本边界，因此 RepoScope 未复制。",
      boundary:
        "RepoScope 不会执行项目、扫描依赖漏洞、观察运行时流量、验证权限、检测恶意行为或证明隐私合规。",
      appendix: "技术证据与方法",
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
      "项目定位",
      "社区与维护事实",
      "README 如何介绍项目",
      "核心能力",
      "README 中的工作流程",
      "README 声明与仓库观察",
      "RepoScope 解读",
    ]);

    expect(messages.en.readerArchitectureHeading).toBe("How it broadly works");
    expect(messages["zh-CN"].readerArchitectureHeading).toBe("整体如何运作");
    expect(messages.en.readerCommunityPopularity).toBe(
      "Popularity reflects attention, not proof of quality or safety.",
    );
    expect(messages["zh-CN"].readerCommunityPopularity).toBe(
      "流行度反映关注程度，不能证明项目质量或安全性。",
    );
  });
});
