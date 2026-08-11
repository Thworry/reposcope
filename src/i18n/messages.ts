import type { Language } from "../features/analysis/model";

const en = {
  brand: "RepoScope 项目透视",
  tagline: "See a public project's quality, complexity, and room to improve.",
  english: "English",
  simplifiedChinese: "Simplified Chinese",
  privacy: "Read-only. No login or token. Analysis runs in your browser.",
  main: "RepoScope project analysis",
} as const;

export type AppMessageKey = keyof typeof en;

export const messages: Record<Language, Record<AppMessageKey, string>> = {
  en,
  "zh-CN": {
    brand: "RepoScope 项目透视",
    tagline: "看懂一个公开项目的质量、复杂度与改进空间。",
    english: "英文",
    simplifiedChinese: "简体中文",
    privacy: "只读、无需登录或令牌；分析在你的浏览器中运行。",
    main: "RepoScope 项目分析",
  },
};
