import type { AnalysisReport, Language } from "../features/analysis/model";
import { buildImprovementMarkdown, messages } from "../i18n/messages";
import { CopyButton } from "./copy-button";
import { CoveragePanel } from "./coverage-panel";
import { DimensionScores } from "./dimension-scores";
import { EvidenceExplorer } from "./evidence-explorer";
import { Methodology } from "./methodology";
import { ReportSummary } from "./report-summary";
import { StrengthsAndRisks } from "./strengths-and-risks";

interface ReportViewProps {
  report: AnalysisReport;
  language: Language;
  onRefresh: () => void;
}

export function ReportView({ report, language, onRefresh }: ReportViewProps) {
  const copy = messages[language];
  const markdown = buildImprovementMarkdown(report, language);

  return (
    <article className="report-view" aria-labelledby="report-title">
      <ReportSummary report={report} language={language} />
      <div className="report-view__actions" aria-label={copy.reportIndex}>
        <button className="secondary-action" type="button" onClick={onRefresh}>
          {copy.refreshPublicData}
        </button>
        <CopyButton text={markdown} language={language} />
      </div>
      <DimensionScores dimensions={report.dimensions} language={language} />
      <StrengthsAndRisks
        strengths={report.strengths}
        weaknesses={report.weaknesses}
        language={language}
      />
      <CoveragePanel coverage={report.coverage} language={language} />
      <EvidenceExplorer report={report} language={language} />
      <Methodology rulesetVersion={report.rulesetVersion} language={language} />
    </article>
  );
}
