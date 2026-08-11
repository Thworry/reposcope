import type { FetchedTextFile } from "../../features/analysis/model";

export const englishReadme = `# RepoScope

## **ＩＮＳＴＡＬＬ**

Install the package from a terminal.

\`\`\`sh
$ pnpm install
\`\`\`

## Usage

\`\`\`ts
import { scan } from "reposcope";
scan("owner/repo");
\`\`\`

## Project Layout

The src, tests, and docs areas are described here.

## Environment **Variables**

Copy the example environment file before starting.
`;

export const chineseReadme = `# 项目透视

## 安装

\`\`\`sh
> python -m pip install reposcope
\`\`\`

## 使用

\`\`\`python
from reposcope import scan
scan("owner/repo")
\`\`\`

## 目录结构

这里说明 src、tests 和 docs 三个目录。

## 环境变量

复制示例配置文件。
`;

export const validPackageJson = JSON.stringify({
  version: "1.2.3",
  exports: { ".": "./src/index.ts" },
  scripts: {
    start: "node src/index.js",
    build: "tsc -b",
    test: "vitest run",
    lint: "eslint .",
    coverage: "vitest run --coverage",
  },
});

export const malformedPackageJson = '{"scripts":';

export const validPyprojectToml = `[project]
version = "2.4.0"

[project.scripts]
reposcope = "reposcope.cli:main"

[tool.pytest.ini_options]
addopts = "--cov=reposcope"

[tool.ruff]
line-length = 88

[tool.coverage.run]
branch = true
`;

export const malformedPyprojectToml = "[project\nversion = true";

export function fetchedTextFile(
  path: string,
  text: string,
  overrides: Partial<FetchedTextFile> = {},
): FetchedTextFile {
  const bytes = new TextEncoder().encode(text).byteLength;

  return {
    path,
    text,
    bytes,
    declaredSize: bytes,
    language: "none",
    category: "documentation",
    isTest: false,
    ...overrides,
  };
}
