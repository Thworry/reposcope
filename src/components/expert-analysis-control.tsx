import { useEffect, useRef, useState } from "react";

import type { Language } from "../features/analysis/model";
import type { DeepAnalysisErrorKind } from "../features/deep-analysis/model";
import type { UseDeepAnalysisResult } from "../features/deep-analysis/use-deep-analysis";
import { messages, type AppMessageKey } from "../i18n/messages";
import { ExpertProgress } from "./expert-progress";

interface ExpertAnalysisControlProps {
  language: Language;
  state: UseDeepAnalysisResult;
}

const ERROR_MESSAGES: Record<DeepAnalysisErrorKind, AppMessageKey> = {
  disabled: "deepErrorInternal",
  "signed-out": "deepErrorInternal",
  "copilot-unavailable": "deepErrorCopilot",
  "allowance-exhausted": "deepErrorAllowance",
  "rate-limit": "deepErrorRateLimit",
  "repository-changed": "deepErrorRepository",
  "github-unavailable": "deepErrorGitHub",
  "invalid-evidence": "deepErrorEvidence",
  cancelled: "deepErrorCancelled",
  internal: "deepErrorInternal",
};

export function ExpertAnalysisControl({
  language,
  state,
}: ExpertAnalysisControlProps) {
  const copy = messages[language];
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const generateRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const restoreDisclosureFocusRef = useRef(false);

  useEffect(() => {
    if (state.status === "running" || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    generateRef.current?.focus();
  }, [state.status]);

  useEffect(() => {
    if (disclosureOpen || !restoreDisclosureFocusRef.current) return;
    restoreDisclosureFocusRef.current = false;
    generateRef.current?.focus();
  }, [disclosureOpen]);

  if (state.availability === "disabled") return null;

  if (state.status === "running") {
    return (
      <ExpertProgress
        language={language}
        stage={state.stage}
        specialists={state.specialists}
        onCancel={() => {
          restoreFocusRef.current = true;
          state.cancel();
        }}
      />
    );
  }

  const errorMessage =
    state.error === null ? null : copy[ERROR_MESSAGES[state.error]];

  return (
    <section
      className="expert-control"
      aria-labelledby="expert-control-heading"
      data-availability={state.availability}
    >
      <p className="section-index">02 / {copy.deepExpertIndex}</p>
      <div className="expert-control__intro">
        <h3 id="expert-control-heading">{copy.deepExpertHeading}</h3>
        <p>{copy.deepExpertIntro}</p>
      </div>

      {state.availability === "checking" ? (
        <p className="expert-control__status" role="status">
          {copy.deepChecking}
        </p>
      ) : null}

      {state.availability === "unavailable" ? (
        <p className="expert-control__error" role="status">
          {copy.deepErrorInternal}
        </p>
      ) : null}

      {state.availability === "signed-out" && !disclosureOpen ? (
        <button
          ref={generateRef}
          className="primary-action"
          type="button"
          onClick={() => {
            if (state.automatic) state.authorize();
            else setDisclosureOpen(true);
          }}
        >
          {copy.deepGenerate}
        </button>
      ) : null}

      {state.availability === "signed-out" && disclosureOpen ? (
        <aside
          className="expert-disclosure"
          aria-labelledby="expert-disclosure-heading"
        >
          <h4 id="expert-disclosure-heading">{copy.deepDisclosureHeading}</h4>
          <ul>
            <li>{copy.deepDisclosureEvidence}</li>
            <li>{copy.deepDisclosureAllowance}</li>
            <li>{copy.deepDisclosureNoExecution}</li>
            <li>{copy.deepDisclosureFallback}</li>
          </ul>
          <div className="expert-control__actions">
            <button
              className="primary-action"
              type="button"
              onClick={() => {
                state.setAutomatic(true);
                state.authorize();
              }}
            >
              {copy.deepConsentConfirm}
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={() => {
                restoreDisclosureFocusRef.current = true;
                setDisclosureOpen(false);
              }}
            >
              {copy.deepConsentCancel}
            </button>
          </div>
        </aside>
      ) : null}

      {state.availability === "ready" ? (
        <div className="expert-control__ready">
          <p>{copy.deepReadyNote}</p>
          {errorMessage === null ? null : (
            <p className="expert-control__error" role="status">
              {errorMessage}
            </p>
          )}
          <div className="expert-control__actions">
            <button
              ref={generateRef}
              className="primary-action"
              type="button"
              onClick={() => void state.generate()}
            >
              {state.status === "error"
                ? copy.deepRetry
                : state.status === "success"
                  ? copy.deepRegenerate
                  : copy.deepGenerate}
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={() => void state.signOut()}
            >
              {copy.deepSignOut}
            </button>
          </div>
          <label className="expert-control__automatic">
            <input
              type="checkbox"
              checked={state.automatic}
              onChange={(event) => {
                state.setAutomatic(event.currentTarget.checked);
              }}
            />
            <span>
              <strong>{copy.deepAutomatic}</strong>
              <small>{copy.deepAutomaticHelp}</small>
            </span>
          </label>
        </div>
      ) : null}
    </section>
  );
}
