import type { Language } from "../features/analysis/model";
import type {
  DeepEvidence,
  DeepStatement,
} from "../features/deep-analysis/model";
import { messages, type AppMessageKey } from "../i18n/messages";
import { ExpertEvidence } from "./expert-evidence";

interface ExpertStatementProps {
  statement: DeepStatement;
  evidence: readonly DeepEvidence[];
  language: Language;
  emphasis?: boolean;
}

const PROVENANCE_KEYS: Record<DeepStatement["provenance"], AppMessageKey> = {
  "repository-claim": "deepProvenanceRepository",
  "observed-fact": "deepProvenanceObserved",
  interpretation: "deepProvenanceInterpretation",
  unknown: "deepProvenanceUnknown",
};

const CONFIDENCE_KEYS: Record<DeepStatement["confidence"], AppMessageKey> = {
  high: "deepConfidenceHigh",
  medium: "deepConfidenceMedium",
  low: "deepConfidenceLow",
};

export function ExpertStatement({
  statement,
  evidence,
  language,
  emphasis = false,
}: ExpertStatementProps) {
  const copy = messages[language];
  return (
    <div
      className="expert-statement"
      data-provenance={statement.provenance}
      data-emphasis={emphasis ? "true" : "false"}
    >
      <p>{statement.text}</p>
      <div className="expert-statement__meta">
        <span className="expert-statement__provenance">
          {copy[PROVENANCE_KEYS[statement.provenance]]}
        </span>
        <span className="expert-statement__confidence">
          {copy[CONFIDENCE_KEYS[statement.confidence]]}
        </span>
      </div>
      {statement.evidenceIds.length === 0 ? null : (
        <ul
          className="expert-statement__evidence"
          aria-label={copy.deepEvidenceDrawer}
        >
          {statement.evidenceIds.map((evidenceId) => (
            <li key={evidenceId}>
              <ExpertEvidence
                evidenceId={evidenceId}
                evidence={evidence}
                language={language}
                number={
                  evidence.findIndex((item) => item.id === evidenceId) + 1
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
