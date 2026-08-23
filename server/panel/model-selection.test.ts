import { describe, expect, it, vi } from "vitest";

import {
  allocatePanelModels,
  highestSupportedReasoningEffort,
  modelForPanelRole,
  normalizePanelModelCandidates,
} from "./model-selection.js";
import type { PanelModelCandidate } from "./model-selection.js";

function model(
  id: string,
  options: {
    readonly policy?: "enabled" | "disabled" | "unconfigured";
    readonly reasoning?: readonly unknown[];
    readonly supportsReasoning?: boolean;
  } = {},
): unknown {
  return {
    id,
    name: id,
    capabilities: {
      supports: { reasoningEffort: options.supportsReasoning ?? false },
      limits: { max_context_window_tokens: 100_000 },
    },
    ...(options.policy === undefined
      ? {}
      : { policy: { state: options.policy, terms: "" } }),
    ...(options.reasoning === undefined
      ? {}
      : { supportedReasoningEfforts: [...options.reasoning] }),
  };
}

describe("normalizePanelModelCandidates", () => {
  it("snapshots policy and only actually advertised reasoning efforts", () => {
    const candidates = normalizePanelModelCandidates([
      model("claude-sonnet-4.6", {
        policy: "enabled",
        supportsReasoning: true,
        reasoning: ["high", "bogus", "low", "high", "max"],
      }),
      model("gpt-5.4", {
        policy: "disabled",
        supportsReasoning: true,
        reasoning: ["xhigh"],
      }),
      model("gemini-3-pro", {
        policy: "unconfigured",
        supportsReasoning: true,
        reasoning: ["high"],
      }),
      model("no-capability", {
        reasoning: ["max"],
      }),
    ]);

    expect(candidates).toEqual([
      {
        id: "claude-sonnet-4.6",
        policyAllowed: true,
        reasoningEfforts: ["low", "high", "max"],
      },
      {
        id: "gpt-5.4",
        policyAllowed: false,
        reasoningEfforts: ["xhigh"],
      },
      {
        id: "gemini-3-pro",
        policyAllowed: false,
        reasoningEfforts: ["high"],
      },
      {
        id: "no-capability",
        policyAllowed: true,
        reasoningEfforts: [],
      },
    ]);
  });

  it("uses first-valid ID wins and fails closed on malformed policy", () => {
    const candidates = normalizePanelModelCandidates([
      model("same", { supportsReasoning: true, reasoning: ["low"] }),
      model("same", { supportsReasoning: true, reasoning: ["max"] }),
      Object.assign({}, model("bad-policy"), {
        policy: { state: "future-state" },
      }),
      Object.assign({}, model("bad-policy-shape"), { policy: "enabled" }),
    ]);

    expect(candidates).toEqual([
      { id: "same", policyAllowed: true, reasoningEfforts: ["low"] },
      {
        id: "bad-policy",
        policyAllowed: false,
        reasoningEfforts: [],
      },
      {
        id: "bad-policy-shape",
        policyAllowed: false,
        reasoningEfforts: [],
      },
    ]);
  });

  it("never invokes accessors and tolerates proxies, cycles, and partial entries", () => {
    const getter = vi.fn(() => "stolen-model");
    const accessor = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessor, "id", { get: getter, enumerable: true });
    const cyclic = model("cyclic") as Record<string, unknown>;
    cyclic.capabilities = cyclic;
    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("hostile trap");
        },
        getPrototypeOf() {
          throw new Error("hostile trap");
        },
      },
    );

    expect(() =>
      normalizePanelModelCandidates([
        accessor,
        hostile,
        cyclic,
        null,
        42,
        { id: "" },
      ]),
    ).not.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(normalizePanelModelCandidates([cyclic])).toEqual([
      { id: "cyclic", policyAllowed: true, reasoningEfforts: [] },
    ]);
  });

  it("rejects hostile and sparse outer arrays without partial acceptance", () => {
    const sparse: unknown[] = [];
    sparse.length = 2;
    sparse[1] = model("hidden-after-hole");
    const hostile = new Proxy([model("hidden")], {
      getOwnPropertyDescriptor() {
        throw new Error("hostile trap");
      },
    });

    expect(normalizePanelModelCandidates(sparse)).toEqual([]);
    expect(normalizePanelModelCandidates(hostile)).toEqual([]);
    expect(normalizePanelModelCandidates("not-an-array")).toEqual([]);
  });
});

describe("allocatePanelModels", () => {
  it("prefers three normalized families and strongest actual reasoning", () => {
    const candidates = normalizePanelModelCandidates([
      model("claude-sonnet-4.5", {
        supportsReasoning: true,
        reasoning: ["low", "max"],
      }),
      model("claude-sonnet-4.6", {
        supportsReasoning: true,
        reasoning: ["xhigh"],
      }),
      model("gpt-5.4", {
        supportsReasoning: true,
        reasoning: ["high"],
      }),
      model("gemini-3-pro"),
    ]);

    const allocation = allocatePanelModels(candidates);

    expect(allocation).toEqual({
      capabilityClass: "multi-model",
      product: "claude-sonnet-4.5",
      onboardingArchitecture: "gpt-5.4",
      trustEcosystem: "gemini-3-pro",
      skeptic: "claude-sonnet-4.5",
      editor: "claude-sonnet-4.6",
    });
    expect(
      highestSupportedReasoningEffort(
        candidates.find(({ id }) => id === allocation.skeptic),
      ),
    ).toBe("max");
    expect(modelForPanelRole(allocation, "onboarding-architecture")).toBe(
      "gpt-5.4",
    );
  });

  it("falls back to deterministic reuse when fewer families are available", () => {
    const candidates: PanelModelCandidate[] = [
      { id: "gpt-5.4", policyAllowed: true, reasoningEfforts: [] },
    ];

    expect(allocatePanelModels(candidates)).toEqual({
      capabilityClass: "multi-model",
      product: "gpt-5.4",
      onboardingArchitecture: "gpt-5.4",
      trustEcosystem: "gpt-5.4",
      skeptic: "gpt-5.4",
      editor: "gpt-5.4",
    });
  });

  it("treats versions before variant suffixes as one normalized family", () => {
    const candidates: PanelModelCandidate[] = [
      {
        id: "gemini-3-pro",
        policyAllowed: true,
        reasoningEfforts: [],
      },
      {
        id: "gemini-3.1-pro-preview",
        policyAllowed: true,
        reasoningEfforts: [],
      },
      {
        id: "gpt-5.2-codex",
        policyAllowed: true,
        reasoningEfforts: [],
      },
      {
        id: "claude-sonnet-4.6",
        policyAllowed: true,
        reasoningEfforts: [],
      },
    ];

    expect(allocatePanelModels(candidates)).toMatchObject({
      product: "gemini-3-pro",
      onboardingArchitecture: "gpt-5.2-codex",
      trustEcosystem: "claude-sonnet-4.6",
    });
  });

  it("uses runtime auto selection when no concrete policy-allowed model exists", () => {
    const candidates: PanelModelCandidate[] = [
      { id: "auto", policyAllowed: true, reasoningEfforts: ["max"] },
      { id: "disabled", policyAllowed: false, reasoningEfforts: ["max"] },
    ];

    expect(allocatePanelModels(candidates)).toEqual({
      capabilityClass: "auto",
      product: null,
      onboardingArchitecture: null,
      trustEcosystem: null,
      skeptic: null,
      editor: null,
    });
  });
});
