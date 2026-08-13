import type { AnalysisReport, Language } from "../features/analysis/model";
import { formatMessage, messages } from "../i18n/messages";
import { ProjectBriefView } from "./project-brief";

interface ReportSummaryProps {
  report: AnalysisReport;
  language: Language;
}

const OVERALL_LABEL_KEYS = {
  strong: "reportOverallStrong",
  solid: "reportOverallSolid",
  "needs-attention": "reportOverallNeedsAttention",
  limited: "reportOverallLimited",
} as const;

const CONFIDENCE_LABEL_KEYS = {
  high: "confidenceHigh",
  medium: "confidenceMedium",
  low: "confidenceLow",
} as const;

function formatTimestamp(value: string, language: Language): string {
  const timestamp = new Date(value);

  if (!Number.isFinite(timestamp.getTime())) return value;
  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(timestamp);
}

function repositoryHref(report: AnalysisReport): string {
  return `https://github.com/${encodeURIComponent(report.repository.owner)}/${encodeURIComponent(report.repository.repo)}`;
}

export function ReportSummary({ report, language }: ReportSummaryProps) {
  const copy = messages[language];

  return (
    <section
      className="report-summary"
      data-report-section="summary"
      aria-labelledby="report-title"
    >
      <p className="section-index">01 / {copy.reportIndex}</p>
      <div className="report-summary__heading">
        <div>
          <h2 id="report-title">{report.repository.fullName}</h2>
          <a
            href={repositoryHref(report)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.reportRepositoryLink}
          </a>
        </div>

        <div
          className="report-summary__score"
          aria-label={copy.reportOverallScore}
        >
          <span>{copy.reportOverallScore}</span>
          <strong>
            {formatMessage(language, "scoreOutOf", {
              score: report.overall.score,
            })}
          </strong>
          <span>{copy[OVERALL_LABEL_KEYS[report.overall.label]]}</span>
        </div>
      </div>

      <ProjectBriefView
        brief={report.projectBrief}
        owner={report.repository.owner}
        repo={report.repository.repo}
        commitSha={report.repository.commitSha}
        language={language}
      />

      <div className="report-summary__flags">
        {report.overall.generalOnly ? (
          <span>{copy.reportGeneralOnly}</span>
        ) : null}
        {report.overall.preliminary ? (
          <span>{copy.reportPreliminary}</span>
        ) : null}
      </div>

      <dl className="report-summary__metadata">
        <div>
          <dt>{copy.reportConfidence}</dt>
          <dd>
            {report.confidence.percent}% ·{" "}
            {copy[CONFIDENCE_LABEL_KEYS[report.confidence.label]]}
          </dd>
        </div>
        <div>
          <dt>{copy.reportCommit}</dt>
          <dd>
            <code>{report.repository.commitSha}</code>
          </dd>
        </div>
        <div>
          <dt>{copy.reportAnalyzedAt}</dt>
          <dd>
            <time dateTime={report.repository.analyzedAt}>
              {formatTimestamp(report.repository.analyzedAt, language)}
            </time>
          </dd>
        </div>
        <div>
          <dt>{copy.reportDefaultBranch}</dt>
          <dd>
            <code>{report.repository.defaultBranch}</code>
          </dd>
        </div>
      </dl>

      <p className="report-summary__scope">
        {formatMessage(language, "reportScope", {
          selected: report.coverage.selectedFiles,
          fetched: report.coverage.fetchedFiles,
          parsed: report.coverage.parsedFiles,
        })}
      </p>
    </section>
  );
}
