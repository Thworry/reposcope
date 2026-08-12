import type { Language } from "../features/analysis/model";
import { messages } from "../i18n/messages";

interface LanguageSwitcherProps {
  language: Language;
  onChange: (language: Language) => void;
}

export function LanguageSwitcher({
  language,
  onChange,
}: LanguageSwitcherProps) {
  const copy = messages[language];

  return (
    <nav className="language-switcher" aria-label={copy.languageSwitcher}>
      <button
        type="button"
        aria-pressed={language === "en"}
        onClick={() => {
          onChange("en");
        }}
      >
        {copy.english}
      </button>
      <button
        type="button"
        aria-pressed={language === "zh-CN"}
        onClick={() => {
          onChange("zh-CN");
        }}
      >
        {copy.simplifiedChinese}
      </button>
    </nav>
  );
}
