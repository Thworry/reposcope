import type { ExpertRole } from "./model.js";

export type PanelReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface PanelModelCandidate {
  id: string;
  policyAllowed: boolean;
  reasoningEfforts: PanelReasoningEffort[];
}

export interface PanelModelAllocation {
  capabilityClass: "auto" | "multi-model";
  product: string | null;
  onboardingArchitecture: string | null;
  trustEcosystem: string | null;
  skeptic: string | null;
  editor: string | null;
}

export type PanelModelRole = ExpertRole | "skeptic" | "editor";

const REASONING_EFFORTS = Object.freeze<PanelReasoningEffort[]>([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

const MAX_MODEL_COUNT = 256;
const MAX_MODEL_ID_CODE_POINTS = 256;

function ownDataProperty(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor
      ? (descriptor.value as unknown)
      : undefined;
  } catch {
    return undefined;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  try {
    if (Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value) as unknown;
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function safeDenseArray(value: unknown): unknown[] | null {
  try {
    if (!Array.isArray(value)) {
      return null;
    }
    const length = ownDataProperty(value, "length");
    if (
      typeof length !== "number" ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > MAX_MODEL_COUNT
    ) {
      return null;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      if (descriptor === undefined || !("value" in descriptor)) {
        return null;
      }
      snapshot.push(descriptor.value as unknown);
    }
    return snapshot;
  } catch {
    return null;
  }
}

function normalizedModelId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const id = value.trim();
  const hasControlCodePoint = Array.from(id).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      ((codePoint >= 0 && codePoint <= 31) || codePoint === 127)
    );
  });
  if (
    id.length === 0 ||
    Array.from(id).length > MAX_MODEL_ID_CODE_POINTS ||
    hasControlCodePoint
  ) {
    return null;
  }
  return id;
}

function policyIsAllowed(model: object): boolean {
  const policy = ownDataProperty(model, "policy");
  if (policy === undefined) {
    return true;
  }
  if (!isPlainRecord(policy)) {
    return false;
  }
  return ownDataProperty(policy, "state") === "enabled";
}

function supportsReasoningEffort(model: object): boolean {
  const capabilities = ownDataProperty(model, "capabilities");
  if (!isPlainRecord(capabilities)) {
    return false;
  }
  const supports = ownDataProperty(capabilities, "supports");
  return (
    isPlainRecord(supports) &&
    ownDataProperty(supports, "reasoningEffort") === true
  );
}

function normalizedReasoningEfforts(model: object): PanelReasoningEffort[] {
  if (!supportsReasoningEffort(model)) {
    return [];
  }
  const raw = safeDenseArray(
    ownDataProperty(model, "supportedReasoningEfforts"),
  );
  if (raw === null) {
    return [];
  }
  const present = new Set(
    raw.filter(
      (effort): effort is PanelReasoningEffort =>
        typeof effort === "string" &&
        REASONING_EFFORTS.includes(effort as PanelReasoningEffort),
    ),
  );
  return REASONING_EFFORTS.filter((effort) => present.has(effort));
}

function snapshotCandidate(value: unknown): PanelModelCandidate | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const id = normalizedModelId(ownDataProperty(value, "id"));
  if (id === null) {
    return null;
  }
  return Object.freeze({
    id,
    policyAllowed: policyIsAllowed(value),
    reasoningEfforts: Object.freeze(
      normalizedReasoningEfforts(value),
    ) as PanelReasoningEffort[],
  });
}

/**
 * Snapshots the untrusted runtime boundary without invoking accessors. Invalid
 * entries are ignored and duplicate IDs use the first valid occurrence.
 */
export function normalizePanelModelCandidates(
  models: unknown,
): PanelModelCandidate[] {
  const source = safeDenseArray(models);
  if (source === null) {
    return [];
  }
  const seen = new Set<string>();
  const candidates: PanelModelCandidate[] = [];
  for (const value of source) {
    const candidate = snapshotCandidate(value);
    if (candidate === null || seen.has(candidate.id)) {
      continue;
    }
    seen.add(candidate.id);
    candidates.push(candidate);
  }
  return candidates;
}

function normalizedFamily(id: string): string {
  const selectionId = id.toLowerCase().split("/").at(-1) ?? id.toLowerCase();
  const withoutChannel = selectionId.replace(
    /(?:[-_.](?:latest|preview|experimental|exp|beta|alpha|turbo))+$/gu,
    "",
  );
  const family = withoutChannel
    .split(/[-_.]+/gu)
    .filter((part) => !/^v?\d+(?:[a-z]+)?$/u.test(part))
    .join("-");
  return family.length > 0 ? family : selectionId;
}

function usableCandidates(
  candidates: readonly PanelModelCandidate[],
): PanelModelCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (
      !candidate.policyAllowed ||
      candidate.id.toLowerCase() === "auto" ||
      seen.has(candidate.id)
    ) {
      return false;
    }
    seen.add(candidate.id);
    return true;
  });
}

function specialistCandidates(
  candidates: readonly PanelModelCandidate[],
): PanelModelCandidate[] {
  const chosen: PanelModelCandidate[] = [];
  const usedFamilies = new Set<string>();
  for (const candidate of candidates) {
    const family = normalizedFamily(candidate.id);
    if (!usedFamilies.has(family)) {
      usedFamilies.add(family);
      chosen.push(candidate);
    }
    if (chosen.length === 3) {
      return chosen;
    }
  }
  for (const candidate of candidates) {
    if (!chosen.includes(candidate)) {
      chosen.push(candidate);
    }
    if (chosen.length === 3) {
      break;
    }
  }
  while (chosen.length < 3 && candidates.length > 0) {
    const candidate = candidates[chosen.length % candidates.length];
    if (candidate !== undefined) {
      chosen.push(candidate);
    }
  }
  return chosen;
}

function reasoningRank(candidate: PanelModelCandidate): number {
  const effort = highestSupportedReasoningEffort(candidate);
  return effort === undefined ? -1 : REASONING_EFFORTS.indexOf(effort);
}

function reasoningCandidates(
  candidates: readonly PanelModelCandidate[],
): PanelModelCandidate[] {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (left, right) =>
        reasoningRank(right.candidate) - reasoningRank(left.candidate) ||
        left.index - right.index,
    )
    .map(({ candidate }) => candidate);
}

export function allocatePanelModels(
  candidates: readonly PanelModelCandidate[],
): PanelModelAllocation {
  const usable = usableCandidates(candidates);
  if (usable.length === 0) {
    return {
      capabilityClass: "auto",
      product: null,
      onboardingArchitecture: null,
      trustEcosystem: null,
      skeptic: null,
      editor: null,
    };
  }
  const specialists = specialistCandidates(usable);
  const reasoning = reasoningCandidates(usable);
  return {
    capabilityClass: "multi-model",
    product: specialists[0]?.id ?? null,
    onboardingArchitecture: specialists[1]?.id ?? null,
    trustEcosystem: specialists[2]?.id ?? null,
    skeptic: reasoning[0]?.id ?? null,
    editor: reasoning[1]?.id ?? reasoning[0]?.id ?? null,
  };
}

export function highestSupportedReasoningEffort(
  candidate: PanelModelCandidate | undefined,
): PanelReasoningEffort | undefined {
  if (candidate === undefined) {
    return undefined;
  }
  for (let index = REASONING_EFFORTS.length - 1; index >= 0; index -= 1) {
    const effort = REASONING_EFFORTS[index];
    if (effort !== undefined && candidate.reasoningEfforts.includes(effort)) {
      return effort;
    }
  }
  return undefined;
}

export function modelForPanelRole(
  allocation: PanelModelAllocation,
  role: PanelModelRole,
): string | null {
  switch (role) {
    case "product":
      return allocation.product;
    case "onboarding-architecture":
      return allocation.onboardingArchitecture;
    case "trust-ecosystem":
      return allocation.trustEcosystem;
    case "skeptic":
      return allocation.skeptic;
    case "editor":
      return allocation.editor;
  }
}
