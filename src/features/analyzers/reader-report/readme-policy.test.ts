import { describe, expect, it } from "vitest";

import {
  compareReadmePaths,
  isCanonicalReadmePath,
  normalizeReadmeHeading,
  readmeCommandKind,
  readmeLegacySection,
  readmeProfileSection,
} from "./readme-policy";

describe("canonical README paths", () => {
  it.each([
    ["README.md", true],
    ["README", true],
    ["README-guide.md", true],
    ["README_a.md", true],
    ["README.zh-CN.md", true],
    [".github/README.md", true],
    ["README.exe", false],
    ["docs/README.md", false],
    ["READMEevil.md", false],
  ])("classifies %s consistently", (path, expected) => {
    expect(isCanonicalReadmePath(path)).toBe(expected);
  });

  it("orders the exact root README first under every input permutation", () => {
    const paths = [
      ".github/README.md",
      "README_a.md",
      "README-guide.md",
      "README.md",
    ];

    for (const permutation of [
      paths,
      [...paths].reverse(),
      ["README-guide.md", ".github/README.md", "README.md", "README_a.md"],
    ]) {
      expect([...permutation].sort(compareReadmePaths)).toEqual([
        "README.md",
        "README-guide.md",
        "README_a.md",
        ".github/README.md",
      ]);
    }
  });
});

describe("README heading lookup", () => {
  it.each([
    ["✨ 项目简介", "项目简介", "overview"],
    ["1. Key Features:", "key features", "capabilities"],
    ["### **Key Features** ###", "key features", "capabilities"],
    [
      "３、Ｔｙｐｉｃａｌ　Ｕｓａｇｅ　Ｐａｔｈ！",
      "typical usage path",
      "workflow",
    ],
    ["Project Introduction", "project introduction", "overview"],
    ["现在已经能做什么", "现在已经能做什么", "capabilities"],
    ["典型使用路径", "典型使用路径", "workflow"],
    ["2. 配置环境变量", "配置环境变量", "dependencies"],
    ["Environment Variables", "environment variables", "dependencies"],
    ["Environment Configuration", "environment configuration", "dependencies"],
    ["当前路线图", "当前路线图", "maturity"],
    ["Latest Updates", "latest updates", "maturity"],
    ["最新更新", "最新更新", "maturity"],
    ["Important Notes", "important notes", "limitations"],
    ["说明", "说明", "limitations"],
    ["License", "license", "limitations"],
  ] as const)(
    "normalizes %s for exact profile lookup",
    (heading, normalized, section) => {
      expect(normalizeReadmeHeading(heading)).toBe(normalized);
      expect(readmeProfileSection(heading)).toBe(section);
    },
  );

  it.each([
    ["技术栈与架构", "architecture"],
    ["2) Tech Stack and Architecture", "architecture"],
    ["安全与隐私", "securityPrivacy"],
  ] as const)("classifies the legacy heading %s", (heading, section) => {
    expect(readmeLegacySection(heading)).toBe(section);
  });

  it.each([
    ["1. 安装依赖", "install"],
    ["2、Start Development", "run"],
    ["启动开发环境", "run"],
  ] as const)("classifies the explicit command heading %s", (heading, kind) => {
    expect(readmeCommandKind(heading)).toBe(kind);
  });

  it.each([
    "security research notes",
    "architecture decision notes",
    "features we may remove",
    "workflow benchmark",
  ])("does not use substring classification for %s", (heading) => {
    expect(readmeProfileSection(heading)).toBeNull();
    expect(readmeLegacySection(heading)).toBeNull();
    expect(readmeCommandKind(heading)).toBeNull();
  });

  it("fails closed before stripping unsafe heading controls", () => {
    expect(normalizeReadmeHeading("\u202e✨ Features")).toBe("");
    expect(readmeProfileSection("\u202e✨ Features")).toBeNull();
  });
});
