import type { Language } from "../../src/features/analysis/model";
import type {
  DeepAnalysisEvent,
  DeepAnalysisRequest,
  DeepReport,
  DeepStatement,
} from "../../src/features/deep-analysis/model";

const GENERATED_AT = "2026-08-11T12:00:00.000Z";

function statement(
  text: string,
  evidenceId: string,
  provenance: DeepStatement["provenance"] = "interpretation",
): DeepStatement {
  return {
    text,
    provenance,
    confidence: provenance === "unknown" ? "low" : "high",
    evidenceIds: provenance === "unknown" ? [] : [evidenceId],
  };
}

function wording(language: Language) {
  if (language === "zh-CN") {
    return {
      orientation: "这是一个面向普通读者的公开仓库解读工具。",
      verdict: "现有证据支持先在非关键项目中小范围试用。",
      goodFor: "适合需要快速判断开源项目是否值得继续研究的读者。",
      poorFor: "不适合把简报当成生产环境安全审计的替代品。",
      situation: "可以在引入陌生依赖前用它完成第一轮项目筛选。",
      capabilityTitle: "README 优先解读是这个项目的核心能力。",
      capabilityItem: "简报把项目用途、上手路径和风险放在函数细节之前。",
      workflow: "读者提交公开仓库后，先看确定性报告，再选择专家解读。",
      architecture: "产品把公开证据采集、确定性分析和可选专家解释分开。",
      technology: "仓库清单显示客户端主要使用 TypeScript。",
      concept: "固定提交和逐条证据引用限制了结论的适用范围。",
      prerequisite: "贡献者需要 README 声明的 Node.js 与 pnpm 版本。",
      install: "README 给出了可复现的依赖安装命令。",
      run: "README 说明了本地启动方式。",
      develop: "二次开发可以从界面、分析器和测试三个区域入手。",
      caution: "执行仓库提供的任何命令之前仍需人工检查。",
      reliability: "固定提交与确定性基线让这份简报更容易复核。",
      security: "公开仓库内容只能作为不可信文本处理，不能直接执行。",
      privacy: "专家模式只应发送生成简报所需的有限公开证据。",
      unknown: "生产环境的长期稳定性尚未由现有证据确认。",
      maintenance: "最近推送和开放 Issue 提供了维护状态线索。",
      signal: "GitHub 元数据显示仓库尚未归档并使用 MIT 许可证。",
      alternative: "这个替代项目解决相近问题，值得比较上手成本。",
      disagreement: "专家对新团队完成首次部署所需时间存在不同判断。",
      next: "下一步应在隔离环境验证安装、运行与卸载流程。",
      final: "综合证据后，建议带着明确边界进行一次可回退的试用。",
    };
  }
  return {
    orientation:
      "This project turns public repository evidence into a briefing for human readers.",
    verdict:
      "The available evidence supports a bounded trial outside critical systems.",
    goodFor:
      "It fits readers who need a quick first-pass decision about unfamiliar open source.",
    poorFor:
      "It does not replace a production security audit or hands-on verification.",
    situation:
      "Use it to screen an unfamiliar dependency before investing in a full evaluation.",
    capabilityTitle: "README-first interpretation is the central capability.",
    capabilityItem:
      "The briefing puts purpose, onboarding, and risks ahead of function-level commentary.",
    workflow:
      "A reader submits a public repository, reviews deterministic facts, then requests expert interpretation.",
    architecture:
      "The product separates public evidence acquisition, deterministic analysis, and optional interpretation.",
    technology:
      "The repository manifest identifies TypeScript as the main client technology.",
    concept:
      "Pinned commits and statement-level citations bound what each conclusion can claim.",
    prerequisite:
      "Contributors need the Node.js and pnpm versions declared by the README.",
    install:
      "The README provides a reproducible dependency installation command.",
    run: "The README documents how to start the project locally.",
    develop:
      "Secondary development can begin in the interface, analyzer, and test areas.",
    caution:
      "Repository-provided commands still require human review before execution.",
    reliability:
      "A pinned commit and deterministic baseline make the briefing easier to verify.",
    security:
      "Public repository content must remain inert text and must never be executed.",
    privacy:
      "Expert mode should send only the bounded public evidence needed for the briefing.",
    unknown:
      "Long-term production reliability is not established by the available evidence.",
    maintenance:
      "Recent pushes and open issues provide useful maintenance context.",
    signal:
      "GitHub metadata shows that the repository is active, unarchived, and MIT licensed.",
    alternative:
      "This alternative addresses a similar need and merits an onboarding-cost comparison.",
    disagreement:
      "Reviewers differed on how quickly a new team could complete its first deployment.",
    next: "Next, verify installation, operation, and removal in an isolated environment.",
    final:
      "On balance, the evidence supports a reversible trial with explicit boundaries.",
  };
}

/** Builds a strict, request-matching report for browser protocol fixtures. */
export function makeDeepReport(request: DeepAnalysisRequest): DeepReport {
  const words = wording(request.language);
  const repositoryUrl = `https://github.com/${request.repository.owner}/${request.repository.repo}`;
  const readmeUrl = `${repositoryUrl}/blob/${request.repository.commitSha}/README.md`;
  const manifestUrl = `${repositoryUrl}/blob/${request.repository.commitSha}/package.json`;

  return {
    schemaVersion: "1.0.0",
    repository: { ...request.repository },
    language: request.language,
    generatedAt: GENERATED_AT,
    review: { coverage: "full", capabilityClass: "multi-model" },
    orientation: {
      summary: [statement(words.orientation, "ev-0002")],
      verdict: statement(words.verdict, "ev-0001"),
    },
    fit: {
      goodFor: [statement(words.goodFor, "ev-0002")],
      poorFor: [statement(words.poorFor, "ev-0001")],
    },
    situations: [statement(words.situation, "ev-0002")],
    capabilities: [
      {
        title: statement(words.capabilityTitle, "ev-0002", "observed-fact"),
        items: [statement(words.capabilityItem, "ev-0002")],
      },
    ],
    workflow: [statement(words.workflow, "ev-0002", "observed-fact")],
    architecture: {
      summary: [statement(words.architecture, "ev-0002")],
      technologies: [statement(words.technology, "ev-0003", "observed-fact")],
      concepts: [statement(words.concept, "ev-0002")],
    },
    onboarding: {
      prerequisites: [
        statement(words.prerequisite, "ev-0002", "observed-fact"),
      ],
      install: [statement(words.install, "ev-0002", "observed-fact")],
      run: [statement(words.run, "ev-0002", "observed-fact")],
      develop: [statement(words.develop, "ev-0003")],
      cautions: [statement(words.caution, "ev-0002")],
    },
    trust: {
      reliability: [statement(words.reliability, "ev-0001")],
      security: [statement(words.security, "ev-0002")],
      privacy: [statement(words.privacy, "ev-0001")],
      unknowns: [statement(words.unknown, "", "unknown")],
    },
    maintenance: {
      summary: [statement(words.maintenance, "ev-0001")],
      signals: [statement(words.signal, "ev-0001", "observed-fact")],
      community: {
        stars: 1284,
        forks: 146,
        watchers: 37,
        openIssues: 23,
        pushedAt: "2026-08-10T08:00:00.000Z",
        archived: false,
        license: "MIT",
      },
    },
    alternatives: [
      {
        repository: { owner: "example", repo: "reader-alternative" },
        github: {
          stars: 987,
          forks: 81,
          watchers: 24,
          openIssues: 11,
          pushedAt: "2026-08-09T08:00:00.000Z",
          archived: false,
          license: "Apache-2.0",
        },
        whyCompare: statement(words.alternative, "ev-0004"),
      },
    ],
    disagreements: [statement(words.disagreement, "ev-0001")],
    nextChecks: [statement(words.next, "ev-0002")],
    finalVerdict: {
      decision: "worth-trying",
      summary: statement(words.final, "ev-0001"),
    },
    evidence: [
      {
        id: "ev-0001",
        kind: "github",
        label: "Pinned public GitHub metadata",
        path: null,
        url: repositoryUrl,
      },
      {
        id: "ev-0002",
        kind: "readme",
        label: "README at the inspected commit",
        path: "README.md",
        url: readmeUrl,
      },
      {
        id: "ev-0003",
        kind: "manifest",
        label: "Package manifest at the inspected commit",
        path: "package.json",
        url: manifestUrl,
      },
      {
        id: "ev-0004",
        kind: "alternative",
        label: "Verified comparison repository",
        path: null,
        url: "https://github.com/example/reader-alternative",
      },
    ],
  };
}

export function successfulDeepEvents(
  request: DeepAnalysisRequest,
  report = makeDeepReport(request),
): DeepAnalysisEvent[] {
  return [
    { type: "stage", stage: "preparing-evidence" },
    { type: "stage", stage: "consulting-specialists" },
    { type: "specialist", role: "product", status: "started" },
    { type: "specialist", role: "product", status: "complete" },
    {
      type: "specialist",
      role: "onboarding-architecture",
      status: "started",
    },
    {
      type: "specialist",
      role: "onboarding-architecture",
      status: "complete",
    },
    { type: "specialist", role: "trust-ecosystem", status: "started" },
    { type: "specialist", role: "trust-ecosystem", status: "complete" },
    { type: "stage", stage: "challenging-findings" },
    { type: "stage", stage: "editing-briefing" },
    { type: "stage", stage: "validating-sources" },
    { type: "complete", report },
  ];
}
