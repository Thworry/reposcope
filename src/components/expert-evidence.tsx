import type { Language } from "../features/analysis/model";
import type { DeepEvidence } from "../features/deep-analysis/model";
import { formatMessage, messages, type AppMessageKey } from "../i18n/messages";

interface ExpertEvidenceProps {
  evidenceId: string;
  evidence: readonly DeepEvidence[];
  language: Language;
  number: number;
}

const EVIDENCE_LABEL_KEYS = {
  github: "deepEvidenceGithub",
  readme: "deepEvidenceReadme",
  documentation: "deepEvidenceDocumentation",
  manifest: "deepEvidenceManifest",
  tree: "deepEvidenceTree",
  alternative: "deepEvidenceAlternative",
} as const satisfies Record<DeepEvidence["kind"], AppMessageKey>;

function expertEvidenceLabel(
  evidence: DeepEvidence,
  language: Language,
): string {
  if (language === "en") return evidence.label;

  return formatMessage(language, EVIDENCE_LABEL_KEYS[evidence.kind], {
    path: evidence.path ?? messages[language].deepValueUnavailable,
  });
}

export function ExpertEvidenceLabel({
  evidence,
  language,
}: {
  evidence: DeepEvidence;
  language: Language;
}) {
  return <>{expertEvidenceLabel(evidence, language)}</>;
}

export function ExpertEvidence({
  evidenceId,
  evidence,
  language,
  number,
}: ExpertEvidenceProps) {
  const source = evidence.find((item) => item.id === evidenceId);
  if (source === undefined) return null;
  const label = `${String(number)}. ${expertEvidenceLabel(source, language)}`;
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
