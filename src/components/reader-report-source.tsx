import type { ReactElement } from "react";

import type {
  Language,
  ProjectBriefExcerpt,
  ReaderEvidenceSource,
} from "../features/analysis/model";
import { formatMessage, messages } from "../i18n/messages";

type SourceEvidence =
  ReaderEvidenceSource | Pick<ProjectBriefExcerpt, "source" | "path">;

interface ReaderReportSourceProps {
  evidence: SourceEvidence;
  linkKind?: "blob" | "tree";
  owner: string;
  repo: string;
  commitSha: string;
  language: Language;
}

function evidenceHref(
  owner: string,
  repo: string,
  commitSha: string,
  path: string,
  linkKind: "blob" | "tree",
): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${linkKind}/${encodeURIComponent(commitSha)}/${encodedPath}`;
}

/** Renders one immutable evidence caption without interpreting repository text. */
export function ReaderReportSource({
  evidence,
  linkKind = "blob",
  owner,
  repo,
  commitSha,
  language,
}: ReaderReportSourceProps): ReactElement {
  const className = "reader-report__source project-brief__source";

  if (evidence.path !== null) {
    const messageKey =
      evidence.source === "documentation"
        ? "readerSourceDocumentation"
        : evidence.source === "manifest"
          ? "projectBriefSourceManifest"
          : evidence.source === "tree"
            ? "projectBriefSourceTree"
            : "projectBriefSourceReadme";

    return (
      <a
        className={className}
        data-evidence-source={evidence.source}
        href={evidenceHref(owner, repo, commitSha, evidence.path, linkKind)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {formatMessage(language, messageKey, { path: evidence.path })}
      </a>
    );
  }

  const messageKey =
    evidence.source === "github-description"
      ? "projectBriefSourceDescription"
      : evidence.source === "github-metadata"
        ? "projectBriefSourceMetadata"
        : "projectBriefSourceAnalysis";

  return (
    <span className={className} data-evidence-source={evidence.source}>
      {messages[language][messageKey]}
    </span>
  );
}
