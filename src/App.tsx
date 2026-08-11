import { messages } from "./i18n/messages";
import { useLanguage } from "./i18n/use-language";

export function App() {
  const { language, selectLanguage } = useLanguage();
  const copy = messages[language];

  return (
    <main aria-label={copy.main}>
      <header>
        <nav aria-label={copy.main}>
          <button
            type="button"
            aria-pressed={language === "en"}
            onClick={() => {
              selectLanguage("en");
            }}
          >
            {copy.english}
          </button>
          <button
            type="button"
            aria-pressed={language === "zh-CN"}
            onClick={() => {
              selectLanguage("zh-CN");
            }}
          >
            {copy.simplifiedChinese}
          </button>
        </nav>
        <h1>{copy.brand}</h1>
        <p>{copy.tagline}</p>
      </header>
      <p>{copy.privacy}</p>
    </main>
  );
}
