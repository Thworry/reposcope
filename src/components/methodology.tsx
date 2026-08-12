import type { Language } from "../features/analysis/model";
import { DIMENSION_WEIGHTS } from "../features/rules/rules";
import { messages } from "../i18n/messages";

interface MethodologyProps {
  rulesetVersion: "1.0.0";
  language: Language;
}

const METHODOLOGY_URL =
  "https://github.com/Thworry/reposcope/blob/v0.1.0/docs/methodology.md";

export function Methodology({ rulesetVersion, language }: MethodologyProps) {
  const copy = messages[language];
  const weights = [
    [copy.dimensionDocumentation, DIMENSION_WEIGHTS.documentation],
    [copy.dimensionOperability, DIMENSION_WEIGHTS.operability],
    [copy.dimensionReadability, DIMENSION_WEIGHTS.readability],
    [copy.dimensionComplexity, DIMENSION_WEIGHTS.complexity],
    [copy.dimensionTesting, DIMENSION_WEIGHTS.testing],
    [copy.dimensionMaintenance, DIMENSION_WEIGHTS.maintenance],
  ] as const;

  return (
    <section
      id="methodology"
      className="report-section report-methodology"
      data-report-section="methodology"
      aria-labelledby="report-methodology-heading"
    >
      <p className="section-index">
        {copy.methodologyReportIndex} · {rulesetVersion}
      </p>
      <h3 id="report-methodology-heading">{copy.methodologyRegion}</h3>
      <details open>
        <summary>{copy.methodologyDisclosure}</summary>
        <div className="report-methodology__content">
          <p>{copy.methodologyIntro}</p>
          <h4>{copy.methodologyWeights}</h4>
          <ul className="report-methodology__weights">
            {weights.map(([name, value]) => (
              <li key={name}>
                {name}: {value}
              </li>
            ))}
          </ul>
          <p>{copy.methodologyOverallThresholds}</p>
          <p>{copy.methodologyConfidenceThresholds}</p>
          <p>{copy.methodologyApplicability}</p>
          <ul>
            <li>{copy.methodologyScope}</li>
            <li>{copy.methodologySampling}</li>
            <li>{copy.methodologyExclusions}</li>
            <li>{copy.methodologyBoundary}</li>
            <li>{copy.methodologyLimitations}</li>
          </ul>
          <a href={METHODOLOGY_URL} target="_blank" rel="noopener noreferrer">
            {copy.methodologyCompleteLink}
          </a>
        </div>
      </details>
    </section>
  );
}
