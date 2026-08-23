import type { Language } from "../features/analysis/model";
import {
  DEEP_SPECIALIST_ROLES,
  DEEP_STAGES,
  type DeepAnalysisStage,
  type DeepSpecialistRole,
} from "../features/deep-analysis/model";
import type { DeepSpecialistStatus } from "../features/deep-analysis/use-deep-analysis";
import { messages, type AppMessageKey } from "../i18n/messages";

interface ExpertProgressProps {
  language: Language;
  stage: DeepAnalysisStage | null;
  specialists: Record<DeepSpecialistRole, DeepSpecialistStatus>;
  onCancel: () => void;
}

const STAGE_LABELS: Record<DeepAnalysisStage, AppMessageKey> = {
  "preparing-evidence": "deepStagePreparing",
  "consulting-specialists": "deepStageConsulting",
  "challenging-findings": "deepStageChallenging",
  "editing-briefing": "deepStageEditing",
  "validating-sources": "deepStageValidating",
};

const ROLE_LABELS: Record<DeepSpecialistRole, AppMessageKey> = {
  product: "deepRoleProduct",
  "onboarding-architecture": "deepRoleOnboarding",
  "trust-ecosystem": "deepRoleTrust",
};

const STATUS_LABELS: Record<DeepSpecialistStatus, AppMessageKey> = {
  pending: "deepProgressPending",
  running: "deepProgressRunning",
  complete: "deepProgressComplete",
  failed: "deepProgressFailed",
};

type StageStatus = "pending" | "running" | "complete" | "reused";

const STAGE_STATUS_LABELS: Record<StageStatus, AppMessageKey> = {
  pending: "deepProgressPending",
  running: "deepProgressRunning",
  complete: "deepProgressComplete",
  reused: "deepProgressReused",
};

function stageStatus(
  stage: DeepAnalysisStage | null,
  item: DeepAnalysisStage,
  cacheHit: boolean,
): StageStatus {
  if (stage === null) return "pending";
  if (cacheHit) {
    if (item === "preparing-evidence") return "complete";
    if (item === "validating-sources") return "running";
    return "reused";
  }
  const current = DEEP_STAGES.indexOf(stage);
  const target = DEEP_STAGES.indexOf(item);
  return target < current
    ? "complete"
    : target === current
      ? "running"
      : "pending";
}

export function ExpertProgress({
  language,
  stage,
  specialists,
  onCancel,
}: ExpertProgressProps) {
  const copy = messages[language];
  const cacheHit =
    stage === "validating-sources" &&
    DEEP_SPECIALIST_ROLES.every((role) => specialists[role] === "pending");
  const liveMessage = cacheHit
    ? copy.deepProgressCacheHit
    : stage === null
      ? copy.deepStagePreparing
      : copy[STAGE_LABELS[stage]];

  return (
    <section
      className="expert-progress"
      aria-labelledby="expert-progress-heading"
      aria-busy="true"
    >
      <div className="expert-progress__header">
        <div>
          <p className="section-index">02 / {copy.deepReportIndex}</p>
          <h3 id="expert-progress-heading">{copy.deepProgressHeading}</h3>
        </div>
        <button className="secondary-action" type="button" onClick={onCancel}>
          {copy.deepCancel}
        </button>
      </div>
      <p
        className={cacheHit ? "expert-progress__cache-note" : "sr-only"}
        role="status"
        aria-live="polite"
      >
        {liveMessage}
      </p>
      <ol
        className="expert-progress__stages"
        aria-label={copy.deepProgressLabel}
      >
        {DEEP_STAGES.map((item, index) => {
          const status = stageStatus(stage, item, cacheHit);
          return (
            <li
              key={item}
              data-status={status}
              aria-current={status === "running" ? "step" : undefined}
            >
              <span className="expert-progress__number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <span className="expert-progress__label">
                  {copy[STAGE_LABELS[item]]}
                </span>
                <span className="expert-progress__state">
                  {copy[STAGE_STATUS_LABELS[status]]}
                </span>
                {item === "consulting-specialists" && !cacheHit ? (
                  <ul className="expert-progress__specialists">
                    {DEEP_SPECIALIST_ROLES.map((role) => (
                      <li key={role} data-status={specialists[role]}>
                        <span>{copy[ROLE_LABELS[role]]}</span>
                        <span>{copy[STATUS_LABELS[specialists[role]]]}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
