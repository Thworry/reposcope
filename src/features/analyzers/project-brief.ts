import { parse as parseToml } from "smol-toml";

import {
  PROJECT_BRIEF_CAUTIONS,
  PROJECT_KINDS,
  type FetchedTextFile,
  type GeneralAnalysisInput,
  type GeneralMetrics,
  type ProjectBrief,
  type ProjectBriefCaution,
  type ProjectBriefExcerpt,
  type ProjectKind,
  type ProjectKindFact,
} from "../analysis/model";
import { isExcludedPath, toPathComparisonKey } from "../scanner/file-registry";
import { preferredReadme } from "./general";

const MAX_EXCERPTS = 2;
const MAX_EXCERPT_CODE_POINTS = 480;
const MAX_TOTAL_EXCERPT_CODE_POINTS = 800;
const MAX_KINDS = 3;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_STRUCTURED_TARGET_NODES = 4_096;
const MAX_STRUCTURED_TARGET_DEPTH = 128;
const MAX_HTML_BLOCK_DEPTH = 128;

const OVERVIEW_HEADINGS = new Set([
  "overview",
  "about",
  "what is",
  "简介",
  "概述",
  "关于",
]);
const CONTENTS_HEADINGS = new Set([
  "contents",
  "table of contents",
  "toc",
  "目录",
  "目录索引",
]);
const VOID_HTML_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const COMMAND_EXECUTABLES = new Set([
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "node",
  "deno",
  "python",
  "python3",
  "pip",
  "pip3",
  "uv",
  "poetry",
  "pytest",
  "tox",
  "nox",
  "ruff",
  "black",
  "git",
  "gh",
  "curl",
  "wget",
  "go",
  "cargo",
  "mvn",
  "gradle",
  "gradlew",
  "dotnet",
  "swift",
  "docker",
  "docker-compose",
  "make",
  "just",
  "task",
]);
const PROSE_VERBS = new Set([
  "enables",
  "helps",
  "is",
  "lets",
  "makes",
  "offers",
  "provides",
  "supports",
  "uses",
]);
const OPAQUE_URI_SCHEMES = new Set([
  "bitcoin",
  "data",
  "ethereum",
  "facetime",
  "file",
  "geo",
  "git",
  "javascript",
  "magnet",
  "mailto",
  "mms",
  "news",
  "nntp",
  "sip",
  "sips",
  "sms",
  "smsto",
  "ssh",
  "tel",
  "telnet",
  "urn",
  "vbscript",
  "webcal",
  "xmpp",
]);
const PLUGIN_TOPICS = new Set(["plugin", "extension"]);
const TEMPLATE_TOPICS = new Set([
  "repository-template",
  "template",
  "starter",
  "boilerplate",
  "scaffold",
]);

interface TargetValidation {
  found: boolean;
  tooComplex: boolean;
}

interface PackageKindEvidence {
  application: boolean;
  commandLineTool: boolean;
  library: boolean;
}

interface PyprojectKindEvidence {
  commandLineTool: boolean;
  library: boolean;
  plugin: boolean;
}

interface FenceLine {
  marker: "`" | "~";
  length: number;
  remainder: string;
}

interface HtmlBlockState {
  tag: string;
  inComment: boolean;
  depth: number;
  failedClosed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !containsUnsafeText(value)
  );
}

function encodedSize(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function isBounded(text: string): boolean {
  return encodedSize(text) <= MAX_MANIFEST_BYTES;
}

function containsUnsafeText(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (
      codePoint === undefined ||
      codePoint <= 31 ||
      (codePoint >= 127 && codePoint <= 159) ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      codePoint === 0x061c ||
      codePoint === 0x200e ||
      codePoint === 0x200f ||
      codePoint === 0x2028 ||
      codePoint === 0x2029 ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) {
      return true;
    }
  }

  return false;
}

function truncateCodePoints(value: string, maximum: number): string {
  const codePoints = Array.from(value);

  return codePoints.length <= maximum
    ? value
    : codePoints.slice(0, maximum).join("").trimEnd();
}

function appendVisible(target: string[], value: string): void {
  if (/\s/u.test(value)) {
    if (target.length > 0 && target.at(-1) !== " ") {
      target.push(" ");
    }
    return;
  }

  target.push(value);
}

function visibleLabel(value: string): string | null {
  const visible: string[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === undefined) {
      return null;
    }
    if (character === "\\") {
      const escaped = value[index + 1];

      if (escaped === undefined) {
        return null;
      }
      appendVisible(visible, escaped);
      index += 1;
      continue;
    }
    if (character === "[" || character === "]" || character === "<") {
      return null;
    }
    if (
      character === "`" ||
      character === "*" ||
      character === "_" ||
      character === "~"
    ) {
      continue;
    }
    appendVisible(visible, character);
  }

  const label = visible.join("").trim();
  const sanitized: string[] = [];

  for (let index = 0; index < label.length; index += 1) {
    const urlLength = rawUriLength(label, index, 0);

    if (urlLength > 0) {
      index += urlLength - 1;
    } else {
      sanitized.push(label[index] ?? "");
    }
  }

  return sanitized.join("").trim();
}

function skipLinkDestination(value: string, start: number): number | null {
  let depth = 1;
  let quote: '"' | "'" | null = null;

  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];

    if (character === "\\") {
      index += 1;
      continue;
    }
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") {
      depth += 1;
      if (depth > MAX_STRUCTURED_TARGET_DEPTH) {
        return null;
      }
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return null;
}

function skipReferenceDestination(value: string, start: number): number | null {
  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] === "\\") {
      index += 1;
      continue;
    }
    if (value[index] === "]") {
      return index;
    }
    if (value[index] === "[") {
      return null;
    }
  }

  return null;
}

function skipDelimitedCode(value: string, start: number): number | null {
  let delimiterLength = 1;

  while (value[start + delimiterLength] === "`") {
    delimiterLength += 1;
  }

  for (let index = start + delimiterLength; index < value.length; index += 1) {
    if (value[index] !== "`") {
      continue;
    }
    let runLength = 1;

    while (value[index + runLength] === "`") {
      runLength += 1;
    }
    if (runLength === delimiterLength) {
      return index + runLength - 1;
    }
    index += runLength - 1;
  }

  return null;
}

function skipAngleConstruct(value: string, start: number): number | null {
  let quote: '"' | "'" | null = null;

  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];

    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") {
      return index;
    }
  }

  return null;
}

function startsWithAsciiInsensitive(
  value: string,
  start: number,
  candidate: string,
): boolean {
  if (start + candidate.length > value.length) {
    return false;
  }

  for (let offset = 0; offset < candidate.length; offset += 1) {
    const actual = value.charCodeAt(start + offset);
    const expected = candidate.charCodeAt(offset);
    const folded = actual >= 65 && actual <= 90 ? actual + 32 : actual;

    if (folded !== expected) {
      return false;
    }
  }

  return true;
}

function isAsciiLetter(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const code = value.charCodeAt(0);

  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isAsciiSchemeCharacter(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const code = value.charCodeAt(0);

  return (
    isAsciiLetter(value) ||
    (code >= 48 && code <= 57) ||
    value === "+" ||
    value === "." ||
    value === "-"
  );
}

function hasUriTokenBoundary(value: string, start: number): boolean {
  if (start === 0) {
    return true;
  }

  return !/[A-Za-z0-9+._-]/u.test(value[start - 1] ?? "");
}

function hasProtocolRelativeBoundary(value: string, start: number): boolean {
  if (start === 0) {
    return true;
  }

  return /[\s([<{"'`]/u.test(value[start - 1] ?? "");
}

function uriPayloadLength(value: string, start: number): number {
  if (start >= value.length || /\s/u.test(value[start] ?? "")) {
    return 0;
  }

  let index = start;

  while (index < value.length && !/\s/u.test(value[index] ?? "")) {
    index += 1;
  }

  return index - start;
}

function rawUriLength(
  value: string,
  start: number,
  candidateStart: number,
): number {
  if (!hasUriTokenBoundary(value, start)) {
    return 0;
  }

  if (
    startsWithAsciiInsensitive(value, start, "//") &&
    hasProtocolRelativeBoundary(value, start)
  ) {
    const payloadLength = uriPayloadLength(value, start + 2);

    return payloadLength === 0 ? 0 : 2 + payloadLength;
  }

  if (startsWithAsciiInsensitive(value, start, "www.")) {
    const payloadLength = uriPayloadLength(value, start + 4);

    return payloadLength === 0 ? 0 : 4 + payloadLength;
  }

  if (!isAsciiLetter(value[start])) {
    return 0;
  }

  let cursor = start + 1;
  while (isAsciiSchemeCharacter(value[cursor])) {
    cursor += 1;
  }
  if (value[cursor] !== ":") {
    return 0;
  }

  const scheme = value.slice(start, cursor).toLocaleLowerCase("en-US");
  let payloadStart: number;
  if (value[cursor + 1] === "/" && value[cursor + 2] === "/") {
    payloadStart = cursor + 3;
  } else if (OPAQUE_URI_SCHEMES.has(scheme) || start === candidateStart) {
    payloadStart = cursor + 1;
  } else {
    return 0;
  }

  const payloadLength = uriPayloadLength(value, payloadStart);

  return payloadLength === 0 ? 0 : payloadStart - start + payloadLength;
}

/** Converts one prose line to visible text without retaining Markdown targets. */
function visibleMarkdownLine(value: string): string | null {
  if (containsUnsafeText(value) || value.includes("![")) {
    return null;
  }

  const visible: string[] = [];
  let candidateStart = 0;

  while (/\s/u.test(value[candidateStart] ?? "")) {
    candidateStart += 1;
  }

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === undefined) {
      return null;
    }
    const urlLength = rawUriLength(value, index, candidateStart);

    if (urlLength > 0) {
      index += urlLength - 1;
      continue;
    }
    if (character === "\\") {
      const escaped = value[index + 1];

      if (escaped === undefined) {
        return null;
      }
      appendVisible(visible, escaped);
      index += 1;
      continue;
    }
    if (character === "`") {
      const end = skipDelimitedCode(value, index);

      if (end === null) {
        return null;
      }
      index = end;
      continue;
    }
    if (character === "<") {
      const end = skipAngleConstruct(value, index);

      if (end === null) {
        return null;
      }
      index = end;
      continue;
    }
    if (character === "[") {
      let end = index + 1;

      while (end < value.length && value[end] !== "]") {
        if (value[end] === "[") {
          return null;
        }
        if (value[end] === "\\") {
          end += 1;
        }
        end += 1;
      }
      if (end >= value.length) {
        return null;
      }
      const label = visibleLabel(value.slice(index + 1, end));

      if (label === null) {
        return null;
      }
      for (const labelCharacter of label) {
        appendVisible(visible, labelCharacter);
      }

      const destinationStart = end + 1;
      if (value[destinationStart] === "(") {
        const destinationEnd = skipLinkDestination(value, destinationStart);

        if (destinationEnd === null) {
          return null;
        }
        end = destinationEnd;
      } else if (value[destinationStart] === "[") {
        const destinationEnd = skipReferenceDestination(
          value,
          destinationStart,
        );

        if (destinationEnd === null) {
          return null;
        }
        end = destinationEnd;
      }
      index = end;
      continue;
    }
    if (character === "*" || character === "_" || character === "~") {
      continue;
    }
    appendVisible(visible, character);
  }

  return visible.join("").replace(/\s+/gu, " ").trim();
}

function meaningfulProse(value: string, rejectCommandOnly = true): boolean {
  return (
    /[\p{L}\p{N}]/u.test(value) && (!rejectCommandOnly || !isCommandOnly(value))
  );
}

function normalizeCandidate(
  value: string,
  rejectCommandOnly = true,
): string | null {
  if (!isBounded(value)) {
    return null;
  }

  const visible = visibleMarkdownLine(value.normalize("NFKC"));

  if (visible === null || !meaningfulProse(visible, rejectCommandOnly)) {
    return null;
  }

  return truncateCodePoints(visible, MAX_EXCERPT_CODE_POINTS);
}

function canonicalPurpose(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function isCommandOnly(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed.startsWith("$") || trimmed.startsWith(">")) {
    return true;
  }

  const tokens = trimmed.split(/\s+/u);
  const rawExecutable = tokens[0]?.replace(/^\.\//u, "");
  const executable = rawExecutable?.toLocaleLowerCase("en-US");
  const secondToken = tokens[1]
    ?.replace(/[^\p{L}-]+$/gu, "")
    .toLocaleLowerCase("en-US");

  return (
    executable !== undefined &&
    rawExecutable === executable &&
    COMMAND_EXECUTABLES.has(executable) &&
    (secondToken === undefined || !PROSE_VERBS.has(secondToken))
  );
}

function fenceLine(value: string): FenceLine | null {
  let start = 0;

  while (value[start] === " " && start < 4) {
    start += 1;
  }
  if (start > 3) {
    return null;
  }

  const marker = value[start];

  if (marker !== "`" && marker !== "~") {
    return null;
  }

  let length = 0;
  while (value[start + length] === marker) {
    length += 1;
  }

  return length >= 3
    ? { marker, length, remainder: value.slice(start + length) }
    : null;
}

function heading(value: string): { level: number; text: string } | null {
  const trimmed = value.replace(/^ {0,3}/u, "");
  let level = 0;

  while (level < 6 && trimmed[level] === "#") {
    level += 1;
  }
  if (
    level === 0 ||
    (trimmed[level] !== undefined && !/\s/u.test(trimmed[level] ?? ""))
  ) {
    return null;
  }

  const raw = trimmed
    .slice(level)
    .trim()
    .replace(/\s+#+\s*$/u, "");
  const text = visibleMarkdownLine(raw);

  return text === null ? null : { level, text };
}

function setextHeadingLevel(value: string): 1 | 2 | null {
  let index = 0;

  while (value[index] === " " && index < 4) {
    index += 1;
  }
  if (index > 3) {
    return null;
  }

  const marker = value[index];
  if (marker !== "=" && marker !== "-") {
    return null;
  }

  const level = marker === "=" ? 1 : 2;
  while (value[index] === marker) {
    index += 1;
  }
  while (value[index] === " " || value[index] === "\t") {
    index += 1;
  }

  return index === value.length ? level : null;
}

function headingKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[：:?!？!。．.]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function isOverviewHeading(value: string): boolean {
  const key = headingKey(value);

  return (
    OVERVIEW_HEADINGS.has(key) ||
    key.startsWith("about ") ||
    key.startsWith("what is ") ||
    key.startsWith("关于")
  );
}

function isContentsHeading(value: string): boolean {
  return CONTENTS_HEADINGS.has(headingKey(value));
}

function isListLine(value: string): boolean {
  const trimmed = value.trimStart();
  const first = trimmed[0];

  if (
    (first === "-" || first === "+" || first === "*") &&
    /\s/u.test(trimmed[1] ?? "")
  ) {
    return true;
  }

  let index = 0;
  while (/\d/u.test(trimmed[index] ?? "")) {
    index += 1;
  }

  return (
    index > 0 &&
    (trimmed[index] === "." || trimmed[index] === ")") &&
    /\s/u.test(trimmed[index + 1] ?? "")
  );
}

function isReferenceDefinition(value: string): boolean {
  const trimmed = value.trimStart();

  if (trimmed[0] !== "[") {
    return false;
  }

  for (let index = 1; index < trimmed.length; index += 1) {
    if (trimmed[index] === "]") {
      return trimmed[index + 1] === ":";
    }
    if (trimmed[index] === "[") {
      return false;
    }
  }

  return false;
}

function isTableLine(value: string): boolean {
  const trimmed = value.trim();

  return (
    trimmed.startsWith("|") ||
    trimmed.endsWith("|") ||
    /^:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+$/u.test(trimmed)
  );
}

function htmlBlockTag(value: string): string | null {
  const trimmed = value.trimStart();

  if (trimmed[0] !== "<" || trimmed[1] === "/") {
    return null;
  }

  let index = 1;
  while (/[\p{L}\p{N}-]/u.test(trimmed[index] ?? "")) {
    index += 1;
  }
  if (
    index === 1 ||
    (index < trimmed.length && !/[\s/>]/u.test(trimmed[index] ?? ""))
  ) {
    return null;
  }

  return trimmed.slice(1, index).toLocaleLowerCase("en-US");
}

function isClosingHtmlTag(
  value: string,
  start: number,
  end: number,
  tag: string,
): boolean {
  if (value[start] !== "<" || value[start + 1] !== "/") {
    return false;
  }

  const nameStart = start + 2;
  const nameEnd = nameStart + tag.length;
  if (value.slice(nameStart, nameEnd).toLocaleLowerCase("en-US") !== tag) {
    return false;
  }

  let cursor = nameEnd;
  while (value[cursor] === " " || value[cursor] === "\t") {
    cursor += 1;
  }

  return cursor === end;
}

function isOpeningHtmlTag(
  value: string,
  start: number,
  end: number,
  tag: string,
): boolean {
  if (value[start] !== "<" || value[start + 1] === "/") {
    return false;
  }

  const nameStart = start + 1;
  const nameEnd = nameStart + tag.length;
  if (value.slice(nameStart, nameEnd).toLocaleLowerCase("en-US") !== tag) {
    return false;
  }

  return nameEnd === end || /[\s/]/u.test(value[nameEnd] ?? "");
}

function isSelfClosingHtmlTag(value: string, end: number): boolean {
  let cursor = end - 1;

  while (value[cursor] === " " || value[cursor] === "\t") {
    cursor -= 1;
  }

  return value[cursor] === "/";
}

function scanHtmlBlockLine(
  value: string,
  state: HtmlBlockState,
  start = 0,
): { closed: boolean; state: HtmlBlockState } {
  if (state.failedClosed) {
    return { closed: false, state };
  }

  let inComment = state.inComment;
  let depth = state.depth;

  for (let index = start; index < value.length; index += 1) {
    if (inComment) {
      if (value.startsWith("-->", index)) {
        inComment = false;
        index += 2;
      }
      continue;
    }
    if (value.startsWith("<!--", index)) {
      inComment = true;
      index += 3;
      continue;
    }
    if (value[index] !== "<") {
      continue;
    }

    const end = skipAngleConstruct(value, index);
    if (end === null) {
      return {
        closed: false,
        state: { ...state, depth, inComment },
      };
    }
    if (isClosingHtmlTag(value, index, end, state.tag)) {
      depth -= 1;
      if (depth === 0) {
        return {
          closed: true,
          state: { ...state, depth: 0, inComment: false },
        };
      }
    } else if (
      isOpeningHtmlTag(value, index, end, state.tag) &&
      !isSelfClosingHtmlTag(value, end)
    ) {
      depth += 1;
      if (depth > MAX_HTML_BLOCK_DEPTH) {
        return {
          closed: false,
          state: { ...state, depth, inComment, failedClosed: true },
        };
      }
    }
    index = end;
  }

  return {
    closed: false,
    state: { ...state, depth, inComment },
  };
}

function extractReadmeProse(file: FetchedTextFile): string[] {
  if (!isBounded(file.text)) {
    return [];
  }

  const normalized = file.text
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .normalize("NFKC");
  const lines = normalized.split("\n");
  const leadCandidates: string[] = [];
  const overviewCandidates: string[] = [];
  let paragraphLines: string[] = [];
  let paragraphTarget: "lead" | "overview" = "lead";
  let inFrontMatter = lines[0]?.trim() === "---";
  let inFence: Pick<FenceLine, "marker" | "length"> | null = null;
  let inHtmlComment = false;
  let inHtmlBlock: HtmlBlockState | null = null;
  let inOverview = false;
  let inContents = false;
  let primaryTitleSeen = false;

  const finalizeParagraph = (): void => {
    if (paragraphLines.length === 0) {
      return;
    }
    const candidate = normalizeCandidate(paragraphLines.join(" "));
    const target =
      paragraphTarget === "overview" ? overviewCandidates : leadCandidates;

    if (
      candidate !== null &&
      target.length < MAX_EXCERPTS &&
      !target.some(
        (existing) =>
          canonicalPurpose(existing) === canonicalPurpose(candidate),
      )
    ) {
      target.push(candidate);
    }
    paragraphLines = [];
  };

  const selectHeading = (
    level: number,
    text: string,
  ): { overview: boolean; contents: boolean } => {
    finalizeParagraph();
    if (level === 1 && !primaryTitleSeen) {
      primaryTitleSeen = true;
      leadCandidates.length = 0;
    }
    return {
      overview: isOverviewHeading(text),
      contents: isContentsHeading(text),
    };
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (inFrontMatter) {
      if (index > 0 && (trimmed === "---" || trimmed === "...")) {
        inFrontMatter = false;
      }
      continue;
    }
    if (inHtmlBlock !== null) {
      const state: HtmlBlockState = inHtmlBlock;
      const scan = scanHtmlBlockLine(line, state);

      if (scan.closed) {
        inHtmlBlock = null;
      } else {
        inHtmlBlock = scan.state;
      }
      continue;
    }
    if (inHtmlComment) {
      if (line.includes("-->")) {
        inHtmlComment = false;
      }
      continue;
    }
    const blockTag = htmlBlockTag(line);
    if (blockTag !== null) {
      finalizeParagraph();
      const openingStart = line.length - line.trimStart().length;
      const openingEnd = skipAngleConstruct(line, openingStart);
      const state: HtmlBlockState = {
        tag: blockTag,
        inComment: false,
        depth: 1,
        failedClosed: false,
      };
      const scan = scanHtmlBlockLine(
        line,
        state,
        openingEnd === null ? line.length : openingEnd + 1,
      );
      if (
        !VOID_HTML_TAGS.has(blockTag) &&
        !(openingEnd !== null && isSelfClosingHtmlTag(line, openingEnd))
      ) {
        if (!scan.closed) {
          inHtmlBlock = scan.state;
        }
      } else {
        inHtmlComment = scan.state.inComment;
      }
      continue;
    }
    if (line.includes("<!--")) {
      finalizeParagraph();
      inHtmlComment = !line.includes("-->");
      continue;
    }
    const fence = fenceLine(line);
    if (inFence !== null) {
      if (
        fence !== null &&
        fence.marker === inFence.marker &&
        fence.length >= inFence.length &&
        fence.remainder.trim().length === 0
      ) {
        inFence = null;
      }
      continue;
    }
    if (fence !== null) {
      finalizeParagraph();
      inFence = { marker: fence.marker, length: fence.length };
      continue;
    }

    const lineHeading = heading(line);
    if (lineHeading !== null) {
      const selection = selectHeading(lineHeading.level, lineHeading.text);

      inOverview = selection.overview;
      inContents = selection.contents;
      paragraphTarget = inOverview ? "overview" : "lead";
      continue;
    }

    const setextLevel = setextHeadingLevel(lines[index + 1] ?? "");
    const setextText =
      setextLevel === null ||
      line.startsWith("    ") ||
      line.startsWith("\t") ||
      trimmed.startsWith(">") ||
      isListLine(line) ||
      isReferenceDefinition(line) ||
      isTableLine(line)
        ? null
        : visibleMarkdownLine(line);
    if (
      setextLevel !== null &&
      setextText !== null &&
      meaningfulProse(setextText)
    ) {
      const selection = selectHeading(setextLevel, setextText);

      inOverview = selection.overview;
      inContents = selection.contents;
      paragraphTarget = inOverview ? "overview" : "lead";
      index += 1;
      continue;
    }

    if (trimmed.length === 0) {
      finalizeParagraph();
      continue;
    }
    if (
      inContents ||
      line.startsWith("    ") ||
      line.startsWith("\t") ||
      trimmed === "---" ||
      trimmed === "***" ||
      trimmed === "___" ||
      trimmed.startsWith(">") ||
      isListLine(line) ||
      isReferenceDefinition(line) ||
      isTableLine(line) ||
      isCommandOnly(trimmed)
    ) {
      finalizeParagraph();
      continue;
    }

    const visible = visibleMarkdownLine(line);
    if (visible === null || visible.length === 0) {
      finalizeParagraph();
      continue;
    }
    const nextTarget = inOverview ? "overview" : "lead";
    if (paragraphLines.length > 0 && paragraphTarget !== nextTarget) {
      finalizeParagraph();
    }
    paragraphTarget = nextTarget;
    paragraphLines.push(visible);
  }

  finalizeParagraph();

  return overviewCandidates.length > 0 ? overviewCandidates : leadCandidates;
}

function validateDirectTarget(value: unknown): TargetValidation {
  if (nonEmptyString(value)) {
    return { found: true, tooComplex: false };
  }
  if (!isRecord(value)) {
    return { found: false, tooComplex: false };
  }

  const values = Object.values(value);

  return values.length > MAX_STRUCTURED_TARGET_NODES
    ? { found: false, tooComplex: true }
    : { found: values.some(nonEmptyString), tooComplex: false };
}

function validateRecursiveTarget(value: unknown): TargetValidation {
  const pending: Array<{ value: unknown; depth: number }> = [
    { value, depth: 0 },
  ];
  let visited = 0;
  let found = false;

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }
    visited += 1;
    if (
      visited > MAX_STRUCTURED_TARGET_NODES ||
      current.depth > MAX_STRUCTURED_TARGET_DEPTH
    ) {
      return { found: false, tooComplex: true };
    }
    if (nonEmptyString(current.value)) {
      found = true;
      continue;
    }

    const children = Array.isArray(current.value)
      ? current.value
      : isRecord(current.value)
        ? Object.values(current.value)
        : [];

    for (const child of children) {
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }

  return { found, tooComplex: false };
}

function readPackageKinds(
  text: string,
  conventionalEntryPoint: boolean,
): PackageKindEvidence | null {
  if (!isBounded(text)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }

  const browser = validateDirectTarget(parsed.browser);
  const bin = validateDirectTarget(parsed.bin);
  const exportsTarget = validateRecursiveTarget(parsed.exports);
  if (browser.tooComplex || bin.tooComplex || exportsTarget.tooComplex) {
    return null;
  }

  const scripts = isRecord(parsed.scripts) ? parsed.scripts : {};
  const hasRunScript = ["start", "dev", "serve"].some((key) =>
    nonEmptyString(scripts[key]),
  );

  return {
    application: hasRunScript && (browser.found || conventionalEntryPoint),
    commandLineTool: bin.found,
    library:
      nonEmptyString(parsed.main) ||
      nonEmptyString(parsed.module) ||
      nonEmptyString(parsed.types) ||
      exportsTarget.found,
  };
}

function hasPythonLibraryLayout(
  projectName: unknown,
  treePathKeys: ReadonlySet<string>,
  pyprojectPath: string,
): boolean {
  if (!nonEmptyString(projectName)) {
    return false;
  }

  const packageName = projectName
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[-.]+/gu, "_");
  if (!/^[\p{L}\p{N}_]+$/u.test(packageName)) {
    return false;
  }

  const manifestKey = toPathComparisonKey(pyprojectPath);
  const slash = manifestKey.lastIndexOf("/");
  const directory = slash === -1 ? "" : manifestKey.slice(0, slash + 1);

  return (
    treePathKeys.has(`${directory}${packageName}/__init__.py`) ||
    treePathKeys.has(`${directory}src/${packageName}/__init__.py`)
  );
}

function readPyprojectKinds(
  text: string,
  treePathKeys: ReadonlySet<string>,
  pyprojectPath: string,
): PyprojectKindEvidence | null {
  if (!isBounded(text)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseToml(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }

  const project = isRecord(parsed.project) ? parsed.project : undefined;
  const scripts = validateDirectTarget(project?.scripts);
  const entryPoints = validateRecursiveTarget(project?.["entry-points"]);
  if (scripts.tooComplex || entryPoints.tooComplex) {
    return null;
  }

  return {
    commandLineTool: scripts.found,
    library:
      nonEmptyString(project?.name) &&
      (!scripts.found ||
        hasPythonLibraryLayout(project.name, treePathKeys, pyprojectPath)),
    plugin: entryPoints.found,
  };
}

function comparePaths(left: string, right: string): number {
  return (
    toPathComparisonKey(left).localeCompare(
      toPathComparisonKey(right),
      "en-US",
    ) || left.localeCompare(right, "en-US")
  );
}

function sourcePriority(source: ProjectKindFact["source"]): number {
  return {
    manifest: 0,
    tree: 1,
    "github-metadata": 2,
    analysis: 3,
  }[source];
}

function retainStrongestKind(
  facts: Map<ProjectKind, ProjectKindFact>,
  candidate: ProjectKindFact,
): void {
  const existing = facts.get(candidate.kind);

  if (
    existing === undefined ||
    sourcePriority(candidate.source) < sourcePriority(existing.source) ||
    (sourcePriority(candidate.source) === sourcePriority(existing.source) &&
      candidate.path !== null &&
      existing.path !== null &&
      comparePaths(candidate.path, existing.path) < 0)
  ) {
    facts.set(candidate.kind, candidate);
  }
}

function manifestFact(kind: ProjectKind, path: string): ProjectKindFact {
  return { kind, source: "manifest", path };
}

function classifyProjectKinds(
  input: GeneralAnalysisInput,
  general: GeneralMetrics,
): ProjectKindFact[] {
  const facts = new Map<ProjectKind, ProjectKindFact>();
  const treePaths = input.tree.files
    .map((file) => file.path)
    .filter((path) => !isExcludedPath(path))
    .sort(comparePaths);
  const treePathKeys = new Set(treePaths.map(toPathComparisonKey));
  const fetchedFiles = [...input.files]
    .filter((file) => !isExcludedPath(file.path))
    .sort((left, right) => comparePaths(left.path, right.path));

  for (const file of fetchedFiles) {
    const key = toPathComparisonKey(file.path);
    const basename = key.slice(key.lastIndexOf("/") + 1);

    if (basename === "package.json") {
      const evidence = readPackageKinds(
        file.text,
        general.hasConventionalEntryPoint,
      );
      if (evidence?.application === true) {
        retainStrongestKind(facts, manifestFact("application", file.path));
      }
      if (evidence?.commandLineTool === true) {
        retainStrongestKind(
          facts,
          manifestFact("command-line-tool", file.path),
        );
      }
      if (evidence?.library === true) {
        retainStrongestKind(facts, manifestFact("library", file.path));
      }
    } else if (basename === "pyproject.toml") {
      const evidence = readPyprojectKinds(file.text, treePathKeys, file.path);
      if (evidence?.commandLineTool === true) {
        retainStrongestKind(
          facts,
          manifestFact("command-line-tool", file.path),
        );
      }
      if (evidence?.library === true) {
        retainStrongestKind(facts, manifestFact("library", file.path));
      }
      if (evidence?.plugin === true) {
        retainStrongestKind(facts, manifestFact("plugin", file.path));
      }
    }
  }

  const pluginPath = treePaths.find((path) => {
    const key = toPathComparisonKey(path);

    return key === ".codex-plugin/plugin.json" || key === "plugin.json";
  });
  if (pluginPath !== undefined) {
    retainStrongestKind(facts, {
      kind: "plugin",
      source: "tree",
      path: pluginPath,
    });
  }

  const templatePath = treePaths.find((path) => {
    const key = toPathComparisonKey(path);

    return key === "cookiecutter.json" || key.startsWith("template/");
  });
  if (templatePath !== undefined) {
    retainStrongestKind(facts, {
      kind: "template",
      source: "tree",
      path: templatePath,
    });
  }

  const topics = input.repository.topics.map((topic) =>
    topic.normalize("NFKC").trim().toLocaleLowerCase("en-US"),
  );
  if (topics.some((topic) => PLUGIN_TOPICS.has(topic))) {
    retainStrongestKind(facts, {
      kind: "plugin",
      source: "github-metadata",
      path: null,
    });
  }
  if (topics.some((topic) => TEMPLATE_TOPICS.has(topic))) {
    retainStrongestKind(facts, {
      kind: "template",
      source: "github-metadata",
      path: null,
    });
  }

  if (
    facts.size === 0 &&
    general.hasReadme &&
    general.supportedSourceFileCount === 0
  ) {
    retainStrongestKind(facts, {
      kind: "documentation",
      source: "analysis",
      path: null,
    });
  }

  return PROJECT_KINDS.filter((kind) => facts.has(kind))
    .slice(0, MAX_KINDS)
    .map((kind) => facts.get(kind) as ProjectKindFact);
}

function buildCautions(
  input: GeneralAnalysisInput,
  general: GeneralMetrics,
  excerpts: readonly ProjectBriefExcerpt[],
): ProjectBrief["cautions"] {
  const applicable = new Set<ProjectBriefCaution>();

  if (input.repository.archived) {
    applicable.add("archived");
  }
  if (excerpts.length === 0) {
    applicable.add("insufficient-explanation");
  }
  if (!general.hasLicenseFile && !general.apiLicenseDetected) {
    applicable.add("license-evidence-absent");
  }
  if (!general.hasStructuredEntryPoint && !general.hasConventionalEntryPoint) {
    applicable.add("entry-point-evidence-absent");
  }

  return PROJECT_BRIEF_CAUTIONS.filter((caution) =>
    applicable.has(caution),
  ).map((caution) => ({
    caution,
    source: caution === "archived" ? "github-metadata" : "analysis",
    path: null,
  }));
}

function addExcerpt(
  excerpts: ProjectBriefExcerpt[],
  candidate: ProjectBriefExcerpt,
): void {
  if (excerpts.length >= MAX_EXCERPTS) {
    return;
  }
  const remaining =
    MAX_TOTAL_EXCERPT_CODE_POINTS -
    excerpts.reduce((total, item) => total + Array.from(item.text).length, 0);
  const text = truncateCodePoints(
    candidate.text,
    Math.min(MAX_EXCERPT_CODE_POINTS, remaining),
  );

  if (
    text.length === 0 ||
    excerpts.some(
      (existing) => canonicalPurpose(existing.text) === canonicalPurpose(text),
    )
  ) {
    return;
  }
  excerpts.push({ ...candidate, text });
}

/** Derives bounded, deterministic, non-scoring project-purpose evidence. */
export function analyzeProjectBrief(
  input: GeneralAnalysisInput,
  general: GeneralMetrics,
): ProjectBrief {
  const excerpts: ProjectBriefExcerpt[] = [];
  const description =
    input.repository.description === null
      ? null
      : normalizeCandidate(input.repository.description, false);

  if (description !== null) {
    addExcerpt(excerpts, {
      source: "github-description",
      text: description,
      path: null,
    });
  }

  const readme = preferredReadme(
    input.files.filter((file) => !isExcludedPath(file.path)),
  );
  if (readme !== undefined) {
    for (const text of extractReadmeProse(readme)) {
      addExcerpt(excerpts, { source: "readme", text, path: readme.path });
    }
  }

  const kinds = classifyProjectKinds(input, general);

  return {
    excerpts,
    kinds,
    cautions: buildCautions(input, general, excerpts),
  };
}
