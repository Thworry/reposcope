import type { ReactNode } from "react";

import type { AnalysisReport, Language } from "../features/analysis/model";
import { ReaderReportView } from "./reader-report";
import { ReportSummary } from "./report-summary";
import { TechnicalAppendix } from "./technical-appendix";

interface ReportViewProps {
  report: AnalysisReport;
  language: Language;
  onRefresh: () => void;
  expert?: ReactNode;
}

export function ReportView({
  report,
  language,
  onRefresh,
  expert,
}: ReportViewProps) {
  return (
    <article className="report-view" aria-labelledby="report-title">
      <ReportSummary report={report} language={language} />
      {expert === undefined || expert === null ? null : (
        <div className="report-expert" data-report-section="expert">
          {expert}
        </div>
      )}
      <div className="report-reader" data-report-section="reader">
        <ReaderReportView report={report} language={language} />
      </div>
      <TechnicalAppendix
        report={report}
        language={language}
        onRefresh={onRefresh}
      />
    </article>
  );
}
