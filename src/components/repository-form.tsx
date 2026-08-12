import { useId, useRef, useState, type SyntheticEvent } from "react";

import type { Language, RepoRef } from "../features/analysis/model";
import {
  parseRepositoryUrl,
  RepoUrlError,
  toCanonicalRepositoryUrl,
} from "../features/repository/repo-url";
import { messages } from "../i18n/messages";

interface RepositoryFormProps {
  language: Language;
  disabled: boolean;
  initialValue: string;
  onAnalyze: (ref: RepoRef) => void;
}

const EXAMPLES = ["Thworry/issueready", "psf/requests"] as const;

export function RepositoryForm({
  language,
  disabled,
  initialValue,
  onAnalyze,
}: RepositoryFormProps) {
  const copy = messages[language];
  const inputId = useId();
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [invalid, setInvalid] = useState(false);

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (disabled) return;

    try {
      const ref = parseRepositoryUrl(value);
      setInvalid(false);
      setValue(toCanonicalRepositoryUrl(ref));
      onAnalyze(ref);
    } catch (error) {
      if (!(error instanceof RepoUrlError)) throw error;
      setInvalid(true);
      inputRef.current?.focus();
    }
  }

  function selectExample(slug: (typeof EXAMPLES)[number]): void {
    setValue(`https://github.com/${slug}`);
    setInvalid(false);
    inputRef.current?.focus();
  }

  return (
    <form className="repository-form" noValidate onSubmit={submit}>
      <div className="repository-form__field">
        <label htmlFor={inputId}>{copy.repositoryLabel}</label>
        <p id={helperId} className="repository-form__helper">
          {copy.repositoryHelper}
        </p>
        <div className="repository-form__action-row">
          <input
            ref={inputRef}
            id={inputId}
            type="url"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            value={value}
            disabled={disabled}
            aria-invalid={invalid}
            aria-describedby={`${helperId}${invalid ? ` ${errorId}` : ""}`}
            placeholder="https://github.com/owner/repository"
            onChange={(event) => {
              setValue(event.currentTarget.value);
              if (invalid) setInvalid(false);
            }}
          />
          <button className="primary-action" type="submit" disabled={disabled}>
            {disabled ? copy.analysisRunning : copy.analyzeRepository}
          </button>
        </div>
        {invalid ? (
          <p id={errorId} className="repository-form__error" role="alert">
            {copy.repositoryError}
          </p>
        ) : null}
      </div>
      <div
        className="repository-form__examples"
        aria-label={copy.examplesLabel}
      >
        <span>{copy.examplesLabel}</span>
        {EXAMPLES.map((slug) => (
          <button
            key={slug}
            type="button"
            disabled={disabled}
            onClick={() => {
              selectExample(slug);
            }}
          >
            {slug}
          </button>
        ))}
      </div>
    </form>
  );
}
