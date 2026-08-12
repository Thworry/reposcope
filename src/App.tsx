import { useEffect, useRef, useState } from "react";

import { LanguageSwitcher } from "./components/language-switcher";
import { ErrorPanel } from "./components/error-panel";
import { ReportView } from "./components/report-view";
import { RepositoryForm } from "./components/repository-form";
import { ScanProgress } from "./components/scan-progress";
import { StatusAnnouncer } from "./components/status-announcer";
import { useRepositoryAnalysis } from "./features/analysis/use-repository-analysis";
import type { RepoRef, ScanPhase } from "./features/analysis/model";
import {
  parseShareSearch,
  toCanonicalRepositoryUrl,
  toShareSearch,
} from "./features/repository/repo-url";
import { formatMessage, messages, type AppMessageKey } from "./i18n/messages";
import { useLanguage } from "./i18n/use-language";
import "./styles/app.css";

const PHASE_MESSAGE_KEYS: Record<ScanPhase, AppMessageKey> = {
  validating: "phase.validating",
  repository: "phase.repository",
  selecting: "phase.selecting",
  fetching: "phase.fetching",
  analyzing: "phase.analyzing",
};

function sameRepository(
  left: RepoRef,
  right: { owner: string; repo: string },
): boolean {
  return (
    left.owner.toLocaleLowerCase("en-US") ===
      right.owner.toLocaleLowerCase("en-US") &&
    left.repo.toLocaleLowerCase("en-US") ===
      right.repo.toLocaleLowerCase("en-US")
  );
}

function formatStaleTimestamp(value: string, language: "en" | "zh-CN"): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return value;

  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(timestamp);
}

export function App() {
  const { language, selectLanguage } = useLanguage();
  const analysis = useRepositoryAnalysis();
  const copy = messages[language];
  const [sharedRef] = useState(() => parseShareSearch(window.location.search));
  const [initialValue] = useState(() =>
    sharedRef === null ? "" : toCanonicalRepositoryUrl(sharedRef),
  );
  const sharedStarted = useRef(false);
  const pendingManual = useRef<RepoRef | null>(null);

  useEffect(() => {
    if (sharedRef === null) return;
    let active = true;

    queueMicrotask(() => {
      if (!active || sharedStarted.current) return;
      sharedStarted.current = true;
      void analysis.analyze(sharedRef);
    });

    return () => {
      active = false;
    };
  }, [analysis, sharedRef]);

  useEffect(() => {
    const pending = pendingManual.current;
    if (pending === null) return;

    if (analysis.status === "error" || analysis.status === "idle") {
      pendingManual.current = null;
      return;
    }
    if (
      analysis.status !== "success" ||
      analysis.report === null ||
      !sameRepository(pending, analysis.report.repository)
    ) {
      return;
    }

    history.replaceState(
      null,
      "",
      toShareSearch({
        owner: analysis.report.repository.owner,
        repo: analysis.report.repository.repo,
      }),
    );
    pendingManual.current = null;
  }, [analysis.report, analysis.status]);

  function analyzeManual(ref: RepoRef): void {
    pendingManual.current = { owner: ref.owner, repo: ref.repo };
    void analysis.analyze(ref);
  }

  let announcement = "";
  if (analysis.status === "running") {
    announcement =
      analysis.progress === null
        ? copy.statusStarting
        : copy[PHASE_MESSAGE_KEYS[analysis.progress.phase]];
  } else if (analysis.status === "success" && analysis.report !== null) {
    announcement = copy.statusComplete;
  } else if (analysis.status === "error") {
    announcement = copy.statusError;
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {copy.skipToContent}
      </a>
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL}>
          {copy.brand}
        </a>
        <LanguageSwitcher language={language} onChange={selectLanguage} />
      </header>

      <main id="main-content" aria-label={copy.main}>
        <section className="landing" aria-labelledby="landing-title">
          <p className="section-index">01 / {copy.landingIndex}</p>
          <div className="landing__intro">
            <h1 id="landing-title">{copy.heroTitle}</h1>
            <p>{copy.tagline}</p>
          </div>

          <RepositoryForm
            language={language}
            disabled={analysis.status === "running"}
            initialValue={initialValue}
            onAnalyze={analyzeManual}
          />

          <aside className="privacy-note" aria-label={copy.privacy}>
            <span className="privacy-note__mark" aria-hidden="true">
              {copy.privacyMark}
            </span>
            <p>{copy.privacy}</p>
            <a href="#methodology">{copy.methodology}</a>
          </aside>

          {analysis.report === null ? (
            <section
              id="methodology"
              className="landing-methodology"
              aria-labelledby="methodology-heading"
            >
              <p className="section-index">
                03 / {copy.methodologyIndex} · 1.0.0
              </p>
              <h2 id="methodology-heading">{copy.methodologyHeading}</h2>
              <p className="landing-methodology__intro">
                {copy.methodologyIntro}
              </p>
              <ul>
                <li>{copy.methodologyScope}</li>
                <li>{copy.methodologySampling}</li>
                <li>{copy.methodologyExclusions}</li>
                <li>{copy.methodologyBoundary}</li>
                <li>{copy.methodologyLimitations}</li>
              </ul>
            </section>
          ) : null}
        </section>

        {analysis.status === "running" ? (
          <ScanProgress
            language={language}
            progress={analysis.progress}
            onCancel={() => {
              analysis.cancel();
            }}
          />
        ) : null}

        {analysis.error === null ? null : (
          <ErrorPanel
            error={analysis.error}
            language={language}
            onRetry={() => {
              void analysis.refresh();
            }}
          />
        )}

        {analysis.status === "error" && analysis.report !== null ? (
          <p className="stale-report" role="status">
            {formatMessage(language, "staleReport", {
              timestamp: formatStaleTimestamp(
                analysis.report.repository.analyzedAt,
                language,
              ),
            })}
          </p>
        ) : null}

        {analysis.report === null ? null : (
          <ReportView
            report={analysis.report}
            language={language}
            onRefresh={() => {
              void analysis.refresh();
            }}
          />
        )}
      </main>

      <StatusAnnouncer message={announcement} />
    </div>
  );
}
