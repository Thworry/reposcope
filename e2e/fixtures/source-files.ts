export const SOURCE_FILES = {
  "README.md": `# Repo fixture\n\n## Install\n\n\`\`\`sh\npnpm install\n\`\`\`\n\n## Usage\n\nRun \`pnpm start\` to inspect the deterministic example.\n\n## Testing\n\nRun \`pnpm test\`.\n`,
  "package.json": JSON.stringify({
    name: "repo-fixture",
    version: "1.0.0",
    scripts: {
      start: "node dist/index.js",
      build: "tsc",
      test: "vitest run",
      lint: "eslint .",
    },
    devDependencies: { typescript: "6.0.3", vitest: "4.1.10" },
  }),
  "src/index.ts": `import { sum } from "./math";\n\n/** Return a fixture total. */\nexport function fixtureTotal(values: number[]): number {\n  if (values.length === 0) return 0;\n  return values.reduce((total, value) => sum(total, value), 0);\n}\n`,
  "src/math.ts": `/** Add two finite numbers. */\nexport function sum(left: number, right: number): number {\n  if (!Number.isFinite(left) || !Number.isFinite(right)) {\n    throw new TypeError("finite numbers required");\n  }\n  return left + right;\n}\n`,
  "src/format.ts": `/** Format a fixture total. */\nexport function formatTotal(value: number): string {\n  return new Intl.NumberFormat("en-US").format(value);\n}\n`,
  "src/stats.ts": `/** Return the arithmetic mean. */\nexport function mean(values: number[]): number {\n  if (values.length === 0) return 0;\n  return values.reduce((total, value) => total + value, 0) / values.length;\n}\n`,
  "src/validate.ts": `/** Determine whether every fixture value is finite. */\nexport function validValues(values: number[]): boolean {\n  return values.every(Number.isFinite);\n}\n`,
  "test/math.test.ts": `import { expect, test } from "vitest";\nimport { sum } from "../src/math";\n\ntest("adds", () => { expect(sum(2, 3)).toBe(5); });\n`,
} as const;

export const PYTHON_SOURCE_FILES = {
  "README.md": SOURCE_FILES["README.md"],
  "pyproject.toml": `[project]\nname = "repo-fixture"\nversion = "1.0.0"\n\n[project.scripts]\nrepo-fixture = "src.main:main"\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n`,
  "src/__init__.py": "",
  "src/main.py": `"""Small deterministic fixture application."""\n\ndef total(values: list[int]) -> int:\n    """Return the sum of values."""\n    if not values:\n        return 0\n    return sum(values)\n\ndef main() -> None:\n    print(total([1, 2, 3]))\n`,
  "src/formatting.py": `"""Formatting helpers."""\n\ndef format_total(value: int) -> str:\n    """Format a total for display."""\n    return f"{value:,}"\n`,
  "src/statistics.py": `"""Statistics helpers."""\n\ndef mean(values: list[int]) -> float:\n    """Return the arithmetic mean."""\n    if not values:\n        return 0.0\n    return sum(values) / len(values)\n`,
  "src/validation.py": `"""Validation helpers."""\n\ndef valid_values(values: list[int]) -> bool:\n    """Return whether every fixture value is an integer."""\n    return all(isinstance(value, int) for value in values)\n`,
  "tests/test_main.py": `from src.main import total\n\ndef test_total() -> None:\n    assert total([1, 2, 3]) == 6\n`,
} as const;

export const GO_SOURCE_FILES = {
  "README.md": SOURCE_FILES["README.md"],
  "go.mod": "module github.com/owner/repo\n\ngo 1.24\n",
  "main.go": `package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("fixture") }\n`,
} as const;

export type SourceFileMap = Readonly<Record<string, string>>;
