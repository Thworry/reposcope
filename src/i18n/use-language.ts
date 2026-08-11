import { useCallback, useEffect, useState } from "react";

import type { Language } from "../features/analysis/model";

const LANGUAGE_STORAGE_KEY = "reposcope:language";

function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "zh-CN";
}

export function getInitialLanguage(
  navigatorLanguages: readonly string[],
  stored: string | null,
): Language {
  if (isLanguage(stored)) {
    return stored;
  }

  return navigatorLanguages[0]?.toLowerCase().startsWith("zh") === true
    ? "zh-CN"
    : "en";
}

function readStoredLanguage(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function browserLanguages(): readonly string[] {
  if (navigator.languages.length > 0) {
    return navigator.languages;
  }

  return navigator.language ? [navigator.language] : [];
}

export function useLanguage() {
  const [language, setLanguage] = useState<Language>(() =>
    getInitialLanguage(browserLanguages(), readStoredLanguage()),
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const selectLanguage = useCallback((nextLanguage: Language) => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // Language selection remains usable when browser storage is unavailable.
    }

    setLanguage(nextLanguage);
  }, []);

  return { language, selectLanguage } as const;
}
