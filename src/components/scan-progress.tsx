import type { Language, ScanPhase } from "../features/analysis/model";
import type { ScanProgress as ScanProgressValue } from "../features/worker/protocol";
import { messages, type AppMessageKey } from "../i18n/messages";

interface ScanProgressProps {
  language: Language;
  progress: ScanProgressValue | null;
  onCancel: () => void;
}

const PHASES: ReadonlyArray<{
  phase: ScanPhase;
  key: AppMessageKey;
}> = [
  { phase: "validating", key: "phase.validating" },
  { phase: "repository", key: "phase.repository" },
  { phase: "selecting", key: "phase.selecting" },
  { phase: "fetching", key: "phase.fetching" },
  { phase: "analyzing", key: "phase.analyzing" },
];

const MINIMUM_TARGET_SIZE_PX = 44;

function formatTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(?<key>[a-z]+)\}/gu, (_match, key: string) =>
    Object.hasOwn(values, key) ? (values[key] ?? "") : "",
  );
}

function formatBytes(bytes: number, language: Language): string {
  const formatter = new Intl.NumberFormat(language, {
    maximumFractionDigits: 1,
  });

  if (bytes < 1_024) return `${formatter.format(bytes)} B`;
  if (bytes < 1_048_576) return `${formatter.format(bytes / 1_024)} KB`;
  return `${formatter.format(bytes / 1_048_576)} MB`;
}

export function ScanProgress({
  language,
  progress,
  onCancel,
}: ScanProgressProps) {
  const copy = messages[language];
  const activePhase = progress?.phase ?? "validating";
  const activeIndex = PHASES.findIndex(({ phase }) => phase === activePhase);
  const determinate = progress?.phase === "fetching" && progress.totalFiles > 0;

  return (
    <section className="scan-progress" aria-labelledby="scan-progress-heading">
      <div className="scan-progress__header">
        <div>
          <p className="section-index">02 / {copy.scanIndex}</p>
          <h2 id="scan-progress-heading">{copy.scanHeading}</h2>
        </div>
        <button
          className="scan-progress__cancel secondary-action"
          type="button"
          data-minimum-target-size={MINIMUM_TARGET_SIZE_PX}
          onClick={onCancel}
        >
          {copy.cancelAnalysis}
        </button>
      </div>

      <ol className="scan-progress__phases">
        {PHASES.map(({ phase, key }, index) => {
          const state =
            index < activeIndex
              ? "complete"
              : index === activeIndex
                ? "active"
                : "pending";

          return (
            <li
              key={phase}
              data-state={state}
              aria-current={state === "active" ? "step" : undefined}
            >
              <span className="scan-progress__number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{copy[key]}</span>
            </li>
          );
        })}
      </ol>

      <div className="scan-progress__meter">
        <progress
          aria-label={copy.scanProgressLabel}
          {...(determinate
            ? {
                value: progress.completedFiles,
                max: progress.totalFiles,
                "aria-valuenow": progress.completedFiles,
                "aria-valuemax": progress.totalFiles,
              }
            : {})}
        />
        {determinate ? (
          <div className="scan-progress__counts" aria-live="off">
            <span>
              {formatTemplate(copy.progressFiles, {
                completed: String(progress.completedFiles),
                total: String(progress.totalFiles),
              })}
            </span>
            <span>
              {formatTemplate(copy.progressBytes, {
                completed: formatBytes(progress.completedBytes, language),
                total: formatBytes(progress.totalBytes, language),
              })}
            </span>
          </div>
        ) : (
          <p className="scan-progress__indeterminate">{copy.progressWorking}</p>
        )}
      </div>
    </section>
  );
}
