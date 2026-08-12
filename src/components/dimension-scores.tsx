import type {
  DimensionKey,
  DimensionResult,
  Language,
} from "../features/analysis/model";
import type { AppMessageKey } from "../i18n/messages";
import { formatMessage, messages } from "../i18n/messages";

interface DimensionScoresProps {
  dimensions: readonly DimensionResult[];
  language: Language;
}

const DIMENSIONS: readonly DimensionKey[] = [
  "documentation",
  "operability",
  "readability",
  "complexity",
  "testing",
  "maintenance",
];

const NAME_KEYS: Record<DimensionKey, AppMessageKey> = {
  documentation: "dimensionDocumentation",
  operability: "dimensionOperability",
  readability: "dimensionReadability",
  complexity: "dimensionComplexity",
  testing: "dimensionTesting",
  maintenance: "dimensionMaintenance",
};

const DESCRIPTION_KEYS: Record<DimensionKey, AppMessageKey> = {
  documentation: "dimensionDocumentationDescription",
  operability: "dimensionOperabilityDescription",
  readability: "dimensionReadabilityDescription",
  complexity: "dimensionComplexityDescription",
  testing: "dimensionTestingDescription",
  maintenance: "dimensionMaintenanceDescription",
};

export function DimensionScores({
  dimensions,
  language,
}: DimensionScoresProps) {
  const copy = messages[language];
  const byKey = new Map(
    dimensions.map((dimension) => [dimension.key, dimension]),
  );

  return (
    <section
      className="report-section dimension-scores"
      data-report-section="dimensions"
      aria-labelledby="dimension-scores-heading"
    >
      <p className="section-index">{copy.dimensionIndex}</p>
      <h3 id="dimension-scores-heading">{copy.dimensionsHeading}</h3>
      <ol className="dimension-scores__list">
        {DIMENSIONS.map((key) => {
          const dimension = byKey.get(key);
          const name = copy[NAME_KEYS[key]];
          const score = dimension?.score ?? null;

          return (
            <li key={key} className="dimension-score">
              <div className="dimension-score__header">
                <h4>{name}</h4>
                <strong>
                  {score === null
                    ? copy.unavailable
                    : formatMessage(language, "scoreOutOf", { score })}
                </strong>
              </div>
              <p>{copy[DESCRIPTION_KEYS[key]]}</p>
              {score === null ? null : (
                <progress
                  value={score}
                  max={100}
                  aria-label={formatMessage(language, "scoreAccessible", {
                    dimension: name,
                    score,
                  })}
                >
                  {score}%
                </progress>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
