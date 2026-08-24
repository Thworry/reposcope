import type { Language } from "../../src/features/analysis/model.js";
import type { DeepAnalysisEvent } from "../../src/features/deep-analysis/model.js";
import type { EvidencePack } from "../evidence/model.js";
import {
  acceptedRolesCoverRequiredSections,
  isDeepReportDraft,
  isExpertReview,
  isSkepticalReview,
  snapshotAcceptedExpertReviews,
  snapshotSkepticalReview,
} from "./guards.js";
import {
  PanelModelGatewayError,
  type PanelModelRun,
} from "./copilot-gateway.js";
import {
  EXPERT_ROLES,
  PANEL_LIMITS,
  type DeepReportDraft,
  type ExpertReview,
  type ExpertRole,
  type PanelPrompt,
  type SkepticalReview,
} from "./model.js";
import {
  buildEditorPrompt,
  buildExpertPrompt,
  buildSkepticPrompt,
} from "./prompts.js";
import {
  buildInvalidJsonRepairPayload,
  parseStrictJsonObject,
  StrictJsonObjectError,
} from "./parse-json.js";

export type PanelProgressEvent = Extract<
  DeepAnalysisEvent,
  { type: "stage" | "specialist" }
>;

export type PanelOrchestrationErrorKind =
  "aborted" | "insufficient-coverage" | "invalid-output" | "unavailable";

export class PanelOrchestrationError extends Error {
  override readonly name = "PanelOrchestrationError";

  constructor(readonly kind: PanelOrchestrationErrorKind) {
    super(`panel-orchestration-${kind}`);
  }
}

export interface PanelNarrativeResult {
  readonly draft: DeepReportDraft;
  readonly acceptedExpertReviews: readonly ExpertReview[];
  readonly skepticalReview: SkepticalReview;
  readonly coverage: "full" | "reduced";
}

export interface RunPanelOptions {
  readonly pack: EvidencePack;
  readonly language: Language;
  readonly modelRun: PanelModelRun;
  readonly signal: AbortSignal;
  readonly onEvent: (event: PanelProgressEvent) => void;
}

type Validator<T> = (value: unknown) => value is T;

const REPAIR_OUTPUT_START = "<<<BEGIN_INVALID_MODEL_OUTPUT>>>";
const REPAIR_OUTPUT_END = "<<<END_INVALID_MODEL_OUTPUT>>>";

function codePoints(value: string): number {
  return Array.from(value).length;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new PanelOrchestrationError("aborted");
}

function publicPanelError(error: unknown): PanelOrchestrationError {
  try {
    if (error instanceof PanelOrchestrationError) return error;
    if (error instanceof PanelModelGatewayError) {
      return new PanelOrchestrationError(
        error.kind === "aborted" || error.kind === "closed"
          ? "aborted"
          : "unavailable",
      );
    }
  } catch {
    // Model runtimes are a hostile boundary; classification must fail closed.
  }
  return new PanelOrchestrationError("unavailable");
}

function isRetryableTransportError(error: unknown): boolean {
  try {
    return (
      error instanceof PanelModelGatewayError &&
      (error.kind === "transport" ||
        error.kind === "timeout" ||
        error.kind === "invalid-response")
    );
  } catch {
    return false;
  }
}

function narrativeEvidenceIds(pack: EvidencePack): ReadonlySet<string> {
  return new Set([
    ...pack.facts
      .filter((fact) => fact.retention === "narrative")
      .map((fact) => fact.id),
    ...pack.contentBlocks.map((block) => block.id),
  ]);
}

/**
 * Unknown evidence, finding, challenge, or alternative identities are semantic
 * failures. A schema-repair call must never be invited to invent replacements.
 */
function hasUnknownSemanticReference(
  value: unknown,
  pack: EvidencePack,
  knownFindingIds: ReadonlySet<string>,
  knownChallengeIds: ReadonlySet<string>,
): boolean {
  const evidenceIds = narrativeEvidenceIds(pack);
  const alternatives = new Set(
    pack.facts
      .filter(
        (fact) =>
          fact.category === "alternative-description" && fact.url !== null,
      )
      .map((fact) => {
        const url = new URL(fact.url as string);
        return url.pathname.slice(1).toLocaleLowerCase("en-US");
      }),
  );
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      pending.push(...(current as unknown[]));
      continue;
    }
    if (typeof current !== "object" || current === null) continue;
    for (const [key, entry] of Object.entries(current)) {
      if (
        key === "evidenceIds" &&
        Array.isArray(entry) &&
        entry.some((id) => typeof id === "string" && !evidenceIds.has(id))
      ) {
        return true;
      }
      if (
        key === "findingId" &&
        typeof entry === "string" &&
        !knownFindingIds.has(entry)
      ) {
        return true;
      }
      if (
        key === "sourceChallengeId" &&
        typeof entry === "string" &&
        !knownChallengeIds.has(entry)
      ) {
        return true;
      }
      if (key === "repository" && typeof entry === "object" && entry !== null) {
        const repository = entry as Record<string, unknown>;
        if (
          typeof repository.owner === "string" &&
          typeof repository.repo === "string" &&
          !alternatives.has(
            `${repository.owner}/${repository.repo}`.toLocaleLowerCase("en-US"),
          )
        ) {
          return true;
        }
      }
      pending.push(entry);
    }
  }
  return false;
}

function buildRepairPrompt(original: PanelPrompt, output: string): PanelPrompt {
  const systemSuffix =
    " This is the sole schema-repair attempt. Preserve supported claims and supplied IDs; only correct the required JSON shape. Do not invent evidence, findings, challenges, repositories, or facts.";
  const system = `${original.system}${systemSuffix}`;
  const prefix = `${original.user}\n${REPAIR_OUTPUT_START}\n`;
  const suffix = `\n${REPAIR_OUTPUT_END}`;
  const available =
    PANEL_LIMITS.promptCodePoints -
    codePoints(system) -
    codePoints(prefix) -
    codePoints(suffix);
  if (available < 1) {
    throw new PanelOrchestrationError("invalid-output");
  }
  const filtered = buildInvalidJsonRepairPayload(output);
  const payload = Array.from(filtered).slice(0, available).join("");
  return Object.freeze({ system, user: `${prefix}${payload}${suffix}` });
}

class RepairBudget {
  #available = true;

  take(): boolean {
    if (!this.#available) return false;
    this.#available = false;
    return true;
  }
}

/** A role gets one transport retry across both its original and repair calls. */
class TransportRetryBudget {
  readonly #used = new Set<ExpertRole | "skeptic" | "editor">();

  take(role: ExpertRole | "skeptic" | "editor"): boolean {
    if (this.#used.has(role)) return false;
    this.#used.add(role);
    return true;
  }
}

async function runTransportAttempt(
  modelRun: PanelModelRun,
  role: ExpertRole | "skeptic" | "editor",
  prompt: PanelPrompt,
  retryBudget: TransportRetryBudget,
  signal: AbortSignal,
): Promise<string> {
  throwIfAborted(signal);
  try {
    return await modelRun.runJson({ role, prompt });
  } catch (error) {
    throwIfAborted(signal);
    if (!isRetryableTransportError(error)) throw publicPanelError(error);
    if (!retryBudget.take(role)) throw publicPanelError(error);
  }
  try {
    throwIfAborted(signal);
    return await modelRun.runJson({ role, prompt });
  } catch (error) {
    throwIfAborted(signal);
    throw publicPanelError(error);
  }
}

async function runValidatedJson<T>(options: {
  readonly modelRun: PanelModelRun;
  readonly role: ExpertRole | "skeptic" | "editor";
  readonly prompt: PanelPrompt;
  readonly validator: Validator<T>;
  readonly repairBudget: RepairBudget;
  readonly transportRetryBudget: TransportRetryBudget;
  readonly pack: EvidencePack;
  readonly knownFindingIds: ReadonlySet<string>;
  readonly knownChallengeIds: ReadonlySet<string>;
  readonly signal: AbortSignal;
}): Promise<T> {
  const output = await runTransportAttempt(
    options.modelRun,
    options.role,
    options.prompt,
    options.transportRetryBudget,
    options.signal,
  );
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = parseStrictJsonObject(output);
  } catch (error) {
    if (!(error instanceof StrictJsonObjectError))
      throw publicPanelError(error);
  }
  if (parsed !== null && options.validator(parsed)) return parsed;
  if (
    (parsed !== null &&
      hasUnknownSemanticReference(
        parsed,
        options.pack,
        options.knownFindingIds,
        options.knownChallengeIds,
      )) ||
    !options.repairBudget.take()
  ) {
    throw new PanelOrchestrationError("invalid-output");
  }

  const repairedOutput = await runTransportAttempt(
    options.modelRun,
    options.role,
    buildRepairPrompt(options.prompt, output),
    options.transportRetryBudget,
    options.signal,
  );
  let repaired: Record<string, unknown>;
  try {
    repaired = parseStrictJsonObject(repairedOutput);
  } catch {
    throw new PanelOrchestrationError("invalid-output");
  }
  if (!options.validator(repaired)) {
    throw new PanelOrchestrationError("invalid-output");
  }
  return repaired;
}

function findingIds(reviews: readonly ExpertReview[]): ReadonlySet<string> {
  return new Set(
    reviews.flatMap((review) =>
      [...review.findings, ...review.unknowns].map((finding) => finding.id),
    ),
  );
}

function challengeIds(review: SkepticalReview): ReadonlySet<string> {
  return new Set(review.challenges.map((challenge) => challenge.id));
}

/** Executes the three specialists, skeptic, and editor against one fixed pack. */
export async function runExpertPanel(
  options: RunPanelOptions,
): Promise<PanelNarrativeResult> {
  const { language, modelRun, onEvent, pack, signal } = options;
  const repairs = new RepairBudget();
  const transportRetries = new TransportRetryBudget();
  throwIfAborted(signal);
  onEvent({ type: "stage", stage: "consulting-specialists" });

  const settled = await Promise.allSettled(
    EXPERT_ROLES.map(async (role): Promise<ExpertReview> => {
      onEvent({ type: "specialist", role, status: "started" });
      try {
        const review = await runValidatedJson({
          modelRun,
          role,
          prompt: buildExpertPrompt(role, pack, language),
          validator: (value): value is ExpertReview =>
            isExpertReview(value, pack) && value.role === role,
          repairBudget: repairs,
          transportRetryBudget: transportRetries,
          pack,
          knownFindingIds: new Set(),
          knownChallengeIds: new Set(),
          signal,
        });
        onEvent({ type: "specialist", role, status: "complete" });
        return review;
      } catch (error) {
        onEvent({ type: "specialist", role, status: "failed" });
        throw error;
      }
    }),
  );
  throwIfAborted(signal);
  const reviews = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const accepted = snapshotAcceptedExpertReviews(reviews, pack);
  if (accepted === null || !acceptedRolesCoverRequiredSections(accepted)) {
    const aborted = settled.some(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof PanelOrchestrationError &&
        result.reason.kind === "aborted",
    );
    throw new PanelOrchestrationError(
      aborted ? "aborted" : "insufficient-coverage",
    );
  }

  onEvent({ type: "stage", stage: "challenging-findings" });
  const knownFindings = findingIds(accepted);
  const skepticalReview = await runValidatedJson({
    modelRun,
    role: "skeptic",
    prompt: buildSkepticPrompt(pack, accepted, language),
    validator: (value): value is SkepticalReview =>
      isSkepticalReview(value, pack, accepted),
    repairBudget: repairs,
    transportRetryBudget: transportRetries,
    pack,
    knownFindingIds: knownFindings,
    knownChallengeIds: new Set(),
    signal,
  });
  const acceptedSkeptic = snapshotSkepticalReview(
    skepticalReview,
    pack,
    accepted,
  );
  if (acceptedSkeptic === null) {
    throw new PanelOrchestrationError("invalid-output");
  }

  onEvent({ type: "stage", stage: "editing-briefing" });
  const draft = await runValidatedJson({
    modelRun,
    role: "editor",
    prompt: buildEditorPrompt(pack, accepted, acceptedSkeptic, language),
    validator: (value): value is DeepReportDraft =>
      isDeepReportDraft(value, {
        pack,
        expectedLanguage: language,
        acceptedExpertReviews: accepted,
        skepticalReview: acceptedSkeptic,
      }),
    repairBudget: repairs,
    transportRetryBudget: transportRetries,
    pack,
    knownFindingIds: knownFindings,
    knownChallengeIds: challengeIds(acceptedSkeptic),
    signal,
  });

  return Object.freeze({
    draft,
    acceptedExpertReviews: accepted,
    skepticalReview: acceptedSkeptic,
    coverage: accepted.length === EXPERT_ROLES.length ? "full" : "reduced",
  });
}
