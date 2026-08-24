import type { Language } from "../features/analysis/model";
import type { DeepEvidence } from "../features/deep-analysis/model";
import { messages } from "../i18n/messages";

interface ExpertEvidenceProps {
  evidenceId: string;
  evidence: readonly DeepEvidence[];
  language: Language;
  number: number;
}

export function ExpertEvidence({
  evidenceId,
  evidence,
  language,
  number,
}: ExpertEvidenceProps) {
  const source = evidence.find((item) => item.id === evidenceId);
  if (source === undefined) return null;
  const label = `${String(number)}. ${source.label}`;
  if (source.url === null) {
    return (
      <span
        className="expert-evidence-link"
        title={messages[language].deepEvidenceUnavailable}
      >
        {label}
      </span>
    );
  }
  return (
    <a
      className="expert-evidence-link"
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={messages[language].deepEvidenceOpen}
    >
      {label}
    </a>
  );
}
