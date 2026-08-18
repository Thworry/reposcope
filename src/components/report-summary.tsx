import type { AnalysisReport, Language } from "../features/analysis/model";
import { messages } from "../i18n/messages";

interface ReportSummaryProps {
  report: AnalysisReport;
  language: Language;
}

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
        <h2 id="report-title">{report.repository.fullName}</h2>
        <a
          href={repositoryHref(report)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {copy.reportRepositoryLink}
        </a>
      </div>

      <dl className="report-summary__metadata">
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
    </section>
  );
}
