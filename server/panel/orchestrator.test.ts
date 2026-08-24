import { describe, expect, it, vi } from "vitest";

import type { DeepStatement } from "../../src/features/deep-analysis/model.js";
import { buildEvidencePack } from "../evidence/build-evidence-pack.js";
import type { EvidencePack } from "../evidence/model.js";
import { VERIFIED_GITHUB_SNAPSHOT } from "../test/github-fixtures.js";
import {
  PanelModelGatewayError,
  type PanelModelRun,
} from "./copilot-gateway.js";
import {
  CHALLENGE_DESTINATIONS,
  ROLE_REQUIRED_SECTIONS,
  type DeepReportDraft,
  type ExpertReview,
  type ExpertRole,
  type SkepticalReview,
} from "./model.js";
import {
  PanelOrchestrationError,
  runExpertPanel,
  type PanelProgressEvent,
} from "./orchestrator.js";

const ACQUIRED_AT = "2026-08-23T00:00:00.000Z";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture value");
  return value;
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function evidencePack(): EvidencePack {
  return buildEvidencePack({
    snapshot: VERIFIED_GITHUB_SNAPSHOT,
    files: [],
    acquiredAt: ACQUIRED_AT,
  });
}

function narrativeId(pack: EvidencePack): string {
  return required(
    pack.facts.find(
      (fact) => fact.trust === "observed" && fact.retention === "narrative",
    ),
  ).id;
}

function expertReview(role: ExpertRole, pack: EvidencePack): ExpertReview {
  const evidenceId = narrativeId(pack);
  return {
    schemaVersion: "1.0.0",
    role,
    findings: ROLE_REQUIRED_SECTIONS[role].map((section, index) => ({
      id: `finding-${role}-${String(index + 1).padStart(4, "0")}`,
      section,
      claim: `Grounded ${role} finding ${String(index + 1)}`,
      provenance: "observed-fact",
      confidence: "high",
      importance: index === 0 ? "primary" : "supporting",
      evidenceIds: [evidenceId],
    })),
    unknowns: [],
  };
}

function skepticalReview(
  product: ExpertReview,
  pack: EvidencePack,
): SkepticalReview {
  return {
    schemaVersion: "1.0.0",
    challenges: [
      {
        id: "challenge-0001",
        findingId: required(product.findings[0]).id,
        kind: "unsupported",
        reason: "The primary claim needs explicit qualification.",
        evidenceIds: [narrativeId(pack)],
      },
    ],
  };
}

function statement(text: string, pack: EvidencePack): DeepStatement {
  return {
    text,
    provenance: "observed-fact",
    confidence: "high",
    evidenceIds: [narrativeId(pack)],
  };
}

function fullDraft(
  challenge: SkepticalReview["challenges"][number],
  pack: EvidencePack,
): DeepReportDraft {
  const linked = {
    statement: statement("Primary challenge resolution", pack),
    sourceChallengeId: challenge.id,
  };
  const disagreements =
    CHALLENGE_DESTINATIONS[challenge.kind] === "disagreements" ? [linked] : [];
  const nextChecks =
    CHALLENGE_DESTINATIONS[challenge.kind] === "nextChecks"
      ? [linked]
      : [
          {
            statement: statement(
              "Verify the remaining operational assumptions",
              pack,
            ),
            sourceChallengeId: null,
          },
        ];
  return {
    schemaVersion: "1.0.0",
    language: "en",
    orientation: {
      summary: [statement("Orientation summary", pack)],
      verdict: statement("Orientation verdict", pack),
    },
    fit: {
      goodFor: [statement("Appropriate user fit", pack)],
      poorFor: [statement("Inappropriate user fit", pack)],
    },
    situations: [statement("Representative situation", pack)],
    capabilities: [
      {
        title: statement("Capability group", pack),
        items: [statement("Capability item", pack)],
      },
    ],
    workflow: [statement("Observed workflow", pack)],
    architecture: {
      summary: [statement("Architecture summary", pack)],
      technologies: [statement("Architecture technology", pack)],
      concepts: [statement("Architecture concept", pack)],
    },
    onboarding: {
      prerequisites: [statement("Onboarding prerequisite", pack)],
      install: [statement("Onboarding installation", pack)],
      run: [statement("Onboarding run step", pack)],
      develop: [statement("Onboarding development step", pack)],
      cautions: [statement("Onboarding caution", pack)],
    },
    trust: {
      reliability: [statement("Reliability assessment", pack)],
      security: [statement("Security assessment", pack)],
      privacy: [statement("Privacy assessment", pack)],
      unknowns: [
        {
          text: "Evidence does not establish every trust property",
          provenance: "unknown",
          confidence: "low",
          evidenceIds: [],
        },
      ],
    },
    maintenance: {
      summary: [statement("Maintenance summary", pack)],
      signals: [statement("Maintenance signal", pack)],
    },
    alternatives: [],
    disagreements,
    nextChecks,
    finalVerdict: {
      decision: "compare-first",
      summary: statement("Final qualified verdict", pack),
    },
  };
}

function fakeRun(implementation: PanelModelRun["runJson"]): PanelModelRun {
  return {
    allocation: {
      capabilityClass: "auto",
      product: null,
      onboardingArchitecture: null,
      trustEcosystem: null,
      skeptic: null,
      editor: null,
    },
    candidates: [],
    runJson: implementation,
    close: vi.fn(() => Promise.resolve()),
    async [Symbol.asyncDispose]() {
      await this.close();
    },
  };
}

function successfulImplementation(
  pack: EvidencePack,
  calls: string[],
): PanelModelRun["runJson"] {
  const product = expertReview("product", pack);
  const skeptic = skepticalReview(product, pack);
  return ({ role, prompt }) => {
    calls.push(role);
    if (role === "product") return Promise.resolve(JSON.stringify(product));
    if (role === "onboarding-architecture")
      return Promise.resolve(JSON.stringify(expertReview(role, pack)));
    if (role === "trust-ecosystem")
      return Promise.resolve(JSON.stringify(expertReview(role, pack)));
    if (role === "skeptic") return Promise.resolve(JSON.stringify(skeptic));
    expect(prompt.user).toContain("BEGIN_SKEPTICAL_REVIEW_JSON");
    return Promise.resolve(
      JSON.stringify(fullDraft(required(skeptic.challenges[0]), pack)),
    );
  };
}

describe("runExpertPanel", () => {
  it("dispatches every specialist before waiting for any specialist result", async () => {
    const pack = evidencePack();
    const started: string[] = [];
    const releases = new Map<string, (value: string) => void>();
    const specialistsReady = deferred<true>();
    const modelRun = fakeRun(({ role }) => {
      if (role === "skeptic") {
        const product = expertReview("product", pack);
        return Promise.resolve(JSON.stringify(skepticalReview(product, pack)));
      }
      if (role === "editor") {
        const product = expertReview("product", pack);
        const skeptic = skepticalReview(product, pack);
        return Promise.resolve(
          JSON.stringify(fullDraft(required(skeptic.challenges[0]), pack)),
        );
      }
      started.push(role);
      if (started.length === 3) specialistsReady.resolve(true);
      return new Promise<string>((resolve) => {
        releases.set(role, resolve);
      });
    });

    const running = runExpertPanel({
      pack,
      language: "en",
      modelRun,
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    });
    await specialistsReady.promise;
    expect(started).toEqual([
      "product",
      "onboarding-architecture",
      "trust-ecosystem",
    ]);
    for (const role of started) {
      releases.get(role)?.(
        JSON.stringify(expertReview(role as ExpertRole, pack)),
      );
    }
    await expect(running).resolves.toMatchObject({ coverage: "full" });
  });

  it("fans one abort signal into all in-flight specialists", async () => {
    const pack = evidencePack();
    const controller = new AbortController();
    const ready = deferred<true>();
    const events: PanelProgressEvent[] = [];
    let specialistCalls = 0;
    const modelRun = fakeRun(({ role }) => {
      if (role === "skeptic" || role === "editor") {
        return Promise.reject(new Error("later roles must not start"));
      }
      specialistCalls += 1;
      return new Promise<string>((_resolve, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => {
            reject(new PanelModelGatewayError("aborted"));
          },
          { once: true },
        );
        if (specialistCalls === 3) ready.resolve(true);
      });
    });
    const running = runExpertPanel({
      pack,
      language: "en",
      modelRun,
      signal: controller.signal,
      onEvent: (event) => events.push(event),
    });

    await ready.promise;
    controller.abort(new Error("private abort reason"));

    await expect(running).rejects.toEqual(
      expect.objectContaining<Partial<PanelOrchestrationError>>({
        kind: "aborted",
        message: "panel-orchestration-aborted",
      }),
    );
    expect(specialistCalls).toBe(3);
    expect(
      events.filter(
        (event) => event.type === "specialist" && event.status === "failed",
      ),
    ).toHaveLength(3);
  });

  it("starts all specialists before the skeptic and emits canonical progress", async () => {
    const pack = evidencePack();
    const calls: string[] = [];
    const events: PanelProgressEvent[] = [];
    const result = await runExpertPanel({
      pack,
      language: "en",
      modelRun: fakeRun(successfulImplementation(pack, calls)),
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });

    expect(calls.slice(0, 3)).toEqual([
      "product",
      "onboarding-architecture",
      "trust-ecosystem",
    ]);
    expect(calls.slice(3)).toEqual(["skeptic", "editor"]);
    expect(result.coverage).toBe("full");
    expect(events).toEqual([
      { type: "stage", stage: "consulting-specialists" },
      { type: "specialist", role: "product", status: "started" },
      {
        type: "specialist",
        role: "onboarding-architecture",
        status: "started",
      },
      { type: "specialist", role: "trust-ecosystem", status: "started" },
      { type: "specialist", role: "product", status: "complete" },
      {
        type: "specialist",
        role: "onboarding-architecture",
        status: "complete",
      },
      { type: "specialist", role: "trust-ecosystem", status: "complete" },
      { type: "stage", stage: "challenging-findings" },
      { type: "stage", stage: "editing-briefing" },
    ]);
  });

  it("retries one transport failure and permits one failed specialist when coverage remains", async () => {
    const pack = evidencePack();
    const calls: string[] = [];
    const successful = successfulImplementation(pack, calls);
    let trustAttempts = 0;
    const modelRun = fakeRun(async (request) => {
      if (request.role === "trust-ecosystem") {
        calls.push(request.role);
        trustAttempts += 1;
        throw new PanelModelGatewayError("transport");
      }
      return await successful(request);
    });

    const result = await runExpertPanel({
      pack,
      language: "en",
      modelRun,
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    });
    expect(trustAttempts).toBe(2);
    expect(result.coverage).toBe("reduced");
    expect(result.acceptedExpertReviews.map(({ role }) => role)).toEqual([
      "product",
      "onboarding-architecture",
    ]);
  });

  it("uses at most one schema repair across the entire panel", async () => {
    const pack = evidencePack();
    const calls: string[] = [];
    const successful = successfulImplementation(pack, calls);
    let productAttempts = 0;
    const modelRun = fakeRun(async (request) => {
      if (request.role === "product") {
        calls.push(request.role);
        productAttempts += 1;
        return productAttempts === 1
          ? "not json"
          : JSON.stringify(expertReview("product", pack));
      }
      return await successful(request);
    });

    const result = await runExpertPanel({
      pack,
      language: "en",
      modelRun,
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    });
    expect(result.coverage).toBe("full");
    expect(productAttempts).toBe(2);
  });

  it("does not grant a second role another schema repair", async () => {
    const pack = evidencePack();
    const calls: string[] = [];
    const successful = successfulImplementation(pack, calls);
    let productAttempts = 0;
    let trustAttempts = 0;
    const modelRun = fakeRun(async (request) => {
      if (request.role === "product") {
        productAttempts += 1;
        return productAttempts === 1
          ? "not json"
          : JSON.stringify(expertReview("product", pack));
      }
      if (request.role === "trust-ecosystem") {
        trustAttempts += 1;
        return "also not json";
      }
      return await successful(request);
    });

    const result = await runExpertPanel({
      pack,
      language: "en",
      modelRun,
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    });
    expect(productAttempts).toBe(2);
    expect(trustAttempts).toBe(1);
    expect(result.coverage).toBe("reduced");
  });

  it("shares one transport retry per role across original and repair calls", async () => {
    const pack = evidencePack();
    const onboarding = expertReview("onboarding-architecture", pack);
    const skeptic = skepticalReview(onboarding, pack);
    let productAttempts = 0;
    const modelRun = fakeRun((request) => {
      if (request.role === "onboarding-architecture") {
        return Promise.resolve(JSON.stringify(onboarding));
      }
      if (request.role === "trust-ecosystem") {
        return Promise.resolve(
          JSON.stringify(expertReview(request.role, pack)),
        );
      }
      if (request.role === "skeptic") {
        return Promise.resolve(JSON.stringify(skeptic));
      }
      if (request.role === "editor") {
        return Promise.resolve(
          JSON.stringify(fullDraft(required(skeptic.challenges[0]), pack)),
        );
      }
      productAttempts += 1;
      if (productAttempts === 1 || productAttempts >= 3) {
        return Promise.reject(new PanelModelGatewayError("transport"));
      }
      return Promise.resolve("not json");
    });

    const result = await runExpertPanel({
      pack,
      language: "en",
      modelRun,
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    });
    expect(productAttempts).toBe(3);
    expect(result.coverage).toBe("reduced");
  });

  it("does not repair an invented evidence reference", async () => {
    const pack = evidencePack();
    const calls: string[] = [];
    const successful = successfulImplementation(pack, calls);
    let trustAttempts = 0;
    const modelRun = fakeRun(async (request) => {
      if (request.role === "trust-ecosystem") {
        calls.push(request.role);
        trustAttempts += 1;
        const forged = expertReview("trust-ecosystem", pack);
        required(forged.findings[0]).evidenceIds = ["evi-invented"];
        return JSON.stringify(forged);
      }
      return await successful(request);
    });

    const result = await runExpertPanel({
      pack,
      language: "en",
      modelRun,
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    });
    expect(trustAttempts).toBe(1);
    expect(result.coverage).toBe("reduced");
  });

  it("fails locally when two specialists cannot provide complete coverage", async () => {
    const pack = evidencePack();
    const product = expertReview("product", pack);
    const modelRun = fakeRun(({ role }) => {
      if (role === "product") return Promise.resolve(JSON.stringify(product));
      return Promise.reject(new PanelModelGatewayError("transport"));
    });

    await expect(
      runExpertPanel({
        pack,
        language: "en",
        modelRun,
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PanelOrchestrationError>>({
        kind: "insufficient-coverage",
      }),
    );
  });
});
