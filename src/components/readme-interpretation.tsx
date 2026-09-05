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
import { formatMessage, messages, type AppMessageKey } from "../i18n/messages";
import { ReaderReportSource } from "./reader-report-source";

interface ReadmeInterpretationViewProps {
  id?: string;
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

const SIGNAL_STATE_KEYS = {
  present: "readerSignalStatePresent",
  absent: "readerSignalStateAbsent",
  unknown: "readerSignalStateUnknown",
} as const satisfies Record<ReaderSignalState, AppMessageKey>;

function listFormat(values: readonly string[], language: Language): string {
  if (values.length === 0) return messages[language].readerNotEstablished;

  return new Intl.ListFormat(language, {
    style: "short",
    type: "conjunction",
  }).format([...values]);
}

function countCopy(
  language: Language,
  count: number,
  singular: AppMessageKey,
  plural: AppMessageKey,
): string {
  return formatMessage(language, count === 1 ? singular : plural, { count });
}

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
      <h4 id={id}>{heading}</h4>
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
      <dd
        aria-label={formatMessage(
          context.language,
          "readerCommunityFactAccessible",
          { label, value: exact },
        )}
        data-exact-value={String(value)}
      >
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
      <dd
        aria-label={formatMessage(
          context.language,
          "readerCommunityFactAccessible",
          { label, value },
        )}
        data-exact-value={exactValue}
      >
        <strong
          className="readme-interpretation__community-text"
          aria-hidden="true"
        >
          {value}
        </strong>
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

function ReaderTakeaways({
  report,
  context,
  headingId,
}: {
  report: AnalysisReport;
  context: SourceContext;
  headingId: string;
}): ReactElement {
  const copy = messages[context.language];
  const reader = report.readerReport;
  const firstCapability = reader.readme.capabilityGroups[0];
  const capabilityFacts = firstCapability?.facts.slice(0, 2) ?? [];
  const workflowFacts = reader.readme.workflow.slice(0, 2);
  const readyCommand = reader.gettingStarted.commands.find(
    ({ command, disposition }) => command !== null && disposition === "ready",
  );
  const kinds = report.projectBrief.kinds.map(
    ({ kind }) => copy[KIND_KEYS[kind]],
  );
  const ecosystems = reader.architecture.ecosystems.map(
    (ecosystem) => copy[ECOSYSTEM_KEYS[ecosystem]],
  );
  const architectureFacts = reader.architecture.excerpts.slice(0, 2);
  const architectureSummary = [
    kinds.length > 0
      ? formatMessage(context.language, "readerTakeawayArchitectureKinds", {
          kinds: listFormat(kinds, context.language),
        })
      : null,
    ecosystems.length > 0
      ? formatMessage(
          context.language,
          "readerTakeawayArchitectureEcosystems",
          { ecosystems: listFormat(ecosystems, context.language) },
        )
      : null,
  ].filter((detail): detail is string => detail !== null);
  const architectureArea = reader.architecture.sourceAreas[0];
  const boundaryFacts = [
    ...reader.readme.limitations.slice(0, 1),
    ...reader.readme.dependencies.slice(0, 1),
  ];
  const boundarySignal = reader.reliability.signals.find(
    ({ signal }) => signal === "security-policy" || signal === "license",
  );

  const items = [
    {
      heading: copy.readerTakeawayCapabilitiesHeading,
      label: firstCapability?.label ?? null,
      interpretation: copy.readerTakeawayCapabilitiesInterpretation,
      facts: capabilityFacts,
      fallback: copy.readerTakeawayCapabilitiesMissing,
      href: "#reader-readme",
      linkLabel: copy.readerTakeawayCapabilitiesLink,
    },
    {
      heading: copy.readerTakeawayWorkflowHeading,
      label: null,
      interpretation: copy.readerTakeawayWorkflowInterpretation,
      facts: workflowFacts,
      fallback: copy.readerTakeawayWorkflowMissing,
      command: readyCommand,
      href: "#reader-getting-started",
      linkLabel: copy.readerTakeawayWorkflowLink,
    },
    {
      heading: copy.readerTakeawayArchitectureHeading,
      label:
        architectureSummary.length > 0
          ? formatMessage(context.language, "readerTakeawayArchitecture", {
              details: architectureSummary.join(
                context.language === "zh-CN" ? "；" : "; ",
              ),
            })
          : null,
      interpretation: copy.readerTakeawayArchitectureInterpretation,
      facts: architectureFacts,
      fallback: copy.readerTakeawayArchitectureMissing,
      architectureArea,
      href: "#reader-architecture",
      linkLabel: copy.readerTakeawayArchitectureLink,
    },
    {
      heading: copy.readerTakeawayRiskHeading,
      label: null,
      interpretation: copy.readerTakeawayRiskInterpretation,
      facts: boundaryFacts,
      fallback: copy.readerNotEstablished,
      signal: boundarySignal,
      href: "#reader-security",
      linkLabel: copy.readerTakeawayRiskLink,
    },
  ];

  return (
    <DossierRegion
      id={headingId}
      region="takeaways"
      heading={copy.readerTakeawaysHeading}
    >
      <ol className="readme-interpretation__takeaways">
        {items.map((item, index) => (
          <li key={item.heading}>
            <span className="readme-interpretation__takeaway-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h5>{item.heading}</h5>
              {item.label === null ? null : (
                <p className="readme-interpretation__takeaway-label">
                  {item.label}
                </p>
              )}
              {item.facts.length > 0 ? (
                <EvidenceList
                  facts={item.facts}
                  context={context}
                  className="readme-interpretation__takeaway-evidence"
                />
              ) : item.command?.command !== null &&
                item.command?.command !== undefined ? (
                <div className="readme-interpretation__takeaway-command">
                  <code>{item.command.command}</code>
                  <ReaderReportSource evidence={item.command} {...context} />
                </div>
              ) : item.architectureArea !== undefined ? (
                <div className="readme-interpretation__takeaway-area">
                  <ReaderReportSource
                    evidence={{ source: "tree", path: item.architectureArea }}
                    linkKind="tree"
                    {...context}
                  />
                </div>
              ) : item.signal !== undefined ? (
                <p className="readme-interpretation__takeaway-signal">
                  {formatMessage(
                    context.language,
                    "readerTakeawaySignalState",
                    {
                      state: copy[SIGNAL_STATE_KEYS[item.signal.state]],
                    },
                  )}
                  <ReaderReportSource evidence={item.signal} {...context} />
                </p>
              ) : (
                <p className="readme-interpretation__empty">{item.fallback}</p>
              )}
              <p className="readme-interpretation__takeaway-interpretation">
                {item.interpretation}
              </p>
              <a
                className="readme-interpretation__takeaway-link"
                href={item.href}
              >
                {item.linkLabel}
              </a>
            </div>
          </li>
        ))}
      </ol>
      <p className="readme-interpretation__takeaway-boundary">
        {copy.readerTakeawayBoundary}
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
      <h5>{heading}</h5>
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
              <h5>{group.label}</h5>
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
  const readme = report.readerReport.readme;
  const allEvidenceMap: Array<readonly [string, number]> = [
    [copy.readerReadmeOverviewSubheading, readme.overview.length],
    [copy.readerReadmeAudienceSubheading, readme.audiences.length],
    [copy.readerReadmeProblemsSubheading, readme.problems.length],
    [copy.readerReadmeUseCasesSubheading, readme.useCases.length],
    [copy.readerReadmeDependenciesSubheading, readme.dependencies.length],
    [copy.readerReadmeLimitationsSubheading, readme.limitations.length],
    [copy.readerReadmeMaturitySubheading, readme.maturity.length],
  ];
  const evidenceMap = allEvidenceMap.filter(([, count]) => count > 0);
  const capabilityLabels = readme.capabilityGroups.map(({ label }) => label);
  const firstReadmeEvidence = [
    ...readme.overview,
    ...readme.audiences,
    ...readme.problems,
    ...readme.useCases,
    ...readme.capabilityGroups.flatMap(({ facts }) => facts),
    ...readme.workflow,
    ...readme.dependencies,
    ...readme.limitations,
    ...readme.maturity,
  ][0];
  const hasReadmeMap =
    evidenceMap.length > 0 ||
    capabilityLabels.length > 0 ||
    readme.workflow.length > 0;
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
          <h5>{copy.readerComparisonClaimsHeading}</h5>
          {!hasReadmeMap ? (
            <p className="readme-interpretation__empty">
              {copy.readerComparisonClaimsMissing}
            </p>
          ) : (
            <>
              <dl className="readme-interpretation__evidence-map">
                {evidenceMap.map(([label, count]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {countCopy(
                        context.language,
                        count,
                        "readerCountCitedStatement",
                        "readerCountCitedStatements",
                      )}
                    </dd>
                  </div>
                ))}
                {capabilityLabels.length > 0 ? (
                  <div>
                    <dt>{copy.readerCapabilitiesHeading}</dt>
                    <dd>
                      {countCopy(
                        context.language,
                        capabilityLabels.length,
                        "readerCountEvidenceCapabilityGroup",
                        "readerCountEvidenceCapabilityGroups",
                      )}
                    </dd>
                  </div>
                ) : null}
                {readme.workflow.length > 0 ? (
                  <div>
                    <dt>{copy.readerWorkflowHeading}</dt>
                    <dd>
                      {countCopy(
                        context.language,
                        readme.workflow.length,
                        "readerCountDocumentedStep",
                        "readerCountDocumentedSteps",
                      )}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {firstReadmeEvidence === undefined ? null : (
                <ReaderReportSource
                  evidence={firstReadmeEvidence}
                  {...context}
                />
              )}
            </>
          )}
        </section>
        <section>
          <h5>{copy.readerComparisonObservationsHeading}</h5>
          {hasObservations ? (
            <div className="readme-interpretation__observations">
              {report.projectBrief.kinds.length > 0 ? (
                <section>
                  <h6>{copy.readerComparisonKindsHeading}</h6>
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
                  <h6>{copy.readerComparisonEcosystemsHeading}</h6>
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
                  <h6>{copy.readerComparisonSourceAreasHeading}</h6>
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
  report,
  context,
}: {
  heading: string;
  ids: readonly ReaderCommentaryId[];
  selected: ReadonlySet<ReaderCommentaryId>;
  report: AnalysisReport;
  context: SourceContext;
}): ReactElement | null {
  const commentary = ids.filter((id) => selected.has(id));
  if (commentary.length === 0) return null;

  const evidenceFor = (
    id: ReaderCommentaryId,
  ): ReaderEvidenceSource | undefined => {
    const readme = report.readerReport.readme;

    switch (id) {
      case "readme-substantial-overview":
        return readme.overview[0];
      case "readme-audience-or-use-cases-documented":
        return (
          readme.audiences[0] ??
          readme.useCases[0] ??
          report.readerReport.scenarios.facts[0]
        );
      case "readme-capabilities-documented":
        return readme.capabilityGroups[0]?.facts[0];
      case "readme-workflow-documented":
        return readme.workflow[0];
      case "readme-onboarding-documented":
        return report.readerReport.gettingStarted.commands[0];
      case "readme-limitations-documented":
        return readme.limitations[0];
      case "readme-maturity-documented":
        return readme.maturity[0];
      case "readme-broad-structure-corroborated":
        return (
          report.readerReport.architecture.excerpts[0] ??
          (report.readerReport.architecture.sourceAreas[0] === undefined
            ? undefined
            : {
                source: "tree",
                path: report.readerReport.architecture.sourceAreas[0],
              })
        );
      case "readme-external-dependencies-declared":
        return readme.dependencies[0];
      default:
        return { source: "analysis", path: null };
    }
  };

  return (
    <section>
      <h5>{heading}</h5>
      <ul>
        {commentary.map((id) => {
          const evidence = evidenceFor(id);
          return (
            <li key={id}>
              <p>{messages[context.language][COMMENTARY_KEYS[id]]}</p>
              {evidence === undefined ? null : (
                <ReaderReportSource evidence={evidence} {...context} />
              )}
            </li>
          );
        })}
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
            report={report}
            context={context}
          />
          <CommentaryGroup
            heading={copy.readerCommentaryVerifyHeading}
            ids={VERIFY_IDS}
            selected={selected}
            report={report}
            context={context}
          />
          <CommentaryGroup
            heading={copy.readerCommentaryPracticalHeading}
            ids={PRACTICAL_IDS}
            selected={selected}
            report={report}
            context={context}
          />
        </div>
      )}
    </DossierRegion>
  );
}

export function ReadmeInterpretationView({
  id,
  report,
  language,
}: ReadmeInterpretationViewProps): ReactElement {
  const headingPrefix = useId();
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
      id={id}
      className="readme-interpretation"
      aria-labelledby={`${headingPrefix}-title`}
      data-readme-availability={readme.availability}
    >
      <header className="readme-interpretation__header">
        <p className="section-index">{copy.readerInterpretationIndex}</p>
        <h3
          className="readme-interpretation__title"
          id={`${headingPrefix}-title`}
        >
          {copy.readerInterpretationTitle}
        </h3>
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
        headingId={`${headingPrefix}-orientation`}
      />
      <CommunityFacts
        report={report}
        context={context}
        headingId={`${headingPrefix}-community`}
      />
      <ReaderTakeaways
        report={report}
        context={context}
        headingId={`${headingPrefix}-takeaways`}
      />
      <ReadmeNarrative
        report={report}
        context={context}
        headingId={`${headingPrefix}-narrative`}
      />
      <CapabilityGroups
        report={report}
        context={context}
        headingId={`${headingPrefix}-capabilities`}
      />
      <Workflow
        report={report}
        context={context}
        headingId={`${headingPrefix}-workflow`}
      />
      <ClaimObservationComparison
        report={report}
        context={context}
        headingId={`${headingPrefix}-comparison`}
      />
      <Commentary
        report={report}
        context={context}
        headingId={`${headingPrefix}-commentary`}
      />
    </section>
  );
}
