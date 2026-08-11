import type { SourceLanguage } from "../analysis/model";
import { COMMAND_EXECUTABLES, HEADING_PHRASES } from "../scanner/file-registry";

type MarkdownSection =
  "installation" | "usage" | "architecture" | "configuration";

export interface MarkdownEvidence {
  installHeading: boolean;
  installCommand: boolean;
  usageHeading: boolean;
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

function normalizeHeading(value: string): string {
  return value
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

function analyzeFence(lines: readonly string[]): {
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

  if (first === undefined || PROSE_PUNCTUATION.test(first)) {
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

  return { command, concreteExample: true, invocations };
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
    usageCommandOrExample: false,
    architectureHeading: false,
    configurationHeading: false,
    invocations: [],
  };
  const stack: HeadingContext[] = [];
  let fenceMarker: "`" | "~" | null = null;
  let fenceLength = 0;
  let fenceSections: MarkdownSection[] = [];
  let fenceLines: string[] = [];

  for (const line of text.split(/\r?\n/u)) {
    if (fenceMarker !== null) {
      const closePattern = new RegExp(
        `^\\s{0,3}${fenceMarker === "`" ? "`" : "~"}{${String(fenceLength)},}\\s*$`,
        "u",
      );

      if (closePattern.test(line)) {
        const block = analyzeFence(fenceLines);
        evidence.invocations.push(...block.invocations);

        if (fenceSections.includes("installation") && block.command) {
          evidence.installCommand = true;
        }
        if (
          fenceSections.includes("usage") &&
          (block.command || block.concreteExample)
        ) {
          evidence.usageCommandOrExample = true;
        }

        fenceMarker = null;
        fenceLength = 0;
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

    if (quote !== "`") {
      quote = null;
      escaped = false;
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

  for (const [lineIndex, line] of text.split("\n").entries()) {
    let hasCode = false;
    let quote: "'" | '"' | null = null;
    let escaped = false;

    for (let index = 0; index < line.length; index += 1) {
      const rest = line.slice(index);

      if (tripleQuote !== null) {
        hasCode = true;
        const closing = line.indexOf(tripleQuote, index);

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
