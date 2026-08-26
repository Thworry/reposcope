import type { ReactElement, ReactNode } from "react";

import {
  READER_COMMAND_KINDS,
  type AnalysisReport,
  type Language,
  type ProjectBriefCaution,
  type ProjectBriefExcerpt,
  type ProjectKind,
  type ReaderActivityBand,
  type ReaderAvailability,
  type ReaderCommandKind,
  type ReaderEcosystem,
  type ReaderEvidenceSource,
  type ReaderQuestionId,
  type ReaderSignalFact,
  type ReaderSignalId,
  type ReaderSignalState,
  type ReaderTextFact,
  type ReliabilityStatus,
} from "../features/analysis/model";
import { formatMessage, messages, type AppMessageKey } from "../i18n/messages";
import { ReadmeInterpretationView } from "./readme-interpretation";
import { ReaderReportSource } from "./reader-report-source";

interface ReaderReportViewProps {
  report: AnalysisReport;
  language: Language;
}

interface SourceContext {
  owner: string;
  repo: string;
  commitSha: string;
  language: Language;
}

type ReaderSourceEvidence =
  ReaderEvidenceSource | Pick<ProjectBriefExcerpt, "source" | "path">;

const STATUS_KEYS = {
  "continue-evaluation": "readerStatusContinue",
  "verify-before-use": "readerStatusVerify",
  "insufficient-evidence": "readerStatusInsufficient",
} as const satisfies Record<ReliabilityStatus, AppMessageKey>;

const SIGNAL_KEYS = {
  archived: "readerSignalArchived",
  install: "readerSignalInstall",
  run: "readerSignalRun",
  license: "readerSignalLicense",
  "recent-activity": "readerSignalRecentActivity",
  tests: "readerSignalTests",
  ci: "readerSignalCi",
  coverage: "readerSignalCoverage",
  "security-policy": "readerSignalSecurityPolicy",
  "version-history": "readerSignalVersionHistory",
  contributing: "readerSignalContributing",
  "issue-templates": "readerSignalIssueTemplates",
  "dependency-updates": "readerSignalDependencyUpdates",
  configuration: "readerSignalConfiguration",
} as const satisfies Record<ReaderSignalId, AppMessageKey>;

const SIGNAL_STATE_KEYS = {
  present: "readerSignalStatePresent",
  absent: "readerSignalStateAbsent",
  unknown: "readerSignalStateUnknown",
} as const satisfies Record<ReaderSignalState, AppMessageKey>;

const QUESTION_KEYS = {
  "license-compatibility": "readerQuestionLicense",
  "reproduce-install-run": "readerQuestionInstallRun",
  "runtime-data-flow": "readerQuestionRuntimeData",
  "vulnerability-process": "readerQuestionVulnerabilities",
  "release-compatibility": "readerQuestionRelease",
} as const satisfies Record<ReaderQuestionId, AppMessageKey>;

const COMMAND_KEYS = {
  install: "readerCommandInstall",
  run: "readerCommandRun",
  develop: "readerCommandDevelop",
  test: "readerCommandTest",
  build: "readerCommandBuild",
} as const satisfies Record<ReaderCommandKind, AppMessageKey>;

const ACTIVITY_BAND_KEYS = {
  "within-180-days": "readerActivityWithin180",
  "181-365-days": "readerActivity181To365",
  "over-365-days": "readerActivityOver365",
} as const satisfies Record<ReaderActivityBand, AppMessageKey>;

const CAUTION_KEYS = {
  archived: "projectCautionArchived",
  "insufficient-explanation": "projectCautionInsufficientExplanation",
  "license-evidence-absent": "projectCautionLicenseEvidenceAbsent",
  "entry-point-evidence-absent": "projectCautionEntryPointEvidenceAbsent",
} as const satisfies Record<ProjectBriefCaution, AppMessageKey>;

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

const COMPARISON_KEYS = [
  "readerComparisonPurpose",
  "readerComparisonLicense",
  "readerComparisonOnboarding",
  "readerComparisonTests",
  "readerComparisonSecurity",
  "readerComparisonMaintenance",
  "readerComparisonEcosystem",
  "readerComparisonOperations",
] as const satisfies readonly AppMessageKey[];

const DECISION_SIGNAL_PRIORITY = [
  "archived",
  "license",
  "recent-activity",
  "tests",
  "ci",
] as const satisfies readonly ReaderSignalId[];

const READER_SECTION_IDS = {
  readme: "reader-readme",
  decision: "reader-decision",
  purpose: "reader-purpose",
  reliability: "reader-reliability",
  architecture: "reader-architecture",
  gettingStarted: "reader-getting-started",
  security: "reader-security",
  maintenance: "reader-maintenance",
} as const;

const READER_NAVIGATION_ITEMS = [
  [READER_SECTION_IDS.readme, "readerInterpretationTitle"],
  [READER_SECTION_IDS.decision, "readerDecisionHeading"],
  [READER_SECTION_IDS.purpose, "readerPurposeHeading"],
  [READER_SECTION_IDS.reliability, "readerReliabilityHeading"],
  [READER_SECTION_IDS.architecture, "readerArchitectureHeading"],
  [READER_SECTION_IDS.gettingStarted, "readerGettingStartedHeading"],
  [READER_SECTION_IDS.security, "readerSecurityHeading"],
  [READER_SECTION_IDS.maintenance, "readerMaintenanceHeading"],
] as const satisfies readonly (readonly [string, AppMessageKey])[];

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

function canonicalFactKey(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function AvailabilityNotice({
  availability,
  language,
}: {
  availability: ReaderAvailability;
  language: Language;
}): ReactElement | null {
  if (availability === "available") return null;

  return (
    <p className="reader-report__availability">
      {
        messages[language][
          availability === "partial"
            ? "readerPartialEvidence"
            : "readerUnavailable"
        ]
      }
    </p>
  );
}

function Chapter({
  number,
  section,
  headingId,
  heading,
  availability,
  language,
  children,
}: {
  number: number;
  section: string;
  headingId: string;
  heading: string;
  availability?: ReaderAvailability;
  language: Language;
  children: ReactNode;
}): ReactElement {
  return (
    <section
      className="reader-chapter"
      role="region"
      aria-labelledby={headingId}
      data-reader-section={section}
      data-reader-availability={availability}
    >
      <p className="section-index">{String(number).padStart(2, "0")} / 06</p>
      <h3 id={headingId}>{heading}</h3>
      {availability === undefined ? null : (
        <AvailabilityNotice availability={availability} language={language} />
      )}
      {children}
    </section>
  );
}

function TextFact({
  fact,
  context,
}: {
  fact: ReaderTextFact | ProjectBriefExcerpt;
  context: SourceContext;
}): ReactElement {
  return (
    <figure className="reader-report__evidence">
      <blockquote>
        <p>{fact.text}</p>
      </blockquote>
      <figcaption>
        <ReaderEvidenceCaption evidence={fact} context={context} />
      </figcaption>
    </figure>
  );
}

function ReaderEvidenceCaption({
  evidence,
  context,
}: {
  evidence: ReaderSourceEvidence;
  context: SourceContext;
}): ReactElement {
  if (evidence.source === "analysis") {
    return <DeterministicAnalysisSource language={context.language} />;
  }

  return <ReaderReportSource evidence={evidence} {...context} />;
}

function DeterministicAnalysisSource({
  language,
}: {
  language: Language;
}): ReactElement {
  return (
    <span className="reader-report__source" data-evidence-source="analysis">
      {messages[language].readerSourceDeterministicAnalysis}
    </span>
  );
}

function SignalList({
  signals,
  context,
}: {
  signals: readonly ReaderSignalFact[];
  context: SourceContext;
}): ReactElement {
  const copy = messages[context.language];
  const signalGroups: Array<{
    key: string;
    source: ReaderSignalFact;
    signals: ReaderSignalFact[];
  }> = [];

  for (const fact of signals) {
    const key = `${fact.source}:${fact.path ?? ""}`;
    const group = signalGroups.find((candidate) => candidate.key === key);
    if (group === undefined) {
      signalGroups.push({ key, source: fact, signals: [fact] });
    } else {
      group.signals.push(fact);
    }
  }

  return (
    <div className="reader-report__signal-list">
      {signalGroups.map((group) => (
        <div className="reader-report__signal-group" key={group.key}>
          <ul className="reader-report__evidence-list">
            {group.signals.map((fact) => (
              <li key={fact.signal} data-signal-state={fact.state}>
                <span>
                  {formatMessage(context.language, "readerSignalStateSummary", {
                    signal: copy[SIGNAL_KEYS[fact.signal]],
                    state: copy[SIGNAL_STATE_KEYS[fact.state]],
                  })}
                </span>
              </li>
            ))}
          </ul>
          <p
            className="reader-report__signal-sources"
            data-reader-signal-sources
          >
            <ReaderEvidenceCaption evidence={group.source} context={context} />
          </p>
        </div>
      ))}
    </div>
  );
}

function QuestionList({
  questions,
  language,
}: {
  questions: readonly ReaderQuestionId[];
  language: Language;
}): ReactElement {
  const copy = messages[language];

  return (
    <ol className="reader-report__questions">
      {questions.map((question) => (
        <li key={question}>{copy[QUESTION_KEYS[question]]}</li>
      ))}
    </ol>
  );
}

function StatusBlock({
  status,
  language,
}: {
  status: ReliabilityStatus;
  language: Language;
}): ReactElement {
  const copy = messages[language];

  return (
    <div className="reader-report__status" data-reader-status={status}>
      <strong>{copy[STATUS_KEYS[status]]}</strong>
      <span className="reader-report__analysis-source">
        {copy.readerSourceDeterministicAnalysis}
      </span>
    </div>
  );
}

function Commands({
  report,
  context,
}: {
  report: AnalysisReport;
  context: SourceContext;
}): ReactElement {
  const copy = messages[context.language];

  return (
    <ol className="reader-report__commands">
      {READER_COMMAND_KINDS.map((kind) => {
        const fact = report.readerReport.gettingStarted.commands.find(
          (command) => command.kind === kind,
        );

        return (
          <li key={kind} data-command-kind={kind}>
            <h4>{copy[COMMAND_KEYS[kind]]}</h4>
            {fact === undefined ? (
              <p>{copy.readerStepUnavailable}</p>
            ) : (
              <div data-command-disposition={fact.disposition}>
                {fact.command === null ? (
                  <p>{copy.readerCommandWithheld}</p>
                ) : (
                  <pre>
                    <code>{fact.command}</code>
                  </pre>
                )}
                {fact.disposition === "review" ? (
                  <p>{copy.readerCommandReview}</p>
                ) : null}
                <ReaderReportSource evidence={fact} {...context} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function AlternativeComparison({
  report,
  language,
}: {
  report: AnalysisReport;
  language: Language;
}): ReactElement {
  const copy = messages[language];
  const terms = report.readerReport.alternatives.searchTerms;

  return (
    <div className="reader-report__alternatives">
      <h4>{copy.readerAlternativesHeading}</h4>
      <p>{copy.readerComparisonHeading}</p>
      <ul>
        {COMPARISON_KEYS.map((key) => (
          <li key={key}>{copy[key]}</li>
        ))}
      </ul>
      {terms.length > 0 ? (
        <ul aria-label={copy.readerAlternativeSearch}>
          {terms.map((term) => (
            <li key={term}>
              <a
                className="reader-report__search"
                href={`https://github.com/search?q=${encodeURIComponent(`${term} in:name,description,readme archived:false`)}&type=repositories`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {formatMessage(language, "readerAlternativeSearchTerm", {
                  term,
                })}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ReaderReportView({
  report,
  language,
}: ReaderReportViewProps): ReactElement {
  const copy = messages[language];
  const reader = report.readerReport;
  const context: SourceContext = {
    owner: report.repository.owner,
    repo: report.repository.repo,
    commitSha: report.repository.commitSha,
    language,
  };
  const decisiveSignals = DECISION_SIGNAL_PRIORITY.flatMap((signal) => {
    const fact = reader.reliability.signals.find(
      (candidate) => candidate.signal === signal,
    );
    return fact === undefined ? [] : [fact];
  }).slice(0, 3);
  const quickCommands = (["install", "run"] as const).flatMap((kind) => {
    const fact = reader.gettingStarted.commands.find(
      (command) => command.kind === kind && command.command !== null,
    );
    return fact === undefined ? [] : [fact];
  });
  const orientationKeys = new Set(
    report.projectBrief.excerpts.map(({ text }) => canonicalFactKey(text)),
  );
  const seenScenarioKeys = new Set<string>();
  const scenarios = reader.scenarios.facts.filter(({ text }) => {
    const key = canonicalFactKey(text);
    if (orientationKeys.has(key) || seenScenarioKeys.has(key)) return false;
    seenScenarioKeys.add(key);
    return true;
  });
  const seenKinds = new Set<ProjectKind>();
  const projectKinds = report.projectBrief.kinds.filter(({ kind }) => {
    if (seenKinds.has(kind)) return false;
    seenKinds.add(kind);
    return true;
  });
  const hasBroadArchitectureEvidence =
    reader.architecture.excerpts.length > 0 ||
    reader.architecture.documents.length > 0 ||
    reader.architecture.sourceAreas.length > 0 ||
    reader.architecture.ecosystems.length > 0;
  const architectureExcerptPaths = new Set(
    reader.architecture.excerpts.flatMap(({ path }) =>
      path === null ? [] : [path],
    ),
  );
  const architectureDocuments = reader.architecture.documents.filter(
    (path) => !architectureExcerptPaths.has(path),
  );

  return (
    <div className="reader-report">
      <nav
        className="reader-report__navigation"
        aria-label={copy.readerNavigationLabel}
      >
        <p>{copy.readerNavigationHeading}</p>
        <ol>
          {READER_NAVIGATION_ITEMS.map(([target, label]) => (
            <li key={target}>
              <a href={`#${target}`}>{copy[label]}</a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="reader-report__content">
        <ReadmeInterpretationView
          id={READER_SECTION_IDS.readme}
          report={report}
          language={language}
        />

        <section
          className="reader-report__decision"
          role="region"
          aria-labelledby={READER_SECTION_IDS.decision}
          data-reader-section="decision-summary"
        >
          <p className="section-index">{copy.readerDecisionIndex}</p>
          <h3 id={READER_SECTION_IDS.decision}>{copy.readerDecisionHeading}</h3>

          <div className="reader-report__decision-item">
            <h4>{copy.readerEvidenceStatus}</h4>
            <StatusBlock
              status={reader.reliability.status}
              language={language}
            />
            <SignalList signals={decisiveSignals} context={context} />
          </div>

          <div className="reader-report__decision-item">
            <h4>{copy.readerQuestionsHeading}</h4>
            <QuestionList
              questions={reader.reliability.questions.slice(0, 2)}
              language={language}
            />
          </div>

          {quickCommands.length > 0 ? (
            <div className="reader-report__decision-item">
              <h4>{copy.readerQuickStartHeading}</h4>
              <ul className="reader-report__quick-commands">
                {quickCommands.map((fact) => (
                  <li
                    key={fact.kind}
                    data-command-disposition={fact.disposition}
                  >
                    <strong>{copy[COMMAND_KEYS[fact.kind]]}</strong>
                    <code>{fact.command}</code>
                    {fact.disposition === "review" ? (
                      <p>{copy.readerCommandReview}</p>
                    ) : null}
                    <ReaderReportSource evidence={fact} {...context} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <Chapter
          number={1}
          section="project-fit-cautions"
          headingId={READER_SECTION_IDS.purpose}
          heading={copy.readerPurposeHeading}
          language={language}
        >
          <div className="reader-report__chapter-group">
            <h4>{copy.readerScenariosHeading}</h4>
            {scenarios.length === 0 ? (
              <p>{copy.readerScenariosMissing}</p>
            ) : (
              <div className="reader-report__fact-list">
                {scenarios.map((fact, index) => (
                  <TextFact
                    key={`${fact.path ?? fact.source}:${canonicalFactKey(fact.text)}:${String(index)}`}
                    fact={fact}
                    context={context}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="reader-report__chapter-group">
            <h4>{copy.readerKindsHeading}</h4>
            {projectKinds.length === 0 ? (
              <p>{copy.projectBriefKindUnknown}</p>
            ) : (
              <ul className="reader-report__evidence-list">
                {projectKinds.map((fact) => (
                  <li key={fact.kind}>
                    <strong>{copy[KIND_KEYS[fact.kind]]}</strong>
                    <ReaderEvidenceCaption evidence={fact} context={context} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="reader-report__chapter-group">
            <h4>{copy.readerCautionsHeading}</h4>
            {report.projectBrief.cautions.length === 0 ? (
              <p>{copy.projectBriefNoCautions}</p>
            ) : (
              <ul className="reader-report__evidence-list">
                {report.projectBrief.cautions.map((fact) => (
                  <li key={fact.caution}>
                    <span>{copy[CAUTION_KEYS[fact.caution]]}</span>
                    <ReaderEvidenceCaption evidence={fact} context={context} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Chapter>

        <Chapter
          number={2}
          section="reliability"
          headingId={READER_SECTION_IDS.reliability}
          heading={copy.readerReliabilityHeading}
          availability={reader.reliability.availability}
          language={language}
        >
          <StatusBlock status={reader.reliability.status} language={language} />
          <div className="reader-report__chapter-group">
            <h4>{copy.readerReliabilityReasons}</h4>
            <SignalList
              signals={reader.reliability.signals}
              context={context}
            />
          </div>
          <div className="reader-report__chapter-group">
            <h4>{copy.readerQuestionsHeading}</h4>
            <QuestionList
              questions={reader.reliability.questions}
              language={language}
            />
          </div>
        </Chapter>

        <Chapter
          number={3}
          section="architecture"
          headingId={READER_SECTION_IDS.architecture}
          heading={copy.readerArchitectureHeading}
          availability={reader.architecture.availability}
          language={language}
        >
          {!hasBroadArchitectureEvidence ? (
            <p>{copy.readerUnavailable}</p>
          ) : null}
          {reader.architecture.excerpts.length > 0 ? (
            <div className="reader-report__chapter-group">
              <h4>{copy.readerArchitectureEvidence}</h4>
              <div className="reader-report__fact-list">
                {reader.architecture.excerpts.map((fact, index) => (
                  <TextFact
                    key={`${fact.path ?? fact.source}:${String(index)}`}
                    fact={fact}
                    context={context}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {architectureDocuments.length > 0 ? (
            <div className="reader-report__chapter-group">
              <h4>{copy.readerArchitectureDocuments}</h4>
              <ul className="reader-report__path-list">
                {architectureDocuments.map((path) => (
                  <li key={path}>
                    <ReaderReportSource
                      evidence={{ source: "documentation", path }}
                      {...context}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {reader.architecture.sourceAreas.length > 0 ? (
            <div className="reader-report__chapter-group">
              <h4>{copy.readerArchitectureSourceAreas}</h4>
              <ul className="reader-report__path-list">
                {reader.architecture.sourceAreas.map((path) => (
                  <li key={path}>
                    <ReaderReportSource
                      evidence={{ source: "tree", path }}
                      linkKind="tree"
                      {...context}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {reader.architecture.ecosystems.length > 0 ? (
            <div className="reader-report__chapter-group">
              <h4>{copy.readerArchitectureEcosystems}</h4>
              <ul className="reader-report__evidence-list">
                {reader.architecture.ecosystems.map((ecosystem) => (
                  <li key={ecosystem}>
                    <strong>{copy[ECOSYSTEM_KEYS[ecosystem]]}</strong>
                  </li>
                ))}
              </ul>
              <DeterministicAnalysisSource language={language} />
            </div>
          ) : null}
        </Chapter>

        <Chapter
          number={4}
          section="getting-started"
          headingId={READER_SECTION_IDS.gettingStarted}
          heading={copy.readerGettingStartedHeading}
          availability={reader.gettingStarted.availability}
          language={language}
        >
          {reader.readme.dependencies.length > 0 ? (
            <div className="reader-report__chapter-group">
              <h4>{copy.readerGettingStartedRequirements}</h4>
              <div className="reader-report__fact-list">
                {reader.readme.dependencies.map((fact, index) => (
                  <TextFact
                    key={`${fact.path ?? fact.source}:${String(index)}`}
                    fact={fact}
                    context={context}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <div className="reader-report__chapter-group">
            <h4>{copy.readerGettingStartedCommands}</h4>
            <Commands report={report} context={context} />
          </div>
        </Chapter>

        <Chapter
          number={5}
          section="security-privacy"
          headingId={READER_SECTION_IDS.security}
          heading={copy.readerSecurityHeading}
          availability={reader.securityPrivacy.availability}
          language={language}
        >
          <div className="reader-report__chapter-group">
            <h4>{copy.readerSecurityObserved}</h4>
            <SignalList
              signals={reader.securityPrivacy.signals}
              context={context}
            />
          </div>
          <div className="reader-report__chapter-group">
            <h4>{copy.readerSecurityDeclarations}</h4>
            {reader.securityPrivacy.declarations.length === 0 ? (
              <p>{copy.readerNotEstablished}</p>
            ) : (
              <div className="reader-report__fact-list">
                {reader.securityPrivacy.declarations.map((fact, index) => (
                  <TextFact
                    key={`${fact.path ?? fact.source}:${String(index)}`}
                    fact={fact}
                    context={context}
                  />
                ))}
              </div>
            )}
          </div>
          <p className="reader-report__security-boundary">
            {copy.readerSecurityBoundary}
            <span className="reader-report__analysis-source">
              {copy.readerSourceDeterministicAnalysis}
            </span>
          </p>
        </Chapter>

        <Chapter
          number={6}
          section="maintenance-alternatives"
          headingId={READER_SECTION_IDS.maintenance}
          heading={copy.readerMaintenanceHeading}
          availability={reader.maintenance.availability}
          language={language}
        >
          <div className="reader-report__chapter-group">
            <h4>{copy.readerMaintenanceFacts}</h4>
            <dl className="reader-report__maintenance-facts">
              <div>
                <dt>{copy.readerArchivedLabel}</dt>
                <dd>
                  {report.repository.archived ? copy.readerYes : copy.readerNo}
                  <span className="reader-report__metadata-source">
                    {copy.projectBriefSourceMetadata}
                  </span>
                </dd>
              </div>
              <div>
                <dt>
                  {formatMessage(language, "readerLastPush", {
                    date: formatDate(report.repository.pushedAt, language),
                  })}
                </dt>
                <dd>
                  {formatMessage(language, "readerActivity", {
                    days: reader.maintenance.activity.elapsedUtcDays,
                    band: copy[
                      ACTIVITY_BAND_KEYS[reader.maintenance.activity.band]
                    ],
                  })}
                  <span className="reader-report__metadata-source">
                    {copy.projectBriefSourceMetadata}
                  </span>
                  <span className="reader-report__analysis-source">
                    {copy.readerSourceDeterministicAnalysis}
                  </span>
                </dd>
              </div>
              <div>
                <dt>
                  {formatMessage(language, "readerOpenIssues", {
                    count: reader.maintenance.openIssuesCount,
                  })}
                </dt>
                <dd>{copy.projectBriefSourceMetadata}</dd>
              </div>
            </dl>
          </div>
          <div className="reader-report__chapter-group">
            <h4>{copy.readerMaintenanceEvidence}</h4>
            <SignalList
              signals={reader.maintenance.signals}
              context={context}
            />
          </div>
          <AlternativeComparison report={report} language={language} />
        </Chapter>
      </div>
    </div>
  );
}
