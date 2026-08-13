import { useId, type ReactElement } from "react";

import type {
  Language,
  ProjectBrief,
  ProjectBriefCaution,
  ProjectKind,
} from "../features/analysis/model";
import { formatMessage, messages, type AppMessageKey } from "../i18n/messages";

interface ProjectBriefProps {
  brief: ProjectBrief;
  owner: string;
  repo: string;
  commitSha: string;
  language: Language;
}

const KIND_MESSAGE_KEYS = {
  application: "projectKindApplication",
  "command-line-tool": "projectKindCommandLineTool",
  library: "projectKindLibrary",
  plugin: "projectKindPlugin",
  template: "projectKindTemplate",
  documentation: "projectKindDocumentation",
} as const satisfies Record<ProjectKind, AppMessageKey>;

const CAUTION_MESSAGE_KEYS = {
  archived: "projectCautionArchived",
  "insufficient-explanation": "projectCautionInsufficientExplanation",
  "license-evidence-absent": "projectCautionLicenseEvidenceAbsent",
  "entry-point-evidence-absent": "projectCautionEntryPointEvidenceAbsent",
} as const satisfies Record<ProjectBriefCaution, AppMessageKey>;

function evidenceHref(
  owner: string,
  repo: string,
  sha: string,
  path: string,
): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${sha}/${encodedPath}`;
}

interface PinnedSourceProps {
  owner: string;
  repo: string;
  commitSha: string;
  path: string;
  language: Language;
  messageKey:
    | "projectBriefSourceReadme"
    | "projectBriefSourceManifest"
    | "projectBriefSourceTree";
}

function PinnedSource({
  owner,
  repo,
  commitSha,
  path,
  language,
  messageKey,
}: PinnedSourceProps): ReactElement {
  return (
    <a
      className="project-brief__source"
      href={evidenceHref(owner, repo, commitSha, path)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {formatMessage(language, messageKey, { path })}
    </a>
  );
}

function PlainSource({
  language,
  messageKey,
}: {
  language: Language;
  messageKey:
    | "projectBriefSourceDescription"
    | "projectBriefSourceMetadata"
    | "projectBriefSourceAnalysis";
}): ReactElement {
  return (
    <span className="project-brief__source">
      {messages[language][messageKey]}
    </span>
  );
}

function ProjectBriefSource({
  source,
  path,
  owner,
  repo,
  commitSha,
  language,
}: {
  source:
    | "github-description"
    | "readme"
    | "github-metadata"
    | "manifest"
    | "tree"
    | "analysis";
  path: string | null;
  owner: string;
  repo: string;
  commitSha: string;
  language: Language;
}): ReactElement {
  if (source === "readme" && path !== null) {
    return (
      <PinnedSource
        owner={owner}
        repo={repo}
        commitSha={commitSha}
        path={path}
        language={language}
        messageKey="projectBriefSourceReadme"
      />
    );
  }
  if (source === "manifest" && path !== null) {
    return (
      <PinnedSource
        owner={owner}
        repo={repo}
        commitSha={commitSha}
        path={path}
        language={language}
        messageKey="projectBriefSourceManifest"
      />
    );
  }
  if (source === "tree" && path !== null) {
    return (
      <PinnedSource
        owner={owner}
        repo={repo}
        commitSha={commitSha}
        path={path}
        language={language}
        messageKey="projectBriefSourceTree"
      />
    );
  }

  const messageKey =
    source === "github-description"
      ? "projectBriefSourceDescription"
      : source === "github-metadata"
        ? "projectBriefSourceMetadata"
        : "projectBriefSourceAnalysis";
  return <PlainSource language={language} messageKey={messageKey} />;
}

export function ProjectBriefView({
  brief,
  owner,
  repo,
  commitSha,
  language,
}: ProjectBriefProps): ReactElement {
  const headingId = useId();
  const copy = messages[language];
  const localizedKinds = brief.kinds.map(
    (fact) => copy[KIND_MESSAGE_KEYS[fact.kind]],
  );
  const kindsList = new Intl.ListFormat(language, {
    style: "long",
    type: "conjunction",
  }).format(localizedKinds);
  const hasPurpose = brief.excerpts.length > 0;
  const hasKnownKind = localizedKinds.length > 0;

  return (
    <section className="project-brief" aria-labelledby={headingId}>
      <h3 id={headingId}>{copy.projectBriefRegion}</h3>

      <div className="project-brief__grid">
        <div className="project-brief__column">
          <div className="project-brief__panel">
            <h4>{copy.projectBriefWhat}</h4>
            {brief.excerpts.length === 0 ? (
              <p className="project-brief__fallback">
                {copy.projectBriefInsufficient}
              </p>
            ) : (
              <div className="project-brief__excerpts">
                {brief.excerpts.map((excerpt, index) => (
                  <figure
                    className="project-brief__excerpt"
                    key={`${excerpt.source}:${excerpt.path ?? "metadata"}:${String(index)}`}
                  >
                    <blockquote>
                      <p>{excerpt.text}</p>
                    </blockquote>
                    <figcaption>
                      <ProjectBriefSource
                        source={excerpt.source}
                        path={excerpt.path}
                        owner={owner}
                        repo={repo}
                        commitSha={commitSha}
                        language={language}
                      />
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>

          <div className="project-brief__panel project-brief__fit">
            <h4>{copy.projectBriefFit}</h4>
            <p>
              {!hasPurpose
                ? copy.projectBriefFitInsufficient
                : hasKnownKind
                  ? formatMessage(language, "projectBriefFitKnown", {
                      kinds: kindsList,
                    })
                  : copy.projectBriefFitUnknown}
            </p>
          </div>
        </div>

        <div className="project-brief__column project-brief__facts">
          <div className="project-brief__panel">
            <h4>{copy.projectBriefKind}</h4>
            {brief.kinds.length === 0 ? (
              <p className="project-brief__fallback">
                {copy.projectBriefKindUnknown}
              </p>
            ) : (
              <ul>
                {brief.kinds.map((fact, index) => (
                  <li
                    key={`${fact.kind}:${fact.path ?? fact.source}:${String(index)}`}
                  >
                    <strong>{copy[KIND_MESSAGE_KEYS[fact.kind]]}</strong>
                    <ProjectBriefSource
                      source={fact.source}
                      path={fact.path}
                      owner={owner}
                      repo={repo}
                      commitSha={commitSha}
                      language={language}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="project-brief__panel">
            <h4>{copy.projectBriefCautions}</h4>
            {brief.cautions.length === 0 ? (
              <p className="project-brief__fallback">
                {copy.projectBriefNoCautions}
              </p>
            ) : (
              <ul>
                {brief.cautions.map((fact, index) => (
                  <li key={`${fact.caution}:${String(index)}`}>
                    <span>{copy[CAUTION_MESSAGE_KEYS[fact.caution]]}</span>
                    <ProjectBriefSource
                      source={fact.source}
                      path={fact.path}
                      owner={owner}
                      repo={repo}
                      commitSha={commitSha}
                      language={language}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
