import type { ReactNode } from "react";

import type { Language } from "../features/analysis/model";
import type {
  DeepEvidence,
  DeepReport,
  DeepStatement,
} from "../features/deep-analysis/model";
import { messages, type AppMessageKey } from "../i18n/messages";
import { ExpertStatement } from "./expert-statement";

interface ExpertReportProps {
  report: DeepReport;
  language: Language;
}

interface StatementListProps {
  statements: readonly DeepStatement[];
  evidence: readonly DeepEvidence[];
  language: Language;
  ordered?: boolean;
}

function StatementList({
  statements,
  evidence,
  language,
  ordered = false,
}: StatementListProps) {
  const List = ordered ? "ol" : "ul";
  return (
    <List className="expert-statement-list">
      {statements.map((statement, index) => (
        <li key={`${statement.text}-${String(index)}`}>
          <ExpertStatement
            statement={statement}
            evidence={evidence}
            language={language}
          />
        </li>
      ))}
    </List>
  );
}

function Chapter({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="expert-chapter"
      aria-labelledby={`expert-chapter-${String(number)}`}
    >
      <p className="section-index">{String(number).padStart(2, "0")} / 10</p>
      <div className="expert-chapter__body">
        <h3 id={`expert-chapter-${String(number)}`}>{title}</h3>
        {children}
      </div>
    </section>
  );
}

function Subsection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="expert-subsection">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function formatDate(value: string | null, language: Language): string {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(language, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(date)
    : value;
}

function communityFacts(
  community: DeepReport["maintenance"]["community"],
  language: Language,
): Array<{ label: string; value: string }> {
  const copy = messages[language];
  const number = new Intl.NumberFormat(language);
  return [
    { label: copy.deepCommunityStars, value: number.format(community.stars) },
    {
      label: copy.deepCommunityWatchers,
      value: number.format(community.watchers),
    },
    { label: copy.deepCommunityForks, value: number.format(community.forks) },
    {
      label: copy.deepCommunityIssues,
      value: number.format(community.openIssues),
    },
    {
      label: copy.deepCommunityPush,
      value: formatDate(community.pushedAt, language),
    },
    {
      label: copy.deepCommunityArchived,
      value: community.archived ? copy.readerYes : copy.readerNo,
    },
    { label: copy.deepCommunityLicense, value: community.license ?? "—" },
  ];
}

function repositoryUrl(repository: { owner: string; repo: string }): string {
  return `https://github.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
}

const DECISION_KEYS: Record<
  DeepReport["finalVerdict"]["decision"],
  AppMessageKey
> = {
  "worth-trying": "deepDecisionWorthTrying",
  "compare-first": "deepDecisionCompareFirst",
  "not-enough-evidence": "deepDecisionNotEnough",
};

export function ExpertReport({ report, language }: ExpertReportProps) {
  const copy = messages[language];
  return (
    <section className="expert-report" aria-labelledby="expert-report-heading">
      <header className="expert-report__header">
        <p className="section-index">02 / {copy.deepReportIndex}</p>
        <div>
          <h2 id="expert-report-heading">{copy.deepReportHeading}</h2>
          <p>{copy.deepReportMethod}</p>
          <ul className="expert-report__review-meta">
            <li>
              {report.review.coverage === "full"
                ? copy.deepCoverageFull
                : copy.deepCoverageReduced}
            </li>
            <li>
              {report.review.capabilityClass === "auto"
                ? copy.deepCapabilityAuto
                : copy.deepCapabilityMulti}
            </li>
          </ul>
        </div>
      </header>

      <Chapter number={1} title={copy.deepChapterOrientation}>
        <StatementList
          statements={report.orientation.summary}
          evidence={report.evidence}
          language={language}
        />
        <ExpertStatement
          statement={report.orientation.verdict}
          evidence={report.evidence}
          language={language}
          emphasis
        />
      </Chapter>

      <Chapter number={2} title={copy.deepChapterFit}>
        <div className="expert-columns">
          <Subsection title={copy.deepGoodFor}>
            <StatementList
              statements={report.fit.goodFor}
              evidence={report.evidence}
              language={language}
            />
          </Subsection>
          <Subsection title={copy.deepPoorFor}>
            <StatementList
              statements={report.fit.poorFor}
              evidence={report.evidence}
              language={language}
            />
          </Subsection>
        </div>
      </Chapter>

      <Chapter number={3} title={copy.deepChapterSituations}>
        <StatementList
          statements={report.situations}
          evidence={report.evidence}
          language={language}
        />
      </Chapter>

      <Chapter number={4} title={copy.deepChapterCapabilities}>
        <Subsection title={copy.deepCapabilities}>
          <div className="expert-capabilities">
            {report.capabilities.map((group, index) => (
              <article key={`${group.title.text}-${String(index)}`}>
                <ExpertStatement
                  statement={group.title}
                  evidence={report.evidence}
                  language={language}
                  emphasis
                />
                <StatementList
                  statements={group.items}
                  evidence={report.evidence}
                  language={language}
                />
              </article>
            ))}
          </div>
        </Subsection>
        <Subsection title={copy.deepWorkflow}>
          <StatementList
            statements={report.workflow}
            evidence={report.evidence}
            language={language}
            ordered
          />
        </Subsection>
      </Chapter>

      <Chapter number={5} title={copy.deepChapterArchitecture}>
        <Subsection title={copy.deepArchitectureSummary}>
          <StatementList
            statements={report.architecture.summary}
            evidence={report.evidence}
            language={language}
          />
        </Subsection>
        <div className="expert-columns">
          <Subsection title={copy.deepArchitectureTechnologies}>
            <StatementList
              statements={report.architecture.technologies}
              evidence={report.evidence}
              language={language}
            />
          </Subsection>
          <Subsection title={copy.deepArchitectureConcepts}>
            <StatementList
              statements={report.architecture.concepts}
              evidence={report.evidence}
              language={language}
            />
          </Subsection>
        </div>
      </Chapter>

      <Chapter number={6} title={copy.deepChapterOnboarding}>
        <div className="expert-onboarding-grid">
          {(
            [
              ["deepPrerequisites", report.onboarding.prerequisites],
              ["deepInstall", report.onboarding.install],
              ["deepRun", report.onboarding.run],
              ["deepDevelop", report.onboarding.develop],
              ["deepCautions", report.onboarding.cautions],
            ] as const
          ).map(([key, statements]) => (
            <Subsection key={key} title={copy[key]}>
              <StatementList
                statements={statements}
                evidence={report.evidence}
                language={language}
              />
            </Subsection>
          ))}
        </div>
      </Chapter>

      <Chapter number={7} title={copy.deepChapterTrust}>
        <div className="expert-trust-grid">
          {(
            [
              ["deepReliability", report.trust.reliability],
              ["deepSecurity", report.trust.security],
              ["deepPrivacy", report.trust.privacy],
              ["deepUnknowns", report.trust.unknowns],
            ] as const
          ).map(([key, statements]) => (
            <Subsection key={key} title={copy[key]}>
              <StatementList
                statements={statements}
                evidence={report.evidence}
                language={language}
              />
            </Subsection>
          ))}
        </div>
      </Chapter>

      <Chapter number={8} title={copy.deepChapterMaintenance}>
        <dl className="expert-community">
          {communityFacts(report.maintenance.community, language).map(
            (fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ),
          )}
        </dl>
        <p className="expert-popularity-note">{copy.deepPopularityCaveat}</p>
        <StatementList
          statements={report.maintenance.summary}
          evidence={report.evidence}
          language={language}
        />
        <Subsection title={copy.deepMaintenanceSignals}>
          <StatementList
            statements={report.maintenance.signals}
            evidence={report.evidence}
            language={language}
          />
        </Subsection>
      </Chapter>

      <Chapter number={9} title={copy.deepChapterAlternatives}>
        {report.alternatives.length === 0 ? (
          <p className="expert-alternatives__empty">
            {copy.deepAlternativesUnavailable}
          </p>
        ) : (
          <div className="expert-alternatives">
            <table>
              <thead>
                <tr>
                  <th scope="col">{copy.deepAlternativeRepository}</th>
                  <th scope="col">{copy.deepAlternativeWhy}</th>
                  <th scope="col">{copy.deepAlternativeActivity}</th>
                </tr>
              </thead>
              <tbody>
                {report.alternatives.map((alternative) => (
                  <tr
                    key={`${alternative.repository.owner}/${alternative.repository.repo}`}
                  >
                    <th scope="row" data-label={copy.deepAlternativeRepository}>
                      <a
                        href={repositoryUrl(alternative.repository)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {alternative.repository.owner}/
                        {alternative.repository.repo}
                      </a>
                    </th>
                    <td data-label={copy.deepAlternativeWhy}>
                      <ExpertStatement
                        statement={alternative.whyCompare}
                        evidence={report.evidence}
                        language={language}
                      />
                    </td>
                    <td data-label={copy.deepAlternativeActivity}>
                      <dl className="expert-alternative-facts">
                        {communityFacts(alternative.github, language).map(
                          (fact) => (
                            <div key={fact.label}>
                              <dt>{fact.label}</dt>
                              <dd>{fact.value}</dd>
                            </div>
                          ),
                        )}
                      </dl>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Chapter>

      <Chapter number={10} title={copy.deepChapterVerdict}>
        <p className="expert-decision">
          {copy[DECISION_KEYS[report.finalVerdict.decision]]}
        </p>
        <ExpertStatement
          statement={report.finalVerdict.summary}
          evidence={report.evidence}
          language={language}
          emphasis
        />
        <div className="expert-columns">
          <Subsection title={copy.deepDisagreements}>
            <StatementList
              statements={report.disagreements}
              evidence={report.evidence}
              language={language}
            />
          </Subsection>
          <Subsection title={copy.deepNextChecks}>
            <StatementList
              statements={report.nextChecks}
              evidence={report.evidence}
              language={language}
              ordered
            />
          </Subsection>
        </div>
      </Chapter>

      <details className="expert-evidence-drawer">
        <summary>{copy.deepEvidenceDrawer}</summary>
        <ol>
          {report.evidence.map((item) => (
            <li key={item.id}>
              <span className="expert-evidence-drawer__id">{item.id}</span>
              <span>{item.label}</span>
              {item.url === null ? (
                <span>{copy.deepEvidenceUnavailable}</span>
              ) : (
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {copy.deepEvidenceOpen}
                </a>
              )}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
