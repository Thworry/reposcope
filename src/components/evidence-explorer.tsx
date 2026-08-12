import { useMemo, useState } from "react";

import type {
  AnalysisReport,
  DimensionKey,
  FileReference,
  FindingSeverity,
  Language,
  RuleResult,
  RuleState,
} from "../features/analysis/model";
import type { AppMessageKey } from "../i18n/messages";
import {
  formatLocalizedDescriptor,
  formatMessage,
  messages,
} from "../i18n/messages";

interface EvidenceExplorerProps {
  report: AnalysisReport;
  language: Language;
}

type DimensionFilter = DimensionKey | "all";
type SeverityFilter = FindingSeverity | "all";
type StateFilter = RuleState | "all";

const DIMENSIONS: readonly DimensionKey[] = [
  "documentation",
  "operability",
  "readability",
  "complexity",
  "testing",
  "maintenance",
];

const DIMENSION_KEYS: Record<DimensionKey, AppMessageKey> = {
  documentation: "dimensionDocumentation",
  operability: "dimensionOperability",
  readability: "dimensionReadability",
  complexity: "dimensionComplexity",
  testing: "dimensionTesting",
  maintenance: "dimensionMaintenance",
};

const STATE_KEYS: Record<RuleState, AppMessageKey> = {
  passed: "statePassed",
  partial: "statePartial",
  failed: "stateFailed",
  "not-applicable": "stateNotApplicable",
};

const SEVERITY_KEYS: Record<FindingSeverity, AppMessageKey> = {
  high: "priorityHigh",
  medium: "priorityMedium",
  low: "priorityLow",
};

function encodedPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function immutableFileHref(
  report: AnalysisReport,
  reference: FileReference,
): string {
  const base = `https://github.com/${encodeURIComponent(report.repository.owner)}/${encodeURIComponent(report.repository.repo)}/blob/${encodeURIComponent(report.repository.commitSha)}/${encodedPath(reference.path)}`;

  if (reference.startLine === undefined) return base;
  if (
    reference.endLine !== undefined &&
    reference.endLine > reference.startLine
  ) {
    return `${base}#L${String(reference.startLine)}-L${String(reference.endLine)}`;
  }
  return `${base}#L${String(reference.startLine)}`;
}

function referenceLabel(language: Language, reference: FileReference): string {
  if (reference.startLine === undefined) return reference.path;
  if (
    reference.endLine !== undefined &&
    reference.endLine > reference.startLine
  ) {
    return formatMessage(language, "fileLineRange", {
      path: reference.path,
      start: reference.startLine,
      end: reference.endLine,
    });
  }
  return formatMessage(language, "fileLine", {
    path: reference.path,
    start: reference.startLine,
  });
}

function canonicalRules(report: AnalysisReport): RuleResult[] {
  const byDimension = new Map(
    report.dimensions.map((dimension) => [dimension.key, dimension.rules]),
  );

  return DIMENSIONS.flatMap((dimension) => byDimension.get(dimension) ?? []);
}

export function EvidenceExplorer({ report, language }: EvidenceExplorerProps) {
  const copy = messages[language];
  const [dimension, setDimension] = useState<DimensionFilter>("all");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [state, setState] = useState<StateFilter>("all");
  const severityByRule = useMemo(
    () =>
      new Map(
        report.weaknesses.map(
          (weakness) => [weakness.ruleId, weakness.severity] as const,
        ),
      ),
    [report.weaknesses],
  );
  const rules = useMemo(() => canonicalRules(report), [report]);
  const visibleRules = rules.filter((rule) => {
    const ruleSeverity = severityByRule.get(rule.id);
    return (
      (dimension === "all" || rule.dimension === dimension) &&
      (severity === "all" || ruleSeverity === severity) &&
      (state === "all" || rule.state === state)
    );
  });

  return (
    <section
      className="report-section evidence-explorer"
      data-report-section="evidence"
      aria-labelledby="evidence-explorer-heading"
    >
      <p className="section-index">{copy.evidenceIndex}</p>
      <h3 id="evidence-explorer-heading">{copy.evidenceExplorerHeading}</h3>
      <details open>
        <summary>{copy.evidenceDisclosure}</summary>
        <div className="evidence-explorer__filters">
          <label>
            <span>{copy.dimensionFilter}</span>
            <select
              value={dimension}
              onChange={(event) => {
                setDimension(event.currentTarget.value as DimensionFilter);
              }}
            >
              <option value="all">{copy.filterAll}</option>
              {DIMENSIONS.map((key) => (
                <option value={key} key={key}>
                  {copy[DIMENSION_KEYS[key]]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{copy.severityFilter}</span>
            <select
              value={severity}
              onChange={(event) => {
                setSeverity(event.currentTarget.value as SeverityFilter);
              }}
            >
              <option value="all">{copy.filterAll}</option>
              {(["high", "medium", "low"] as const).map((key) => (
                <option value={key} key={key}>
                  {copy[SEVERITY_KEYS[key]]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{copy.stateFilter}</span>
            <select
              value={state}
              onChange={(event) => {
                setState(event.currentTarget.value as StateFilter);
              }}
            >
              <option value="all">{copy.filterAll}</option>
              {(["passed", "partial", "failed", "not-applicable"] as const).map(
                (key) => (
                  <option value={key} key={key}>
                    {copy[STATE_KEYS[key]]}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>

        <p className="evidence-explorer__count" aria-live="polite">
          {formatMessage(
            language,
            visibleRules.length === 1 ? "rulesShownOne" : "rulesShownMany",
            { count: visibleRules.length },
          )}
        </p>

        {visibleRules.length === 0 ? (
          <p className="report-empty">{copy.noEvidenceMatches}</p>
        ) : (
          <ol className="evidence-list">
            {visibleRules.map((rule) => {
              const ruleSeverity = severityByRule.get(rule.id);
              return (
                <li
                  key={`${rule.dimension}:${rule.id}`}
                  data-state={rule.state}
                >
                  <div className="evidence-list__heading">
                    <code>{rule.id}</code>
                    <span>{copy[STATE_KEYS[rule.state]]}</span>
                    <span>
                      {ruleSeverity === undefined
                        ? copy.severityNotPrioritized
                        : copy[SEVERITY_KEYS[ruleSeverity]]}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>{copy.evidenceLabel}</dt>
                      <dd>
                        {formatLocalizedDescriptor(language, rule.evidence)}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.suggestedAction}</dt>
                      <dd>
                        {rule.state === "failed" || rule.state === "partial"
                          ? formatLocalizedDescriptor(
                              language,
                              rule.recommendation,
                            )
                          : copy.noActionForRule}
                      </dd>
                    </div>
                  </dl>
                  {rule.references.length === 0 ? null : (
                    <div className="evidence-list__references">
                      <strong>{copy.referencesLabel}</strong>
                      {rule.references.slice(0, 20).map((reference) => (
                        <a
                          key={`${reference.path}:${String(reference.startLine ?? "")}:${String(reference.endLine ?? "")}`}
                          href={immutableFileHref(report, reference)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {referenceLabel(language, reference)}
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </details>
    </section>
  );
}
