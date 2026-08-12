import type {
  DimensionKey,
  Improvement,
  Language,
  Strength,
} from "../features/analysis/model";
import {
  formatLocalizedDescriptor,
  formatMessage,
  messages,
} from "../i18n/messages";

interface StrengthsAndRisksProps {
  strengths: readonly Strength[];
  weaknesses: readonly Improvement[];
  language: Language;
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
const PRIORITY_KEYS = {
  high: "priorityHigh",
  medium: "priorityMedium",
  low: "priorityLow",
} as const;

function cappedStrengths(strengths: readonly Strength[]): Strength[] {
  const dimensionCounts = new Map<DimensionKey, number>();
  const result: Strength[] = [];

  for (const strength of strengths) {
    const count = dimensionCounts.get(strength.dimension) ?? 0;
    if (count >= 2) continue;
    result.push(strength);
    dimensionCounts.set(strength.dimension, count + 1);
    if (result.length === 5) break;
  }
  return result;
}

function orderedImprovements(
  weaknesses: readonly Improvement[],
): Improvement[] {
  return [...weaknesses]
    .sort(
      (left, right) =>
        PRIORITY_ORDER[left.severity] - PRIORITY_ORDER[right.severity] ||
        right.lostPoints - left.lostPoints ||
        left.ruleId.localeCompare(right.ruleId, "en-US"),
    )
    .slice(0, 39);
}

export function StrengthsAndRisks({
  strengths,
  weaknesses,
  language,
}: StrengthsAndRisksProps) {
  const copy = messages[language];
  const visibleStrengths = cappedStrengths(strengths);
  const visibleImprovements = orderedImprovements(weaknesses);

  return (
    <>
      <section
        className="report-section findings-section"
        data-report-section="strengths"
        aria-labelledby="strengths-heading"
      >
        <p className="section-index">{copy.strengthsIndex}</p>
        <h3 id="strengths-heading">{copy.strengthsHeading}</h3>
        {visibleStrengths.length === 0 ? (
          <p className="report-empty">{copy.noStrengths}</p>
        ) : (
          <ol className="finding-list finding-list--strengths">
            {visibleStrengths.map((strength) => (
              <li
                key={`${strength.dimension}:${strength.ruleId}`}
                aria-label={formatMessage(language, "strengthItem", {
                  ruleId: strength.ruleId,
                })}
              >
                <code>{strength.ruleId}</code>
                <p>{formatLocalizedDescriptor(language, strength.evidence)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section
        className="report-section findings-section"
        data-report-section="improvements"
        aria-labelledby="improvements-heading"
      >
        <p className="section-index">{copy.improvementsIndex}</p>
        <h3 id="improvements-heading">{copy.improvementsHeading}</h3>
        {visibleImprovements.length === 0 ? (
          <p className="report-empty">{copy.noImprovements}</p>
        ) : (
          <ol className="finding-list finding-list--improvements">
            {visibleImprovements.map((improvement) => (
              <li
                key={`${improvement.dimension}:${improvement.ruleId}`}
                data-severity={improvement.severity}
                aria-label={formatMessage(language, "improvementItem", {
                  ruleId: improvement.ruleId,
                })}
              >
                <div className="finding-list__title">
                  <code>{improvement.ruleId}</code>
                  <span>{copy[PRIORITY_KEYS[improvement.severity]]}</span>
                  <span>
                    {formatMessage(language, "lostPoints", {
                      points: improvement.lostPoints,
                    })}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>{copy.evidenceLabel}</dt>
                    <dd>
                      {formatLocalizedDescriptor(
                        language,
                        improvement.evidence,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{copy.suggestedAction}</dt>
                    <dd>
                      {formatLocalizedDescriptor(
                        language,
                        improvement.recommendation,
                      )}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
