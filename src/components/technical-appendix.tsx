import type { ReactElement } from "react";

import type { AnalysisReport, Language } from "../features/analysis/model";
import {
  buildImprovementMarkdown,
  formatMessage,
  messages,
} from "../i18n/messages";
import { CopyButton } from "./copy-button";
import { CoveragePanel } from "./coverage-panel";
import { DimensionScores } from "./dimension-scores";
import { EvidenceExplorer } from "./evidence-explorer";
import { Methodology } from "./methodology";
import { StrengthsAndRisks } from "./strengths-and-risks";

interface TechnicalAppendixProps {
  report: AnalysisReport;
  language: Language;
  onRefresh: () => void;
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

function TechnicalOverview({
  report,
  language,
}: Pick<TechnicalAppendixProps, "report" | "language">): ReactElement {
  const copy = messages[language];

  return (
    <section
      className="technical-overview"
      aria-labelledby="technical-overview-heading"
    >
      <h3 id="technical-overview-heading">{copy.reportOverallScore}</h3>
      <div
        className="technical-overview__score"
        aria-label={copy.reportOverallScore}
      >
        <strong>
          {formatMessage(language, "scoreOutOf", {
            score: report.overall.score,
          })}
        </strong>
        <span>{copy[OVERALL_LABEL_KEYS[report.overall.label]]}</span>
      </div>

      <div className="technical-overview__flags">
        {report.overall.generalOnly ? (
          <span>{copy.reportGeneralOnly}</span>
        ) : null}
        {report.overall.preliminary ? (
          <span>{copy.reportPreliminary}</span>
        ) : null}
      </div>

      <dl className="technical-overview__metadata">
        <div>
          <dt>{copy.reportConfidence}</dt>
          <dd>
            {report.confidence.percent}% ·{" "}
            {copy[CONFIDENCE_LABEL_KEYS[report.confidence.label]]}
          </dd>
        </div>
      </dl>

      <p className="technical-overview__scope">
        {formatMessage(language, "reportScope", {
          selected: report.coverage.selectedFiles,
          fetched: report.coverage.fetchedFiles,
          parsed: report.coverage.parsedFiles,
        })}
      </p>
    </section>
  );
}

export function TechnicalAppendix({
  report,
  language,
  onRefresh,
}: TechnicalAppendixProps): ReactElement {
  const copy = messages[language];
  const markdown = buildImprovementMarkdown(report, language);

  return (
    <details
      className="technical-appendix"
      data-report-section="technical-appendix"
    >
      <summary>{copy.technicalAppendixHeading}</summary>
      <div className="technical-appendix__content">
        <div className="report-view__actions" aria-label={copy.reportIndex}>
          <button
            className="secondary-action"
            type="button"
            onClick={onRefresh}
          >
            {copy.refreshPublicData}
          </button>
          <CopyButton text={markdown} language={language} />
        </div>
        <TechnicalOverview report={report} language={language} />
        <DimensionScores dimensions={report.dimensions} language={language} />
        <StrengthsAndRisks
          strengths={report.strengths}
          weaknesses={report.weaknesses}
          language={language}
        />
        <CoveragePanel coverage={report.coverage} language={language} />
        <EvidenceExplorer report={report} language={language} />
        <Methodology
          rulesetVersion={report.rulesetVersion}
          language={language}
        />
      </div>
    </details>
  );
}
