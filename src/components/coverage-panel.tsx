import type {
  CoverageSummary,
  FileSkipReason,
  Language,
} from "../features/analysis/model";
import type { AppMessageKey } from "../i18n/messages";
import { formatMessage, messages } from "../i18n/messages";

interface CoveragePanelProps {
  coverage: CoverageSummary;
  language: Language;
}

const SKIP_REASON_KEYS: Record<FileSkipReason, AppMessageKey> = {
  excluded: "skipExcluded",
  binary: "skipBinary",
  oversized: "skipOversized",
  unsupported: "skipUnsupported",
  budget: "skipBudget",
  "invalid-entry": "skipInvalidEntry",
};

const FAILURE_REASON_KEYS = {
  "not-found": "failureNotFound",
  "rate-limit": "failureRateLimit",
  network: "failureNetwork",
  api: "failureApi",
  "invalid-response": "failureInvalidResponse",
  "file-limit": "failureFileLimit",
  "invalid-text": "failureInvalidText",
  timeout: "failureTimeout",
  budget: "failureBudget",
  syntax: "failureSyntax",
} as const satisfies Record<
  NonNullable<CoverageSummary["failures"]>[number]["reason"],
  AppMessageKey
>;

function formatBytes(value: number, language: Language): string {
  return `${new Intl.NumberFormat(language).format(value)} B`;
}

export function CoveragePanel({ coverage, language }: CoveragePanelProps) {
  const copy = messages[language];
  const skipped = coverage.skipped ?? [];
  const failures = coverage.failures ?? [];
  const fileStats = [
    [copy.coverageSelected, coverage.selectedFiles],
    [copy.coverageFetched, coverage.fetchedFiles],
    [copy.coverageParsed, coverage.parsedFiles],
    [copy.coverageSkipped, coverage.skippedFiles],
    [copy.coverageFailed, coverage.failedFiles],
    [copy.coverageUnsupported, coverage.unsupportedFiles],
  ] as const;
  const byteStats = [
    [copy.coverageEligibleBytes, coverage.eligibleBytes],
    [copy.coverageSelectedBytes, coverage.selectedBytes],
    [copy.coverageFetchedBytes, coverage.fetchedBytes],
    [copy.coverageParsedBytes, coverage.parsedBytes],
    [copy.coverageEligibleSourceBytes, coverage.eligibleSourceBytes],
    [copy.coverageParsedSupportedBytes, coverage.parsedSupportedBytes],
  ] as const;

  return (
    <section
      className="report-section coverage-panel"
      data-report-section="coverage"
      aria-labelledby="coverage-heading"
    >
      <p className="section-index">{copy.coverageIndex}</p>
      <h3 id="coverage-heading">{copy.coverageHeading}</h3>
      <div className="coverage-panel__status" aria-label={copy.coverageHeading}>
        {!coverage.treeComplete ? (
          <span>{copy.coveragePartialTree}</span>
        ) : null}
        {coverage.limitReached ? (
          <span>{copy.coverageLimitReached}</span>
        ) : null}
        {coverage.treeComplete && !coverage.limitReached ? (
          <span>{copy.coverageComplete}</span>
        ) : null}
      </div>

      <dl className="coverage-panel__file-stats">
        {fileStats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{new Intl.NumberFormat(language).format(value)}</dd>
          </div>
        ))}
      </dl>
      <dl className="coverage-panel__byte-stats">
        {byteStats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatBytes(value, language)}</dd>
          </div>
        ))}
      </dl>

      {skipped.length > 0 || failures.length > 0 ? (
        <details className="coverage-panel__details" open>
          <summary>{copy.coverageDetails}</summary>
          <ul>
            {skipped.slice(0, 200).map((entry) => (
              <li key={`skip:${entry.path}:${entry.reason}`}>
                <code>{entry.path}</code>
                <span>
                  {formatMessage(language, "coverageSkippedReason", {
                    reason: copy[SKIP_REASON_KEYS[entry.reason]],
                  })}
                </span>
              </li>
            ))}
            {failures.slice(0, 200).map((failure) => (
              <li
                key={`failure:${failure.path}:${failure.stage}:${failure.reason}`}
              >
                <code>{failure.path}</code>
                <span>
                  {formatMessage(language, "coverageFailureReason", {
                    stage:
                      failure.stage === "fetch"
                        ? copy.coverageStageFetch
                        : copy.coverageStageParse,
                    reason: copy[FAILURE_REASON_KEYS[failure.reason]],
                  })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
