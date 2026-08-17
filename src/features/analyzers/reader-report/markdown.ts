import {
  READER_COMMAND_KINDS,
  type FetchedTextFile,
  type ReaderCommandFact,
  type ReaderCommandKind,
  type ReaderTextFact,
} from "../../analysis/model";
import {
  containsCredentialLikeValue,
  isSafeProjectBriefPath,
} from "../../analysis/project-brief-safety";
import { toPathComparisonKey } from "../../scanner/file-registry";
import { commandDisposition } from "./commands";

const MAX_MARKDOWN_BYTES = 256 * 1024;
const MAX_PROSE_CODE_POINTS = 480;
const MAX_HTML_DEPTH = 128;
const MAX_LINK_SCAN = 2_048;

const SECTION_HEADINGS = Object.freeze({
  scenarios: Object.freeze([
    "use cases",
    "who is this for",
    "examples",
    "business scenarios",
    "用途",
    "适用场景",
    "使用场景",
    "示例",
  ] as const),
  architecture: Object.freeze([
    "architecture",
    "design",
    "how it works",
    "internals",
    "架构",
    "设计",
    "工作原理",
    "实现原理",
  ] as const),
  securityPrivacy: Object.freeze([
    "security",
    "privacy",
    "permissions",
    "data handling",
    "安全",
    "隐私",
    "权限",
    "数据处理",
  ] as const),
  install: Object.freeze([
    "install",
    "installation",
    "setup",
    "安装",
    "配置环境",
  ] as const),
  run: Object.freeze([
    "usage",
    "run",
    "quick start",
    "使用",
    "运行",
    "快速开始",
  ] as const),
  develop: Object.freeze([
    "development",
    "develop",
    "开发",
    "二次开发",
  ] as const),
  test: Object.freeze(["test", "testing", "测试"] as const),
  build: Object.freeze(["build", "building", "构建"] as const),
});

type HeadingSection = keyof typeof SECTION_HEADINGS;
type ProseSection = "scenarios" | "architecture" | "securityPrivacy";
type MarkdownEvidenceSource = "readme" | "documentation";

const COMMAND_SECTION_KINDS: Readonly<
  Record<Exclude<HeadingSection, ProseSection>, ReaderCommandKind>
> = Object.freeze({
  install: "install",
  run: "run",
  develop: "develop",
  test: "test",
  build: "build",
});

const HEADING_LOOKUP = new Map<string, HeadingSection>();

for (const [section, headings] of Object.entries(SECTION_HEADINGS) as Array<
  [HeadingSection, readonly string[]]
>) {
  for (const heading of headings) {
    HEADING_LOOKUP.set(heading, section);
  }
}

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
const PACKAGE_MANAGER_SUBCOMMANDS = new Set([
  "add",
  "build",
  "ci",
  "dev",
  "exec",
  "install",
  "run",
  "serve",
  "start",
  "test",
]);
const GO_SUBCOMMANDS = new Set([
  "build",
  "generate",
  "install",
  "mod",
  "run",
  "test",
  "vet",
]);
const CARGO_SUBCOMMANDS = new Set(["build", "install", "run", "test"]);
const DOCKER_SUBCOMMANDS = new Set(["build", "compose", "exec", "run", "up"]);
const DOTNET_SUBCOMMANDS = new Set(["build", "run", "test"]);

interface FenceState {
  marker: "`" | "~";
  length: number;
  kind: ReaderCommandKind | null;
  indentedWrapper: boolean;
}

interface MarkdownContainerContent {
  content: string;
  overflow: boolean;
}

interface MarkdownHtmlView {
  value: string;
  malformed: boolean;
}

interface DoctypeState {
  internalSubset: boolean;
  quote: '"' | "'" | null;
}

interface HtmlBlockState {
  tag: string;
  depth: number;
}

interface HtmlToken {
  name: string;
  closing: boolean;
  selfClosing: boolean;
}

interface HtmlScanResult {
  tokens: HtmlToken[];
  hasComment: boolean;
  unclosedComment: boolean;
  malformedTag: boolean;
}

interface HeadingFrame {
  level: number;
  section: HeadingSection | null;
}

interface ParagraphState {
  section: ProseSection;
  parts: string[];
  codePoints: number;
  invalid: boolean;
}

export interface ReaderMarkdownEvidence {
  scenarios: ReaderTextFact[];
  architecture: ReaderTextFact[];
  securityPrivacy: ReaderTextFact[];
  commands: ReaderCommandFact[];
}

function emptyEvidence(): ReaderMarkdownEvidence {
  return {
    scenarios: [],
    architecture: [],
    securityPrivacy: [],
    commands: [],
  };
}

function markdownEvidenceSource(path: string): MarkdownEvidenceSource {
  const normalized = toPathComparisonKey(path);
  const slash = normalized.lastIndexOf("/");
  const directory = slash === -1 ? "" : normalized.slice(0, slash);
  const basename = slash === -1 ? normalized : normalized.slice(slash + 1);
  const preferredScope = directory === "" || directory === ".github";

  return preferredScope &&
    (basename === "readme" || basename.startsWith("readme."))
    ? "readme"
    : "documentation";
}

function containsUnsafeCodePoint(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0);

    if (
      point === undefined ||
      point <= 31 ||
      (point >= 127 && point <= 159) ||
      (point >= 0xd800 && point <= 0xdfff) ||
      point === 0x061c ||
      point === 0x200e ||
      point === 0x200f ||
      point === 0x2028 ||
      point === 0x2029 ||
      (point >= 0x202a && point <= 0x202e) ||
      (point >= 0x2066 && point <= 0x2069)
    ) {
      return true;
    }
  }

  return false;
}

function canonicalText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function headingName(value: string): string {
  return canonicalText(value)
    .replace(/\s+#+\s*$/u, "")
    .toLocaleLowerCase("en-US");
}

function isProseSection(section: HeadingSection): section is ProseSection {
  return (
    section === "scenarios" ||
    section === "architecture" ||
    section === "securityPrivacy"
  );
}

function activeSection(stack: readonly HeadingFrame[]): HeadingSection | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const section = stack[index]?.section;

    if (section !== null && section !== undefined) return section;
  }

  return null;
}

function parseAtxHeading(line: string): { level: number; name: string } | null {
  const match = /^ {0,3}(#{1,6})\s+(.+?)\s*$/u.exec(line);

  if (match === null) return null;
  return {
    level: match[1]?.length ?? 1,
    name: headingName(match[2] ?? ""),
  };
}

function setextLevel(line: string): 1 | 2 | null {
  if (/^ {0,3}=+\s*$/u.test(line)) return 1;
  if (/^ {0,3}-+\s*$/u.test(line)) return 2;
  return null;
}

function parseFence(line: string): FenceState | null {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
  const markerRun = match?.[1];

  if (markerRun === undefined) return null;
  return {
    marker: markerRun[0] as "`" | "~",
    length: markerRun.length,
    kind: null,
    indentedWrapper: false,
  };
}

function closesFence(line: string, fence: FenceState): boolean {
  const match = /^ {0,3}(`+|~+)\s*$/u.exec(line);
  const markerRun = match?.[1];

  return (
    markerRun !== undefined &&
    markerRun[0] === fence.marker &&
    markerRun.length >= fence.length
  );
}

function startsRawUri(value: string, index: number): boolean {
  const previous = value[index - 1];

  if (previous !== undefined && /[A-Za-z0-9_]/u.test(previous)) return false;

  const remainder = value.slice(index, index + 64);

  return (
    /^[A-Za-z][A-Za-z0-9+.-]{0,31}:\/\/[^\s<>]/u.test(remainder) ||
    /^\/\/[A-Za-z0-9]/u.test(remainder) ||
    /^www\.[A-Za-z0-9]/iu.test(remainder)
  );
}

function skipRawUri(value: string, start: number): number {
  let index = start;

  while (index < value.length) {
    const character = value[index];

    if (
      character === undefined ||
      /\s/u.test(character) ||
      character === "<" ||
      character === ">"
    ) {
      break;
    }
    index += 1;
  }

  return index;
}

function containsRawUri(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (startsRawUri(value, index)) return true;
  }

  return false;
}

function closingBracket(
  value: string,
  start: number,
  delimiter: string,
): number {
  const maximum = Math.min(value.length, start + MAX_LINK_SCAN);

  for (let index = start; index < maximum; index += 1) {
    if (value[index] === "\\") {
      index += 1;
    } else if (value[index] === delimiter) {
      return index;
    }
  }

  return -1;
}

function closingDestination(value: string, start: number): number {
  const maximum = Math.min(value.length, start + MAX_LINK_SCAN);
  let depth = 1;
  let quote: '"' | "'" | null = null;

  for (let index = start + 1; index < maximum; index += 1) {
    const character = value[index];

    if (character === "\\") {
      index += 1;
    } else if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "(") {
      depth += 1;
      if (depth > MAX_HTML_DEPTH) return -1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function markdownHtmlView(value: string): MarkdownHtmlView {
  const visible: string[] = [];
  let malformed = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (value.startsWith("<![CDATA[", index)) {
      visible.push("<![CDATA[");
      index += 8;
      continue;
    }
    if (character === "`") {
      let runEnd = index + 1;
      while (value[runEnd] === "`") runEnd += 1;
      const marker = value.slice(index, runEnd);
      const closing = value.indexOf(marker, runEnd);

      if (closing === -1) {
        malformed = true;
        break;
      }
      index = closing + marker.length - 1;
      continue;
    }
    if (character === "[") {
      const labelEnd = closingBracket(value, index + 1, "]");

      if (labelEnd === -1) {
        malformed = true;
        break;
      }
      if (value[labelEnd + 1] === "(") {
        const destinationEnd = closingDestination(value, labelEnd + 1);

        if (destinationEnd === -1) {
          malformed = true;
          break;
        }
        index = destinationEnd;
        continue;
      }
      if (value[labelEnd + 1] === "[") {
        const referenceEnd = closingBracket(value, labelEnd + 2, "]");

        if (referenceEnd === -1) {
          malformed = true;
          break;
        }
        index = referenceEnd;
        continue;
      }
    }
    if (character !== undefined) visible.push(character);
  }

  return { value: visible.join(""), malformed };
}

function isTableOfContentsLink(value: string): boolean {
  return (
    /^\s*\[[^\]\n]{1,256}\]\(\s*#[^)\n]+\)\s*$/u.test(value) ||
    /^\s*\[[^\]\n]{1,256}\]\[[^\]\n]{0,256}\]\s*$/u.test(value)
  );
}

function isReferenceDefinition(value: string): boolean {
  return /^ {0,3}\[[^\]\n]{1,256}\]:\s*\S+/u.test(value);
}

function visibleProse(value: string): string | null {
  const htmlView = markdownHtmlView(value);

  if (
    htmlView.malformed ||
    isTableOfContentsLink(value) ||
    isReferenceDefinition(value) ||
    value.includes("![") ||
    value.includes("`") ||
    htmlView.value.includes("<") ||
    htmlView.value.includes(">") ||
    containsUnsafeCodePoint(value)
  ) {
    return null;
  }

  const visible: string[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === undefined) return null;
    if (character === "\\") {
      const escaped = value[index + 1];
      if (escaped === undefined) return null;
      visible.push(escaped);
      index += 1;
      continue;
    }
    if (startsRawUri(value, index)) {
      index = skipRawUri(value, index) - 1;
      continue;
    }
    if (character === "[") {
      const labelEnd = closingBracket(value, index + 1, "]");

      if (labelEnd === -1) return null;
      const label = value.slice(index + 1, labelEnd);
      const next = value[labelEnd + 1];
      const safeLabel =
        !containsRawUri(label) &&
        !/[<>]/u.test(label) &&
        !containsUnsafeCodePoint(label) &&
        !containsCredentialLikeValue(label);

      if (next === "(") {
        const destinationEnd = closingDestination(value, labelEnd + 1);
        if (destinationEnd === -1) return null;
        if (safeLabel) visible.push(label);
        index = destinationEnd;
        continue;
      }
      if (next === "[") {
        const referenceEnd = closingBracket(value, labelEnd + 2, "]");
        if (referenceEnd === -1) return null;
        if (safeLabel) visible.push(label);
        index = referenceEnd;
        continue;
      }
    }
    if (character === "*" || character === "_" || character === "~") {
      continue;
    }
    visible.push(character);
  }

  const text = visible.join("").replace(/\s+/gu, " ").trim();

  if (
    text.length === 0 ||
    Array.from(text).length > MAX_PROSE_CODE_POINTS ||
    !/[\p{L}\p{N}]/u.test(text) ||
    containsCredentialLikeValue(text)
  ) {
    return null;
  }

  return text;
}

function listItem(line: string): string | null {
  return /^ {0,3}(?:[-+*]|\d+[.)])\s+(.+)$/u.exec(line)?.[1] ?? null;
}

function isTableLine(line: string): boolean {
  return line.includes("|");
}

function inlineCommands(line: string): string[] {
  const commands: string[] = [];
  const expression = /`([^`\n]+)`/gu;

  for (const match of line.matchAll(expression)) {
    const command = match[1];
    if (command !== undefined) commands.push(command);
  }

  return commands;
}

function looksLikeDocumentedCommand(line: string): boolean {
  const normalized = line
    .normalize("NFKC")
    .trim()
    .replace(/^[$>](?:\s+|$)/u, "")
    .trim();
  const tokens = normalized.split(/\s+/u);
  const firstToken = tokens[0] ?? "";
  const executable = firstToken.replace(/^\.\//u, "").split("/").at(-1);
  const argument = tokens[1];

  if (executable === undefined || argument === undefined) return false;
  if (["bun", "npm", "pnpm", "yarn"].includes(executable)) {
    return PACKAGE_MANAGER_SUBCOMMANDS.has(argument);
  }
  if (executable === "go") return GO_SUBCOMMANDS.has(argument);
  if (executable === "cargo") return CARGO_SUBCOMMANDS.has(argument);
  if (executable === "docker") return DOCKER_SUBCOMMANDS.has(argument);
  if (executable === "docker-compose") {
    return DOCKER_SUBCOMMANDS.has(argument);
  }
  if (executable === "dotnet") return DOTNET_SUBCOMMANDS.has(argument);
  if (executable === "node") return /^-|\.(?:cjs|js|mjs)$/u.test(argument);
  if (executable === "python" || executable === "python3") {
    return /^-|\.pyw?$/u.test(argument);
  }

  return ["chmod", "curl", "dd", "mkfs", "npx", "rm", "sudo", "wget"].includes(
    executable,
  );
}

function markdownContainerContent(line: string): MarkdownContainerContent {
  let content = line.replace(/^ {0,3}/u, "");

  for (let depth = 0; depth < 16; depth += 1) {
    const quote = /^>\s?/u.exec(content)?.[0];
    const list = /^(?:[-+*]|\d+[.)])\s+/u.exec(content)?.[0];
    const prefix = quote ?? list;

    if (prefix === undefined) {
      return { content: content.trimStart(), overflow: false };
    }
    content = content.slice(prefix.length).replace(/^ {0,3}/u, "");
  }

  const overflow =
    /^>\s?/u.test(content) || /^(?:[-+*]|\d+[.)])\s+/u.test(content);

  return { content: content.trimStart(), overflow };
}

function scanDoctypeBoundary(
  value: string,
  start: number,
  initial: DoctypeState,
): { end: number; state: DoctypeState } {
  const state = { ...initial };

  for (let index = start; index < value.length; index += 1) {
    const character = value[index];

    if (state.quote !== null) {
      if (character === state.quote) state.quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      state.quote = character;
      continue;
    }
    if (character === "[") {
      state.internalSubset = true;
      continue;
    }
    if (state.internalSubset && value.startsWith("]>", index)) {
      return { end: index + 2, state };
    }
    if (!state.internalSubset && character === ">") {
      return { end: index + 1, state };
    }
  }

  return { end: -1, state };
}

function scanHtmlSyntax(value: string): HtmlScanResult {
  const result: HtmlScanResult = {
    tokens: [],
    hasComment: false,
    unclosedComment: false,
    malformedTag: false,
  };

  for (let index = 0; index < value.length; index += 1) {
    if (value.startsWith("<!--", index)) {
      result.hasComment = true;
      const closing = value.indexOf("-->", index + 4);

      if (closing === -1) {
        result.unclosedComment = true;
        return result;
      }
      index = closing + 2;
      continue;
    }
    if (value[index] !== "<") continue;

    let cursor = index + 1;
    let closing = false;

    if (value[cursor] === "/") {
      closing = true;
      cursor += 1;
    }
    const nameStart = cursor;
    while (/[A-Za-z0-9-]/u.test(value[cursor] ?? "")) cursor += 1;
    const rawName = value.slice(nameStart, cursor);

    if (!/^[A-Za-z][A-Za-z0-9-]*$/u.test(rawName)) continue;
    if (!/[\s/>]/u.test(value[cursor] ?? "")) continue;

    let quote: '"' | "'" | null = null;
    let tagEnd = -1;

    for (; cursor < value.length; cursor += 1) {
      const character = value[cursor];

      if (quote !== null) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        tagEnd = cursor;
        break;
      }
    }

    if (tagEnd === -1 || quote !== null) {
      result.malformedTag = true;
      return result;
    }

    let beforeEnd = tagEnd - 1;
    while (/\s/u.test(value[beforeEnd] ?? "")) beforeEnd -= 1;
    result.tokens.push({
      name: rawName.toLocaleLowerCase("en-US"),
      closing,
      selfClosing: value[beforeEnd] === "/",
    });
    index = tagEnd;
  }

  return result;
}

function htmlDepthDelta(tokens: readonly HtmlToken[], tag: string): number {
  return tokens.reduce((delta, token) => {
    if (token.name !== tag || token.selfClosing) return delta;
    return delta + (token.closing ? -1 : 1);
  }, 0);
}

/** Extracts bounded reader prose and commands without parsing or executing Markdown. */
export function extractReaderMarkdownEvidence(
  file: FetchedTextFile | undefined,
): ReaderMarkdownEvidence {
  if (
    file === undefined ||
    file.category !== "documentation" ||
    !isSafeProjectBriefPath(file.path) ||
    new TextEncoder().encode(file.text).byteLength > MAX_MARKDOWN_BYTES
  ) {
    return emptyEvidence();
  }

  const source = markdownEvidenceSource(file.path);
  const evidence = emptyEvidence();
  const seen = {
    scenarios: new Set<string>(),
    architecture: new Set<string>(),
    securityPrivacy: new Set<string>(),
  };
  const caps: Readonly<Record<ProseSection, number>> = {
    scenarios: 3,
    architecture: 2,
    securityPrivacy: 3,
  };
  const commands = new Map<ReaderCommandKind, ReaderCommandFact>();
  const headings: HeadingFrame[] = [];
  const lines = file.text.split(/\r?\n/u);
  let paragraph: ParagraphState | null = null;
  let fence: FenceState | null = null;
  let inHtmlComment = false;
  let inCdata = false;
  let inProcessingInstruction = false;
  let inDeclaration = false;
  let doctype: DoctypeState | null = null;
  let htmlBlock: HtmlBlockState | null = null;
  let malformedBlock = false;

  const addProse = (section: ProseSection, candidate: string): void => {
    const text = visibleProse(candidate);

    if (text === null || evidence[section].length >= caps[section]) return;
    const key = canonicalText(text);
    if (seen[section].has(key)) return;
    seen[section].add(key);
    evidence[section].push({ source, path: file.path, text });
  };

  const flushParagraph = (): void => {
    if (
      paragraph !== null &&
      !paragraph.invalid &&
      paragraph.parts.length > 0
    ) {
      addProse(paragraph.section, paragraph.parts.join(" "));
    }
    paragraph = null;
  };

  const addParagraphLine = (section: ProseSection, line: string): void => {
    const text = visibleProse(line);

    if (paragraph === null || paragraph.section !== section) {
      flushParagraph();
      paragraph = { section, parts: [], codePoints: 0, invalid: false };
    }
    if (text === null) {
      paragraph.invalid = true;
      paragraph.parts = [];
      return;
    }
    const added =
      Array.from(text).length + (paragraph.parts.length > 0 ? 1 : 0);
    paragraph.codePoints += added;
    if (paragraph.codePoints > MAX_PROSE_CODE_POINTS) {
      paragraph.invalid = true;
      paragraph.parts = [];
      return;
    }
    if (!paragraph.invalid) paragraph.parts.push(text);
  };

  const addCommand = (kind: ReaderCommandKind, candidate: string): void => {
    const normalized = candidate
      .normalize("NFKC")
      .trim()
      .replace(/^[$>](?:\s+|$)/u, "")
      .trim();

    if (
      commands.has(kind) ||
      normalized.startsWith("#") ||
      /^(?:`{3,}|~{3,})/u.test(normalized)
    ) {
      return;
    }
    const disposition = commandDisposition(candidate);
    commands.set(kind, {
      source,
      path: file.path,
      kind,
      command: disposition === "withheld" ? null : normalized,
      disposition,
    });
  };

  const enterHeading = (level: number, name: string): void => {
    flushParagraph();
    while ((headings.at(-1)?.level ?? 0) >= level) headings.pop();
    headings.push({ level, section: HEADING_LOOKUP.get(name) ?? null });
  };

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index] ?? "";
    let trimmed = line.trim();

    if (fence !== null) {
      if (
        closesFence(line, fence) ||
        (fence.indentedWrapper && closesFence(trimmed, fence))
      ) {
        fence = null;
      } else if (fence.kind !== null && trimmed.length > 0) {
        addCommand(fence.kind, trimmed);
      }
      continue;
    }
    let hiddenContinuation = false;

    if (inCdata) {
      const closing = line.indexOf("]]>");

      if (closing === -1) continue;
      inCdata = false;
      line = line.slice(closing + 3);
      hiddenContinuation = true;
    }
    if (doctype !== null) {
      const boundary = scanDoctypeBoundary(line, 0, doctype);

      if (boundary.end === -1) {
        doctype = boundary.state;
        continue;
      }
      doctype = null;
      line = line.slice(boundary.end);
      hiddenContinuation = true;
    }
    if (inProcessingInstruction) {
      const closing = line.indexOf("?>");

      if (closing === -1) continue;
      inProcessingInstruction = false;
      line = line.slice(closing + 2);
      hiddenContinuation = true;
    }
    if (inDeclaration) {
      const closing = line.indexOf(">");

      if (closing === -1) continue;
      inDeclaration = false;
      line = line.slice(closing + 1);
      hiddenContinuation = true;
    }
    if (inHtmlComment) {
      const closing = line.indexOf("-->");

      if (closing === -1) continue;
      inHtmlComment = false;
      line = line.slice(closing + 3);
      hiddenContinuation = true;
    }
    trimmed = line.trim();

    if (htmlBlock !== null) {
      const html = scanHtmlSyntax(line);

      if (html.malformedTag) malformedBlock = true;
      htmlBlock.depth += htmlDepthDelta(html.tokens, htmlBlock.tag);
      if (htmlBlock.depth > MAX_HTML_DEPTH) malformedBlock = true;
      if (htmlBlock.depth <= 0) htmlBlock = null;
      if (html.unclosedComment) inHtmlComment = true;
      continue;
    }
    if (!hiddenContinuation) {
      const indentedFence = /^ {4}/u.test(line) ? parseFence(trimmed) : null;
      if (indentedFence !== null) {
        flushParagraph();
        indentedFence.indentedWrapper = true;
        fence = indentedFence;
        continue;
      }

      const openingFence = parseFence(line);
      if (openingFence !== null) {
        flushParagraph();
        const section = activeSection(headings);
        openingFence.kind =
          section !== null && !isProseSection(section)
            ? COMMAND_SECTION_KINDS[section]
            : null;
        fence = openingFence;
        continue;
      }
    }
    const container = markdownContainerContent(line);

    if (container.overflow) {
      flushParagraph();
      malformedBlock = true;
      continue;
    }
    const structural = container.content;
    const structuralHtmlView = markdownHtmlView(structural);

    if (structuralHtmlView.malformed) {
      flushParagraph();
      malformedBlock = true;
      continue;
    }
    const structuralView = structuralHtmlView.value;

    if (structuralView.startsWith("<![CDATA[")) {
      flushParagraph();
      if (!structuralView.slice(9).includes("]]>")) inCdata = true;
      continue;
    }
    const doctypeOpening = /^<!DOCTYPE(?:\s|>)/iu.exec(structuralView);
    if (doctypeOpening !== null) {
      flushParagraph();
      const boundary = scanDoctypeBoundary(
        structuralView,
        doctypeOpening[0].length,
        { internalSubset: false, quote: null },
      );

      if (boundary.end === -1) doctype = boundary.state;
      continue;
    }
    if (structuralView.startsWith("<?")) {
      flushParagraph();
      if (!structuralView.slice(2).includes("?>")) {
        inProcessingInstruction = true;
      }
      continue;
    }
    if (/^<![A-Z]/u.test(structuralView)) {
      flushParagraph();
      if (!structuralView.slice(2).includes(">")) inDeclaration = true;
      continue;
    }
    const html = scanHtmlSyntax(structuralView);
    if (structuralView.startsWith("<")) {
      flushParagraph();
      const structuralHtml = html;
      const opening = structuralHtml.tokens.find(
        (token) =>
          !token.closing &&
          !token.selfClosing &&
          !VOID_HTML_TAGS.has(token.name),
      );

      if (structuralHtml.malformedTag) malformedBlock = true;
      if (opening !== undefined) {
        const depth = htmlDepthDelta(structuralHtml.tokens, opening.name);
        if (depth > 0) htmlBlock = { tag: opening.name, depth };
      }
      if (structuralHtml.unclosedComment) inHtmlComment = true;
      continue;
    }
    if (html.hasComment) {
      flushParagraph();
      if (html.unclosedComment) inHtmlComment = true;
      continue;
    }
    if (hiddenContinuation) {
      flushParagraph();
      continue;
    }

    const atxHeading = parseAtxHeading(line);
    if (atxHeading !== null) {
      enterHeading(atxHeading.level, atxHeading.name);
      continue;
    }

    const nextLine = lines[index + 1];
    const underlineLevel =
      nextLine === undefined ? null : setextLevel(nextLine);
    if (trimmed.length > 0 && underlineLevel !== null) {
      enterHeading(underlineLevel, headingName(trimmed));
      index += 1;
      continue;
    }

    const section = activeSection(headings);
    if (trimmed.length === 0) {
      flushParagraph();
      continue;
    }
    if (section === null) {
      flushParagraph();
      continue;
    }
    if (!isProseSection(section)) {
      flushParagraph();
      const kind = COMMAND_SECTION_KINDS[section];
      const inline = inlineCommands(line);

      for (const command of inline) addCommand(kind, command);
      if (
        inline.length === 0 &&
        (/^(?: {4}| {0,3}[$>](?:\s|$))/u.test(line) ||
          looksLikeDocumentedCommand(line) ||
          containsCredentialLikeValue(trimmed))
      ) {
        addCommand(kind, trimmed);
      }
      continue;
    }
    if (
      isTableLine(line) ||
      isReferenceDefinition(line) ||
      trimmed.startsWith("![") ||
      trimmed.startsWith("<") ||
      trimmed.includes("`") ||
      /^(?: {4}|\t)/u.test(line)
    ) {
      flushParagraph();
      continue;
    }

    const item = listItem(line);
    if (item !== null) {
      flushParagraph();
      addProse(section, item);
    } else {
      addParagraphLine(section, line);
    }
  }

  flushParagraph();
  if (
    fence !== null ||
    inHtmlComment ||
    inCdata ||
    inProcessingInstruction ||
    inDeclaration ||
    doctype !== null ||
    htmlBlock !== null ||
    malformedBlock
  ) {
    return emptyEvidence();
  }

  evidence.commands = READER_COMMAND_KINDS.flatMap((kind) => {
    const fact = commands.get(kind);
    return fact === undefined ? [] : [fact];
  });
  return evidence;
}
