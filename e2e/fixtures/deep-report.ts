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
      orientation: "这个工具帮助普通读者快速看懂公开仓库。",
      verdict: "可以先在非关键项目里小范围试用，再决定是否采用。",
      goodFor: "适合想快速判断一个开源项目值不值得继续研究的人。",
      poorFor: "如果你需要生产环境安全审计，不能用这份简报代替。",
      situation: "引入陌生依赖前，可以先用它做第一轮筛选。",
      capabilityTitle: "它的核心做法是先读 README，再给出解读。",
      capabilityItem:
        "报告先讲项目用途、上手方式和风险，不会把函数细节堆在前面。",
      workflow: "提交公开仓库后，会先看到基础报告，需要时再生成深入解读。",
      architecture: "公开信息收集、基础分析和可选的深入解读会分开处理。",
      technology: "仓库清单表明，客户端主要使用 TypeScript。",
      concept:
        "报告固定到一个提交，每条判断都带来源，结论不会超出所查版本和证据。",
      prerequisite: "参与开发前，需要准备 README 指定的 Node.js 和 pnpm 版本。",
      install: "README 给出了可复现的依赖安装命令。",
      run: "README 说明了怎样在本地启动项目。",
      develop: "二次开发可以先从界面、分析器或测试入手。",
      caution: "执行仓库里的任何命令前，都要先由人检查。",
      reliability: "报告固定到具体提交，基础分析也可重复，因此更容易核对。",
      security:
        "RepoScope 只把公开仓库内容当作不可信文本，不会执行其中的内容。",
      privacy: "专家模式应该只发送生成简报所需的那部分公开信息。",
      unknown: "现有证据无法确认它在生产环境中长期运行是否稳定。",
      maintenance: "最近一次推送和未关闭的 Issue 能帮助读者判断维护情况。",
      signal: "GitHub 元数据显示，仓库尚未归档，许可证为 MIT。",
      alternative: "这个项目解决的问题相近，可以对比两者的上手成本。",
      disagreement: "几位专家对新团队首次部署要花多久看法不一。",
      next: "下一步可以在隔离环境里验证安装、运行和卸载流程。",
      final: "综合来看，可以先做一次小范围试用，并确保能够回退。",
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
