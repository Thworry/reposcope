import type { SourceLanguage } from "../analysis/model";
import { COMMAND_EXECUTABLES, HEADING_PHRASES } from "../scanner/file-registry";

type MarkdownSection =
  "installation" | "usage" | "architecture" | "configuration";

export interface MarkdownEvidence {
  installHeading: boolean;
  installCommand: boolean;
  usageHeading: boolean;
  usageCommand: boolean;
  usageConcreteExample: boolean;
  usageCommandOrExample: boolean;
  architectureHeading: boolean;
  configurationHeading: boolean;
  invocations: string[][];
}

interface HeadingContext {
  level: number;
  sections: MarkdownSection[];
}

const COMMAND_SET = new Set<string>(COMMAND_EXECUTABLES);
const INLINE_MARKERS = /[*_~`]/gu;
const NORMALIZED_SEPARATOR = /[^\p{L}\p{N}]+/gu;
const PROSE_PUNCTUATION = /^[.,:;!?…。，：；！？、]/u;
const CODE_FENCE_LANGUAGES = new Set([
  "javascript",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "typescript",
  "ts",
  "tsx",
  "mts",
  "cts",
  "python",
  "py",
  "go",
  "golang",
  "rust",
  "rs",
  "c",
  "h",
  "cpp",
  "c++",
  "cxx",
  "hpp",
  "java",
  "kotlin",
  "kt",
  "kts",
  "csharp",
  "cs",
  "fsharp",
  "fs",
  "ruby",
  "rb",
  "php",
  "swift",
  "dart",
  "scala",
  "lua",
  "vue",
  "svelte",
  "astro",
]);

function closingBracket(value: string, start: number, close: string): number {
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const character = value[index];

    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === close) {
      return index;
    }
  }

  return -1;
}

function closingParenthesis(value: string, start: number): number {
  let depth = 1;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const character = value[index];

    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return value.length - 1;
}

function visibleMarkdownText(value: string): string {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const image = value[index] === "!" && value[index + 1] === "[";
    const labelStart = image ? index + 1 : index;

    if (value[labelStart] !== "[") {
      result += value[index] ?? "";
      continue;
    }

    const labelEnd = closingBracket(value, labelStart + 1, "]");

    if (labelEnd === -1) {
      result += value[index] ?? "";
      continue;
    }

    result += value.slice(labelStart + 1, labelEnd);
    const destinationStart = labelEnd + 1;

    if (value[destinationStart] === "(") {
      index = closingParenthesis(value, destinationStart + 1);
    } else if (value[destinationStart] === "[") {
      const referenceEnd = closingBracket(value, destinationStart + 1, "]");
      index = referenceEnd === -1 ? value.length - 1 : referenceEnd;
    } else {
      index = labelEnd;
    }
  }

  return result;
}

function normalizeHeading(value: string): string {
  return visibleMarkdownText(value)
    .normalize("NFKC")
    .replace(INLINE_MARKERS, " ")
    .toLocaleLowerCase("en-US")
    .replace(NORMALIZED_SEPARATOR, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function containsWholePhrase(value: string, phrase: string): boolean {
  const normalizedPhrase = normalizeHeading(phrase);

  return ` ${value} `.includes(` ${normalizedPhrase} `);
}

function sectionsForHeading(value: string): MarkdownSection[] {
  const normalized = normalizeHeading(value);
  const sections: MarkdownSection[] = [];

  for (const section of Object.keys(HEADING_PHRASES) as MarkdownSection[]) {
    const phrases = HEADING_PHRASES[section];
    const matches = [...phrases.en, ...phrases["zh-CN"]].some((phrase) =>
      containsWholePhrase(normalized, phrase),
    );

    if (matches) {
      sections.push(section);
    }
  }

  return sections;
}

function stripPrompt(value: string): string {
  return value.replace(/^\s*[$>]\s*/u, "").trim();
}

function commandName(token: string): string {
  const withoutQuotes = token.replace(/^["']|["']$/gu, "");
  const parts = withoutQuotes.split("/");

  return (parts.at(-1) ?? withoutQuotes).toLocaleLowerCase("en-US");
}

function codeLikeLines(lines: readonly string[]): string {
  let blockComment = false;
  const visible: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (blockComment) {
      if (trimmed.includes("*/")) {
        blockComment = false;
      }
      continue;
    }
    if (trimmed.startsWith("/*")) {
      blockComment = !trimmed.includes("*/");
      continue;
    }
    if (
      trimmed.length === 0 ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("*")
    ) {
      continue;
    }
    visible.push(line);
  }

  return visible.join("\n");
}

function isConcreteCodeExample(
  language: string,
  lines: readonly string[],
): boolean {
  if (!CODE_FENCE_LANGUAGES.has(language)) {
    return false;
  }

  const code = codeLikeLines(lines);

  return (
    code.length > 0 &&
    (/\b(?:import|export|from|const|let|var|function|class|def|fn|package|use|new|return|await|async)\b/u.test(
      code,
    ) ||
      /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(/u.test(code) ||
      /(?:^|[;\n])\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*=(?!=)/u.test(
        code,
      ) ||
      /=>/u.test(code))
  );
}

function analyzeFence(
  language: string,
  lines: readonly string[],
): {
  command: boolean;
  concreteExample: boolean;
  invocations: string[][];
} {
  const meaningful = lines
    .map(stripPrompt)
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith("#") &&
        !line.startsWith("//") &&
        !line.startsWith(";"),
    );
  const first = meaningful[0];

  if (
    first === undefined ||
    (PROSE_PUNCTUATION.test(first) && !first.startsWith("./"))
  ) {
    return { command: false, concreteExample: false, invocations: [] };
  }

  const invocations: string[][] = [];

  for (const line of meaningful) {
    for (const segment of line.split(/\s*(?:&&|\|\||;)\s*/u)) {
      const tokens = segment.match(/[^\s]+/gu) ?? [];

      if (tokens.length > 0) {
        invocations.push(tokens.map((token) => token.normalize("NFKC")));
      }
    }
  }

  const command = invocations.some((tokens) => {
    const executable = tokens[0];

    return executable !== undefined && COMMAND_SET.has(commandName(executable));
  });

  return {
    command,
    concreteExample: isConcreteCodeExample(language, lines),
    invocations,
  };
}

function activeSections(stack: readonly HeadingContext[]): MarkdownSection[] {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const context = stack[index];

    if (context !== undefined && context.sections.length > 0) {
      return context.sections;
    }
  }

  return [];
}

export function findMarkdownEvidence(text: string): MarkdownEvidence {
  const evidence: MarkdownEvidence = {
    installHeading: false,
    installCommand: false,
    usageHeading: false,
    usageCommand: false,
    usageConcreteExample: false,
    usageCommandOrExample: false,
    architectureHeading: false,
    configurationHeading: false,
    invocations: [],
  };
  const stack: HeadingContext[] = [];
  let fenceMarker: "`" | "~" | null = null;
  let fenceLength = 0;
  let fenceLanguage = "";
  let fenceSections: MarkdownSection[] = [];
  let fenceLines: string[] = [];

  for (const line of text.split(/\r?\n/u)) {
    if (fenceMarker !== null) {
      const closePattern = new RegExp(
        `^\\s{0,3}${fenceMarker === "`" ? "`" : "~"}{${String(fenceLength)},}\\s*$`,
        "u",
      );

      if (closePattern.test(line)) {
        const block = analyzeFence(fenceLanguage, fenceLines);
        evidence.invocations.push(...block.invocations);

        if (fenceSections.includes("installation") && block.command) {
          evidence.installCommand = true;
        }
        if (fenceSections.includes("usage")) {
          evidence.usageCommand ||= block.command;
          evidence.usageConcreteExample ||= block.concreteExample;
          evidence.usageCommandOrExample ||=
            block.command || block.concreteExample;
        }

        fenceMarker = null;
        fenceLength = 0;
        fenceLanguage = "";
        fenceSections = [];
        fenceLines = [];
      } else {
        fenceLines.push(line);
      }
      continue;
    }

    const fence = /^\s{0,3}(`{3,}|~{3,})/u.exec(line);

    if (fence?.[1] !== undefined) {
      fenceMarker = fence[1][0] === "`" ? "`" : "~";
      fenceLength = fence[1].length;
      fenceLanguage =
        line
          .slice(fence[0].length)
          .trim()
          .split(/\s/u)[0]
          ?.toLocaleLowerCase("en-US") ?? "";
      fenceSections = activeSections(stack);
      continue;
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line);

    if (heading?.[1] === undefined || heading[2] === undefined) {
      continue;
    }

    const level = heading[1].length;
    const sections = sectionsForHeading(heading[2]);

    while ((stack.at(-1)?.level ?? 0) >= level) {
      stack.pop();
    }
    stack.push({ level, sections });

    evidence.installHeading ||= sections.includes("installation");
    evidence.usageHeading ||= sections.includes("usage");
    evidence.architectureHeading ||= sections.includes("architecture");
    evidence.configurationHeading ||= sections.includes("configuration");
  }

  return evidence;
}

function javascriptLogicalLines(text: string): number[] {
  const result: number[] = [];
  let blockComment = false;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  const lines = text.split("\n");

  for (const [lineIndex, line] of lines.entries()) {
    let hasCode = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index] ?? "";
      const next = line[index + 1] ?? "";

      if (blockComment) {
        if (character === "*" && next === "/") {
          blockComment = false;
          index += 1;
        }
        continue;
      }

      if (quote !== null) {
        hasCode = true;
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }

      if (character === "/" && next === "/") {
        break;
      }
      if (character === "/" && next === "*") {
        blockComment = true;
        index += 1;
        continue;
      }
      if (character === "'" || character === '"' || character === "`") {
        quote = character;
        hasCode = true;
        continue;
      }
      if (!/\s/u.test(character)) {
        hasCode = true;
      }
    }

    if (quote === "`") {
      escaped = false;
    } else if (quote !== null) {
      const continued = escaped;
      escaped = false;
      if (!continued) {
        quote = null;
      }
    }
    if (hasCode) {
      result.push(lineIndex + 1);
    }
  }

  return result;
}

function pythonLogicalLines(text: string): number[] {
  const result: number[] = [];
  let tripleQuote: "'''" | '"""' | null = null;
  let quote: "'" | '"' | null = null;
  let escaped = false;

  function unescapedDelimiter(
    line: string,
    delimiter: "'''" | '"""',
    start: number,
  ): number {
    let candidate = line.indexOf(delimiter, start);

    while (candidate !== -1) {
      let slashCount = 0;

      for (
        let index = candidate - 1;
        index >= 0 && line[index] === "\\";
        index -= 1
      ) {
        slashCount += 1;
      }
      if (slashCount % 2 === 0) {
        return candidate;
      }
      candidate = line.indexOf(delimiter, candidate + delimiter.length);
    }

    return -1;
  }

  for (const [lineIndex, line] of text.split("\n").entries()) {
    let hasCode = false;

    for (let index = 0; index < line.length; index += 1) {
      const rest = line.slice(index);

      if (tripleQuote !== null) {
        hasCode = true;
        const closing = unescapedDelimiter(line, tripleQuote, index);

        if (closing === -1) {
          break;
        }
        index = closing + 2;
        tripleQuote = null;
        continue;
      }

      if (quote !== null) {
        hasCode = true;
        const character = line[index] ?? "";

        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }

      if (rest.startsWith("'''")) {
        tripleQuote = "'''";
        hasCode = true;
        index += 2;
        continue;
      }
      if (rest.startsWith('"""')) {
        tripleQuote = '"""';
        hasCode = true;
        index += 2;
        continue;
      }

      const character = line[index] ?? "";

      if (character === "#") {
        break;
      }
      if (character === "'" || character === '"') {
        quote = character;
        hasCode = true;
      } else if (!/\s/u.test(character)) {
        hasCode = true;
      }
    }

    if (hasCode) {
      result.push(lineIndex + 1);
    }
    if (quote !== null) {
      const continued = escaped;
      escaped = false;
      if (!continued) {
        quote = null;
      }
    }
  }

  return result;
}

export function logicalLineNumbers(
  text: string,
  language: Extract<SourceLanguage, "javascript" | "typescript" | "python">,
): number[] {
  return language === "python"
    ? pythonLogicalLines(text)
    : javascriptLogicalLines(text);
}

export function countLogicalLines(
  text: string,
  language: Extract<SourceLanguage, "javascript" | "typescript" | "python">,
): number {
  return logicalLineNumbers(text, language).length;
}

export function lineAtOffset(text: string, offset: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) {
    throw new Error("Invalid text offset");
  }

  let line = 1;

  for (let index = 0; index < offset; index += 1) {
    if (text[index] === "\n") {
      line += 1;
    }
  }

  return line;
}
