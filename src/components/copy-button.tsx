import { useCallback, useEffect, useRef, useState } from "react";

import type { Language } from "../features/analysis/model";
import { messages } from "../i18n/messages";

interface CopyButtonProps {
  text: string;
  language: Language;
}

type CopyStatus = "idle" | "working" | "success" | "failure";

export function CopyButton({ text, language }: CopyButtonProps) {
  const copy = messages[language];
  const [status, setStatus] = useState<CopyStatus>("idle");
  const requestIdRef = useRef(0);
  const resetTimerRef = useRef<number | null>(null);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      clearResetTimer();
    },
    [clearResetTimer],
  );

  async function copyText(): Promise<void> {
    const requestId = ++requestIdRef.current;
    clearResetTimer();
    setStatus("working");

    try {
      await navigator.clipboard.writeText(text);
      if (requestId !== requestIdRef.current) return;
      clearResetTimer();
      setStatus("success");
      resetTimerRef.current = window.setTimeout(() => {
        if (requestId === requestIdRef.current) setStatus("idle");
        resetTimerRef.current = null;
      }, 2_000);
    } catch {
      if (requestId !== requestIdRef.current) return;
      clearResetTimer();
      setStatus("failure");
      resetTimerRef.current = window.setTimeout(() => {
        if (requestId === requestIdRef.current) setStatus("idle");
        resetTimerRef.current = null;
      }, 2_000);
    }
  }

  const statusText =
    status === "working"
      ? copy.copyWorking
      : status === "success"
        ? copy.copySuccess
        : status === "failure"
          ? copy.copyFailure
          : "";

  return (
    <div className="copy-control">
      <button
        className="secondary-action"
        type="button"
        onClick={() => {
          void copyText();
        }}
      >
        {copy.copyChecklist}
      </button>
      <span
        className="copy-control__status"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusText}
      </span>
    </div>
  );
}
