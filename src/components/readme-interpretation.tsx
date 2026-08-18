import { useId, type ReactElement, type ReactNode } from "react";

import {
  type AnalysisReport,
  type Language,
  type ProjectBriefExcerpt,
  type ProjectKind,
  type ReaderCommentaryId,
  type ReaderEcosystem,
  type ReaderEvidenceSource,
  type ReaderSignalState,
  type ReaderTextFact,
} from "../features/analysis/model";
import {
  PRACTICAL_IDS,
  VERIFY_IDS,
  WORTH_NOTING_IDS,
} from "../features/analysis/reader-report-policy";
import { messages, type AppMessageKey } from "../i18n/messages";
import { ReaderReportSource } from "./reader-report-source";

interface ReadmeInterpretationViewProps {
  report: AnalysisReport;
  language: Language;
}

interface SourceContext {
  owner: string;
  repo: string;
  commitSha: string;
  language: Language;
}

type OrientationFact = ReaderTextFact | ProjectBriefExcerpt;

const KIND_KEYS = {
  application: "projectKindApplication",
  "command-line-tool": "projectKindCommandLineTool",
  library: "projectKindLibrary",
  plugin: "projectKindPlugin",
  template: "projectKindTemplate",
  documentation: "projectKindDocumentation",
} as const satisfies Record<ProjectKind, AppMessageKey>;

const ECOSYSTEM_KEYS = {
  "javascript-typescript": "readerEcosystemJavaScript",
  python: "readerEcosystemPython",
  go: "readerEcosystemGo",
  rust: "readerEcosystemRust",
  "java-jvm": "readerEcosystemJava",
  dotnet: "readerEcosystemDotNet",
  ruby: "readerEcosystemRuby",
  php: "readerEcosystemPhp",
  swift: "readerEcosystemSwift",
  dart: "readerEcosystemDart",
  other: "readerEcosystemOther",
} as const satisfies Record<ReaderEcosystem, AppMessageKey>;

const COMMENTARY_KEYS = Object.freeze({
  "readme-substantial-overview": "readerCommentarySubstantialOverview",
  "readme-audience-or-use-cases-documented": "readerCommentaryAudience",
  "readme-capabilities-documented": "readerCommentaryCapabilities",
  "readme-workflow-documented": "readerCommentaryWorkflow",
  "readme-onboarding-documented": "readerCommentaryOnboarding",
  "readme-limitations-documented": "readerCommentaryLimitations",
  "readme-maturity-documented": "readerCommentaryMaturity",
  "readme-broad-structure-corroborated": "readerCommentaryCorroboration",
  "readme-security-data-flow-unestablished": "readerCommentarySecurityGap",
  "readme-limitations-unestablished": "readerCommentaryLimitationsGap",
  "readme-maturity-unestablished": "readerCommentaryMaturityGap",
  "readme-broad-structure-needs-verification":
    "readerCommentaryStructureVerification",
  "readme-external-dependencies-declared": "readerCommentaryDependencies",
} as const satisfies Record<ReaderCommentaryId, AppMessageKey>);

function DossierRegion({
  id,
  region,
  heading,
  children,
}: {
  id: string;
  region: string;
  heading: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section
      className={`readme-interpretation__region readme-interpretation__region--${region}`}
      role="region"
      aria-labelledby={id}
      data-readme-region={region}
    >
      <h3 id={id}>{heading}</h3>
      {children}
    </section>
  );
}

function EvidenceFact({
  fact,
  context,
}: {
  fact: OrientationFact;
  context: SourceContext;
}): ReactElement {
  return (
    <li className="readme-interpretation__fact">
      <p>{fact.text}</p>
      <ReaderReportSource evidence={fact} {...context} />
    </li>
  );
}

function EvidenceList({
  facts,
  context,
  className,
}: {
  facts: readonly OrientationFact[];
  context: SourceContext;
  className?: string;
}): ReactElement {
  return (
    <ul className={className ?? "readme-interpretation__facts"}>
      {facts.map((fact, index) => (
        <EvidenceFact
          key={`${fact.source}:${fact.path ?? "metadata"}:${String(index)}`}
          fact={fact}
          context={context}
        />
      ))}
    </ul>
  );
}

function Orientation({
  report,
  context,
  headingId,
}: {
  report: AnalysisReport;
  context: SourceContext;
  headingId: string;
}): ReactElement {
  const copy = messages[context.language];

  return (
    <DossierRegion
      id={headingId}
      region="orientation"
      heading={copy.readerOrientationHeading}
    >
      <p className="readme-interpretation__lede">
        {copy.readerOrientationIntro}
      </p>
      {report.projectBrief.excerpts.length === 0 ? (
        <p className="readme-interpretation__empty">
          {copy.projectBriefInsufficient}
        </p>
      ) : (
        <EvidenceList facts={report.projectBrief.excerpts} context={context} />
      )}
    </DossierRegion>
  );
}

function exactInteger(value: number, language: Language): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(
    value,
  );
}

function compactInteger(value: number, language: Language): string {
  return new Intl.NumberFormat(language, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string, language: Language): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function NumericCommunityFact({
  label,
  value,
  context,
}: {
  label: string;
  value: number;
  context: SourceContext;
}): ReactElement {
  const exact = exactInteger(value, context.language);

  return (
    <div>
      <dt>{label}</dt>
      <dd aria-label={`${label}: ${exact}`} data-exact-value={String(value)}>
        <strong aria-hidden="true">
          {compactInteger(value, context.language)}
        </strong>
        <ReaderReportSource
          evidence={{ source: "github-metadata", path: null }}
          {...context}
        />
      </dd>
    </div>
  );
}

function TextCommunityFact({
  label,
  value,
  exactValue,
  evidence,
  context,
}: {
  label: string;
  value: string;
  exactValue: string;
  evidence: ReaderEvidenceSource;
  context: SourceContext;
}): ReactElement {
  return (
    <div>
      <dt>{label}</dt>
      <dd aria-label={`${label}: ${value}`} data-exact-value={exactValue}>
        <strong aria-hidden="true">{value}</strong>
        <ReaderReportSource evidence={evidence} {...context} />
      </dd>
    </div>
  );
}

function CommunityFacts({
  report,
  context,
  headingId,
}: {
  report: AnalysisReport;
  context: SourceContext;
  headingId: string;
}): ReactElement {
  const copy = messages[context.language];
  const license = report.readerReport.reliability.signals.find(
    (fact) => fact.signal === "license",
  );
  const licenseState: ReaderSignalState = license?.state ?? "unknown";
  const licenseValue =
    licenseState === "present"
      ? copy.readerLicensePresent
      : licenseState === "absent"
        ? copy.readerLicenseAbsent
        : copy.readerLicenseUnknown;

  return (
    <DossierRegion
      id={headingId}
      region="community"
      heading={copy.readerCommunityHeading}
    >
      <dl className="readme-interpretation__community">
        <NumericCommunityFact
          label={copy.readerCommunityStars}
          value={report.readerReport.community.starsCount}
          context={context}
        />
        <NumericCommunityFact
          label={copy.readerCommunityWatch}
          value={report.readerReport.community.watchersCount}
          context={context}
        />
        <NumericCommunityFact
          label={copy.readerCommunityForks}
          value={report.readerReport.community.forksCount}
          context={context}
        />
        <NumericCommunityFact
          label={copy.readerCommunityOpenIssues}
          value={report.readerReport.maintenance.openIssuesCount}
          context={context}
        />
        <TextCommunityFact
          label={copy.readerCommunityLastPush}
          value={formatDate(report.repository.pushedAt, context.language)}
          exactValue={report.repository.pushedAt}
          evidence={{ source: "github-metadata", path: null }}
          context={context}
        />
        <TextCommunityFact
          label={copy.readerCommunityLicense}
          value={licenseValue}
          exactValue={licenseState}
          evidence={license ?? { source: "analysis", path: null }}
          context={context}
        />
      </dl>
      <p className="readme-interpretation__disclaimer">
        {copy.readerCommunityPopularity}
      </p>
    </DossierRegion>
  );
}

function NarrativeGroup({
  heading,
  facts,
  context,
}: {
  heading: string;
  facts: readonly ReaderTextFact[];
  context: SourceContext;
}): ReactElement | null {
  if (facts.length === 0) return null;

  return (
    <section className="readme-interpretation__annotation">
      <h4>{heading}</h4>
      <EvidenceList facts={facts} context={context} />
    </section>
  );
}

function canonicalNarrativeKey(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function mergedUseCases(report: AnalysisReport): readonly ReaderTextFact[] {
  const seen = new Set(
    [
      ...report.projectBrief.excerpts,
      ...report.readerReport.readme.overview,
      ...report.readerReport.readme.audiences,
      ...report.readerReport.readme.problems,
    ].map((fact) => canonicalNarrativeKey(fact.text)),
  );
  const merged: ReaderTextFact[] = [];

  for (const fact of [
    ...report.readerReport.readme.useCases,
    ...report.readerReport.scenarios.facts,
  ]) {
    const key = canonicalNarrativeKey(fact.text);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(fact);
  }

  return merged;
}

function ReadmeNarrative({
  report,
  context,
  headingId,
}: {
  report: AnalysisReport;
  context: SourceContext;
  headingId: string;
}): ReactElement {
  const copy = messages[context.language];
  const readme = report.readerReport.readme;
  const useCases = mergedUseCases(report);
  const groups = [
    [copy.readerReadmeOverviewSubheading, readme.overview],
    [copy.readerReadmeAudienceSubheading, readme.audiences],
    [copy.readerReadmeProblemsSubheading, readme.problems],
    [copy.readerReadmeUseCasesSubheading, useCases],
    [copy.readerReadmeDependenciesSubheading, readme.dependencies],
    [copy.readerReadmeLimitationsSubheading, readme.limitations],
    [copy.readerReadmeMaturitySubheading, readme.maturity],
  ] as const;
  const hasNarrative = groups.some(([, facts]) => facts.length > 0);

  return (
    <DossierRegion
      id={headingId}
      region="readme-narrative"
      heading={copy.readerReadmeNarrativeHeading}
    >
      {hasNarrative ? (
        <div className="readme-interpretation__annotations">
          {groups.map(([heading, facts]) => (
            <NarrativeGroup
              key={heading}
              heading={heading}
              facts={facts}
              context={context}
            />
          ))}
        </div>
      ) : (
        <p className="readme-interpretation__empty">
          {copy.readerReadmeSectionMissing}
        </p>
      )}
    </DossierRegion>
  );
}

function CapabilityGroups({
  report,
  context,
  headingId,
}: {
  report: AnalysisReport;
  context: SourceContext;
  headingId: string;
}): ReactElement {
  const copy = messages[context.language];
  const groups = report.readerReport.readme.capabilityGroups;

  return (
    <DossierRegion
      id={headingId}
      region="capabilities"
      heading={copy.readerCapabilitiesHeading}
    >
      {groups.length === 0 ? (
        <p className="readme-interpretation__empty">
          {copy.readerCapabilitiesMissing}
        </p>
      ) : (
        <div className="readme-interpretation__capability-groups">
          {groups.map((group, groupIndex) => (
            <section
              className="readme-interpretation__capability"
              key={`${group.label}:${String(groupIndex)}`}
            >
              <h4>{group.label}</h4>
              <EvidenceList facts={group.facts} context={context} />
            </section>
          ))}
        </div>
      )}
    </DossierRegion>
  );
}

function Workflow({
  report,
  context,
  headingId,
}: {
  report: AnalysisReport;
  context: SourceContext;
  headingId: string;
}): ReactElement {
  const copy = messages[context.language];
  const facts = report.readerReport.readme.workflow;
  const workflowColumns = Math.min(Math.max(facts.length, 1), 4);

  return (
    <DossierRegion
      id={headingId}
      region="workflow"
      heading={copy.readerWorkflowHeading}
    >
      {facts.length === 0 ? (
        <p className="readme-interpretation__empty">
          {copy.readerWorkflowMissing}
        </p>
      ) : (
        <ol
          className="readme-interpretation__workflow"
          aria-label={copy.readerWorkflowHeading}
          data-workflow-columns={workflowColumns}
        >
          {facts.map((fact, index) => (
            <li key={`${fact.path ?? fact.source}:${String(index)}`}>
              <span className="readme-interpretation__step" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p>{fact.text}</p>
              <ReaderReportSource evidence={fact} {...context} />
            </li>
          ))}
        </ol>
      )}
    </DossierRegion>
  );
}

function ObservationSource({
  context,
}: {
  context: SourceContext;
}): ReactElement {
  return (
    <ReaderReportSource
      evidence={{ source: "analysis", path: null }}
      {...context}
    />
  );
}

function ClaimObservationComparison({
  report,
  context,
  headingId,
}: {
  report: AnalysisReport;
  context: SourceContext;
  headingId: string;
}): ReactElement {
  const copy = messages[context.language];
  const claims = [
    ...report.readerReport.readme.overview,
    ...report.readerReport.readme.useCases,
    ...report.readerReport.readme.dependencies,
  ];
  const hasObservations =
    report.projectBrief.kinds.length > 0 ||
    report.readerReport.architecture.ecosystems.length > 0 ||
    report.readerReport.architecture.sourceAreas.length > 0;

  return (
    <DossierRegion
      id={headingId}
      region="claim-observation"
      heading={copy.readerClaimObservationHeading}
    >
      <div className="readme-interpretation__comparison">
        <section>
          <h4>{copy.readerComparisonClaimsHeading}</h4>
          {claims.length === 0 ? (
            <p className="readme-interpretation__empty">
              {copy.readerComparisonClaimsMissing}
            </p>
          ) : (
            <EvidenceList facts={claims} context={context} />
          )}
        </section>
        <section>
          <h4>{copy.readerComparisonObservationsHeading}</h4>
          {hasObservations ? (
            <div className="readme-interpretation__observations">
              {report.projectBrief.kinds.length > 0 ? (
                <section>
                  <h5>{copy.readerComparisonKindsHeading}</h5>
                  <ul>
                    {report.projectBrief.kinds.map((fact, index) => (
                      <li key={`${fact.kind}:${String(index)}`}>
                        <strong>{copy[KIND_KEYS[fact.kind]]}</strong>
                        <ReaderReportSource evidence={fact} {...context} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {report.readerReport.architecture.ecosystems.length > 0 ? (
                <section>
                  <h5>{copy.readerComparisonEcosystemsHeading}</h5>
                  <ul>
                    {report.readerReport.architecture.ecosystems.map(
                      (ecosystem) => (
                        <li key={ecosystem}>
                          <strong>{copy[ECOSYSTEM_KEYS[ecosystem]]}</strong>
                          <ObservationSource context={context} />
                        </li>
                      ),
                    )}
                  </ul>
                </section>
              ) : null}
              {report.readerReport.architecture.sourceAreas.length > 0 ? (
                <section>
                  <h5>{copy.readerComparisonSourceAreasHeading}</h5>
                  <ul>
                    {report.readerReport.architecture.sourceAreas.map(
                      (path) => (
                        <li key={path}>
                          <ReaderReportSource
                            evidence={{ source: "tree", path }}
                            linkKind="tree"
                            {...context}
                          />
                        </li>
                      ),
                    )}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : (
            <p className="readme-interpretation__empty">
              {copy.readerComparisonObservationsMissing}
            </p>
          )}
        </section>
      </div>
    </DossierRegion>
  );
}

function CommentaryGroup({
  heading,
  ids,
  selected,
  language,
}: {
  heading: string;
  ids: readonly ReaderCommentaryId[];
  selected: ReadonlySet<ReaderCommentaryId>;
  language: Language;
}): ReactElement | null {
  const commentary = ids.filter((id) => selected.has(id));
  if (commentary.length === 0) return null;

  return (
    <section>
      <h4>{heading}</h4>
      <ul>
        {commentary.map((id) => (
          <li key={id}>{messages[language][COMMENTARY_KEYS[id]]}</li>
        ))}
      </ul>
    </section>
  );
}

function Commentary({
  report,
  context,
  headingId,
}: {
  report: AnalysisReport;
  context: SourceContext;
  headingId: string;
}): ReactElement {
  const copy = messages[context.language];
  const commentary = report.readerReport.readme.commentary;
  const selected = new Set(commentary);

  return (
    <DossierRegion
      id={headingId}
      region="commentary"
      heading={copy.readerCommentaryHeading}
    >
      {commentary.length === 0 ? (
        <p className="readme-interpretation__empty">
          {copy.readerCommentaryMissing}
        </p>
      ) : (
        <div className="readme-interpretation__commentary-groups">
          <CommentaryGroup
            heading={copy.readerCommentaryWorthHeading}
            ids={WORTH_NOTING_IDS}
            selected={selected}
            language={context.language}
          />
          <CommentaryGroup
            heading={copy.readerCommentaryVerifyHeading}
            ids={VERIFY_IDS}
            selected={selected}
            language={context.language}
          />
          <CommentaryGroup
            heading={copy.readerCommentaryPracticalHeading}
            ids={PRACTICAL_IDS}
            selected={selected}
            language={context.language}
          />
        </div>
      )}
    </DossierRegion>
  );
}

export function ReadmeInterpretationView({
  report,
  language,
}: ReadmeInterpretationViewProps): ReactElement {
  const id = useId();
  const copy = messages[language];
  const readme = report.readerReport.readme;
  const context: SourceContext = {
    owner: report.repository.owner,
    repo: report.repository.repo,
    commitSha: report.repository.commitSha,
    language,
  };

  return (
    <section
      className="readme-interpretation"
      aria-labelledby={`${id}-title`}
      data-readme-availability={readme.availability}
    >
      <header className="readme-interpretation__header">
        <p className="section-index">{copy.readerInterpretationIndex}</p>
        <p className="readme-interpretation__title" id={`${id}-title`}>
          {copy.readerInterpretationTitle}
        </p>
        {readme.availability === "unavailable" ? (
          <p className="readme-interpretation__availability">
            {copy.readerReadmeMissing}
          </p>
        ) : readme.availability === "partial" ? (
          <p className="readme-interpretation__availability">
            {copy.readerReadmePartial}
          </p>
        ) : null}
      </header>

      <Orientation
        report={report}
        context={context}
        headingId={`${id}-orientation`}
      />
      <CommunityFacts
        report={report}
        context={context}
        headingId={`${id}-community`}
      />
      <ReadmeNarrative
        report={report}
        context={context}
        headingId={`${id}-narrative`}
      />
      <CapabilityGroups
        report={report}
        context={context}
        headingId={`${id}-capabilities`}
      />
      <Workflow
        report={report}
        context={context}
        headingId={`${id}-workflow`}
      />
      <ClaimObservationComparison
        report={report}
        context={context}
        headingId={`${id}-comparison`}
      />
      <Commentary
        report={report}
        context={context}
        headingId={`${id}-commentary`}
      />
    </section>
  );
}
