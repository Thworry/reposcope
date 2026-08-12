import { useEffect, useState } from "react";

import type { Language } from "../features/analysis/model";
import type { SerializableAnalysisError } from "../features/worker/protocol";
import type { AppMessageKey } from "../i18n/messages";
import { formatMessage, messages } from "../i18n/messages";

interface ErrorPanelProps {
  error: SerializableAnalysisError;
  language: Language;
  onRetry?: () => void;
}

const RATE_LIMIT_DOCS =
  "https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api";

const ERROR_KEYS: Record<SerializableAnalysisError["kind"], AppMessageKey> = {
  "invalid-url": "errorInvalidUrl",
  "not-found": "errorNotFound",
  "rate-limit": "errorRateLimit",
  empty: "errorEmpty",
  network: "errorNetwork",
  api: "errorApi",
  "invalid-response": "errorInvalidResponse",
  worker: "errorWorker",
};

function parseResetTime(value: string | undefined): number | null {
  if (value === undefined) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function localResetTime(timestamp: number, language: Language): string {
  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(timestamp);
}

function isOrdinarilyRecoverable(
  kind: SerializableAnalysisError["kind"],
): boolean {
  return (
    kind === "network" ||
    kind === "api" ||
    kind === "invalid-response" ||
    kind === "worker"
  );
}

export function ErrorPanel({ error, language, onRetry }: ErrorPanelProps) {
  const copy = messages[language];
  const resetTime =
    error.kind === "rate-limit" ? parseResetTime(error.resetAt) : null;
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (resetTime === null || resetTime <= Date.now()) return;
    const timer = window.setTimeout(
      () => {
        setClock(Date.now());
      },
      Math.min(resetTime - Date.now() + 25, 2_147_000_000),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [resetTime, clock]);

  const canRetry =
    onRetry !== undefined &&
    (isOrdinarilyRecoverable(error.kind) ||
      (error.kind === "rate-limit" &&
        resetTime !== null &&
        clock >= resetTime));

  return (
    <section
      className="error-panel"
      role="alert"
      aria-labelledby="error-heading"
    >
      <p className="section-index">{copy.errorIndex}</p>
      <h2 id="error-heading">{copy.errorHeading}</h2>
      <p>{copy[ERROR_KEYS[error.kind]]}</p>
      {error.kind === "rate-limit" ? (
        <>
          <p>
            {resetTime === null
              ? copy.errorRateResetUnknown
              : formatMessage(language, "errorRateReset", {
                  timestamp: localResetTime(resetTime, language),
                })}
          </p>
          <a href={RATE_LIMIT_DOCS} target="_blank" rel="noopener noreferrer">
            {copy.rateLimitDocumentation}
          </a>
        </>
      ) : null}
      {canRetry ? (
        <button className="secondary-action" type="button" onClick={onRetry}>
          {copy.retryAnalysis}
        </button>
      ) : null}
    </section>
  );
}
