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
import {
  documentedCommandKind,
  documentedCommandDisposition,
  isDocumentedRuntimeRequirement,
} from "./commands";
import {
  README_PROFILE_CAPS,
  isCanonicalReadmePath,
  normalizeReadmeHeading,
  readmeCommandKind,
  readmeLegacySection,
  readmeProfileSection,
  type ReadmeLegacySection,
  type ReadmeProfileSection,
} from "./readme-policy";

const MAX_MARKDOWN_BYTES = 256 * 1024;
const MAX_PROSE_CODE_POINTS = 480;
const MAX_HTML_DEPTH = 128;
const MAX_LINK_SCAN = 2_048;
const MAX_INLINE_CODE_SPANS = 64;
const MAX_INLINE_CODE_POINTS = 480;
const MAX_INLINE_CODE_SOURCE_UNITS = 4_096;

export const READER_MARKDOWN_PENDING_CAPABILITY_LIMITS = Object.freeze({
  maxGroups: 128,
  maxFactsPerGroup: 64,
  maxFactsTotal: 8_192,
} as const);

type ProseSection = ReadmeLegacySection;
type ProfileTextSection = Exclude<ReadmeProfileSection, "capabilities">;
type MarkdownEvidenceSource = "readme" | "documentation";

const PRE_CAPABILITY_FACT_CAP =
  README_PROFILE_CAPS.overview +
  README_PROFILE_CAPS.audiences +
  README_PROFILE_CAPS.problems +
  README_PROFILE_CAPS.useCases;
const CAPABILITY_KEY_CAP =
  README_PROFILE_CAPS.capabilityGroups *
  (README_PROFILE_CAPS.capabilityFacts + 1);
const WORKFLOW_CANDIDATE_CAP =
  PRE_CAPABILITY_FACT_CAP + CAPABILITY_KEY_CAP + README_PROFILE_CAPS.workflow;
const DEPENDENCY_CANDIDATE_CAP =
  WORKFLOW_CANDIDATE_CAP + README_PROFILE_CAPS.dependencies;
const LIMITATION_CANDIDATE_CAP =
  DEPENDENCY_CANDIDATE_CAP + README_PROFILE_CAPS.limitations;
const PROFILE_CANDIDATE_CAPS = Object.freeze({
  overview: README_PROFILE_CAPS.overview * 4,
  audiences: README_PROFILE_CAPS.audiences * 4,
  problems: README_PROFILE_CAPS.problems * 4,
  useCases: README_PROFILE_CAPS.useCases * 4,
  workflow: WORKFLOW_CANDIDATE_CAP,
  dependencies: DEPENDENCY_CANDIDATE_CAP,
  limitations: LIMITATION_CANDIDATE_CAP,
  maturity: LIMITATION_CANDIDATE_CAP + README_PROFILE_CAPS.maturity,
} as const satisfies Readonly<Record<ProfileTextSection, number>>);
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
  commandPriority: number;
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
  profileSection: ReadmeProfileSection | null;
  legacySection: ProseSection | null;
  commandKind: ReaderCommandKind | null;
  commandPriority: number;
  label: string | null;
}

interface InlineCodeView {
  value: string;
  spans: string[];
}

interface ParagraphState {
  legacySection: ProseSection | null;
  profileSection: ProfileTextSection | null;
  capabilityLabel: string | null;
  fallback: boolean;
  parts: string[];
  codePoints: number;
  invalid: boolean;
}

export interface ReaderMarkdownReadmeEvidence {
  overview: ReaderTextFact[];
  audiences: ReaderTextFact[];
  problems: ReaderTextFact[];
  useCases: ReaderTextFact[];
  capabilityGroups: Array<{ label: string; facts: ReaderTextFact[] }>;
  workflow: ReaderTextFact[];
  dependencies: ReaderTextFact[];
  limitations: ReaderTextFact[];
  maturity: ReaderTextFact[];
}

export interface ReaderMarkdownEvidence {
  scenarios: ReaderTextFact[];
  architecture: ReaderTextFact[];
  securityPrivacy: ReaderTextFact[];
  commands: ReaderCommandFact[];
  readme: ReaderMarkdownReadmeEvidence;
}

interface PendingCapabilityGroup {
  label: string;
  labelKey: string;
  factKeys: Set<string>;
  firstFactIndex: number;
  lastFactIndex: number;
}

interface PendingCapabilityFact {
  text: string;
  textKey: string;
  nextFactIndex: number;
}

export interface ReaderMarkdownExtractionOptions {
  readonly scenarioExclusions?: ReadonlySet<string>;
}

function emptyEvidence(): ReaderMarkdownEvidence {
  return {
    scenarios: [],
    architecture: [],
    securityPrivacy: [],
    commands: [],
    readme: {
      overview: [],
      audiences: [],
      problems: [],
      useCases: [],
      capabilityGroups: [],
      workflow: [],
      dependencies: [],
      limitations: [],
      maturity: [],
    },
  };
}

function markdownEvidenceSource(path: string): MarkdownEvidenceSource {
  return isCanonicalReadmePath(path) ? "readme" : "documentation";
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
  return normalizeReadmeHeading(value);
}

function activeLegacySection(
  stack: readonly HeadingFrame[],
): ProseSection | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const section = stack[index]?.legacySection;

    if (section !== null && section !== undefined) return section;
  }

  return null;
}

const BROAD_COMMAND_HEADINGS = new Set([
  "usage",
  "quick start",
  "使用",
  "快速开始",
]);

function activeCommandContext(
  stack: readonly HeadingFrame[],
): { kind: ReaderCommandKind; priority: number } | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const frame = stack[index];
    const kind = frame?.commandKind;

    if (kind !== null && kind !== undefined) {
      return {
        kind,
        priority: frame?.commandPriority ?? 1,
      };
    }
  }

  return null;
}

function activeProfileContext(stack: readonly HeadingFrame[]): {
  section: ReadmeProfileSection;
  capabilityLabel: string | null;
} | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const frame = stack[index];

    if (frame?.profileSection !== "capabilities") continue;
    const nested = stack.at(-1);
    return {
      section: "capabilities",
      capabilityLabel:
        nested !== undefined && nested.level > frame.level
          ? nested.label
          : frame.label,
    };
  }

  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const frame = stack[index];

    if (frame?.profileSection === null || frame?.profileSection === undefined) {
      continue;
    }
    return { section: frame.profileSection, capabilityLabel: null };
  }

  return null;
}

function safeHeadingLabel(value: string): string | null {
  return visibleProfileProse(value.replace(/\s+#+\s*$/u, "").trim());
}

function parseAtxHeading(
  line: string,
): { level: number; name: string; label: string | null } | null {
  const match = /^ {0,3}(#{1,6})\s+(.+?)\s*$/u.exec(line);

  if (match === null) return null;
  const value = match[2] ?? "";
  const label = safeHeadingLabel(value);
  return {
    level: match[1]?.length ?? 1,
    name: label === null ? "" : headingName(label),
    label,
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
    commandPriority: 0,
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
  const inlineHtml = scanHtmlSyntax(htmlView.value);

  if (
    htmlView.malformed ||
    isTableOfContentsLink(value) ||
    isReferenceDefinition(value) ||
    value.includes("![") ||
    value.includes("`") ||
    inlineHtml.tokens.length > 0 ||
    inlineHtml.hasComment ||
    inlineHtml.malformedTag ||
    htmlView.value.includes("<!") ||
    htmlView.value.includes("<?") ||
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

function containsMarkdownLink(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "[") continue;
    const labelEnd = closingBracket(value, index + 1, "]");

    if (labelEnd === -1) return true;
    if (value[labelEnd + 1] === "(" || value[labelEnd + 1] === "[") {
      return true;
    }
    index = labelEnd;
  }

  return false;
}

function closingBacktickRun(
  value: string,
  marker: string,
  start: number,
): number {
  let candidate = value.indexOf(marker, start);

  while (candidate >= 0) {
    if (
      value[candidate - 1] !== "`" &&
      value[candidate + marker.length] !== "`"
    ) {
      return candidate;
    }
    candidate = value.indexOf(marker, candidate + marker.length);
  }

  return -1;
}

function escapeMarkdownLiteral(value: string): string {
  return value.replace(/[\\*_~]/gu, "\\$&");
}

function inlineCodeView(value: string): InlineCodeView | null {
  if (value.length > MAX_INLINE_CODE_SOURCE_UNITS) return null;
  const visible: string[] = [];
  const spans: string[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== "`") {
      if (character !== undefined) visible.push(character);
      continue;
    }

    let runEnd = index + 1;
    while (value[runEnd] === "`") runEnd += 1;
    const marker = value.slice(index, runEnd);
    const closing = closingBacktickRun(value, marker, runEnd);

    if (closing < 0 || spans.length >= MAX_INLINE_CODE_SPANS) return null;
    const rawSpan = value.slice(runEnd, closing);
    const span = rawSpan.trim();
    if (span.length === 0 || Array.from(span).length > MAX_INLINE_CODE_POINTS) {
      return null;
    }
    visible.push(escapeMarkdownLiteral(span));
    spans.push(span);
    index = closing + marker.length - 1;
  }

  return { value: visible.join(""), spans };
}

function visibleProfileProse(value: string): string | null {
  const normalized = value.normalize("NFKC");

  for (const view of [value, normalized]) {
    if (
      containsMarkdownLink(view) ||
      containsRawUri(view) ||
      isReferenceDefinition(view)
    ) {
      return null;
    }
  }

  const originalInline = inlineCodeView(value);
  const normalizedInline = inlineCodeView(normalized);
  if (originalInline === null || normalizedInline === null) return null;

  const normalizedVisible = visibleProse(normalizedInline.value);
  if (normalizedVisible === null) return null;

  const visible =
    normalized === value
      ? normalizedVisible
      : visibleProse(originalInline.value);
  if (visible === null) return null;
  for (const view of [visible, visible.normalize("NFKC")]) {
    if (
      containsMarkdownLink(view) ||
      containsRawUri(view) ||
      isReferenceDefinition(view)
    ) {
      return null;
    }
  }

  return visible;
}

function tableParts(line: string): string[] | null {
  if (!line.includes("|") || line.includes("||")) return null;

  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  const parts: string[] = [];
  let part = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === undefined) return null;

    if (character === "\\") {
      const next = value[index + 1];
      if (next === undefined) return null;
      part += character + next;
      index += 1;
      continue;
    }
    if (character === "|") {
      parts.push(part);
      part = "";
      if (parts.length > 2) return null;
      continue;
    }
    part += character;
  }
  parts.push(part);

  return parts.length === 2 ? parts : null;
}

function isTwoCellTableSeparator(line: string): boolean {
  const parts = tableParts(line);
  return (
    parts !== null && parts.every((part) => /^\s*:?-{3,}:?\s*$/u.test(part))
  );
}

function twoCellTableFact(line: string): string | null {
  const parts = tableParts(line);
  if (parts === null || isTwoCellTableSeparator(line)) return null;
  const visible = parts.map(visibleProfileProse);
  const left = visible[0];
  const right = visible[1];

  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined
  ) {
    return null;
  }

  return visibleProfileProse(`${left} — ${right}`);
}

function inlineCommands(line: string): string[] {
  return inlineCodeView(line)?.spans ?? [];
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

function looksLikeFallbackOrientation(line: string): boolean {
  const text = visibleProfileProse(line);

  if (
    text === null ||
    Array.from(text).length < 20 ||
    isTableLine(line) ||
    listItem(line) !== null ||
    /^(?:v?\d+(?:\.\d+){1,3}|release\b|changelog\b)/iu.test(text) ||
    /^(?:[$>](?:\s|$)|npm\b|pnpm\b|yarn\b|bun\b|cargo\b|go\b|docker\b)/iu.test(
      text,
    )
  ) {
    return false;
  }

  return (
    /\b(?:application|framework|library|platform|project|repository|service|tool|workspace)\b/iu.test(
      text,
    ) || /(?:应用|工具|平台|项目|服务|框架|用于|帮助|是一个)/u.test(text)
  );
}

type RoutedNarrativeSection =
  "audiences" | "problems" | "useCases" | "limitations";

function isContributionInvitation(text: string): boolean {
  const normalized = canonicalText(text).toLocaleLowerCase("en-US");

  return (
    /(?:参与|贡献)(?:这个|本|该)?项目|欢迎.{0,24}(?:贡献|提交)|提交.{0,16}(?:issue|pull request|pr)/iu.test(
      normalized,
    ) ||
    /\b(?:contribut(?:e|ing|ion)|open (?:an )?(?:issue|pull request)|submit (?:an )?(?:issue|pull request))\b/u.test(
      normalized,
    )
  );
}

function isPureProfileLeadIn(text: string): boolean {
  const normalized = canonicalText(text).toLocaleLowerCase("en-US");

  if (!/[:：]$/u.test(normalized) || Array.from(normalized).length > 120) {
    return false;
  }

  return (
    /^(?:(?:它|其|本项目|该项目|这个项目|项目)的?)?(?:核心|主要|关键)?(?:做法|能力|功能|特性|特点|流程|内容|方向|产品判断)(?:是|包括|如下)[:：]$/u.test(
      normalized,
    ) ||
    /^(?:如果|若).*(?:如下|下面|这类|这些).*[:：]$/u.test(normalized) ||
    /^(?:the )?(?:core |main |key )?(?:approach|capabilities|features|workflow|contents?|direction)(?: is| are| include| includes| as follows)?\s*[:：]$/u.test(
      normalized,
    ) ||
    /^(?:本|该|这个)?项目采用.{0,24}(?:授权|许可)(?:模式|方式)[:：]$/u.test(
      normalized,
    ) ||
    /^(?:先|首先)?(?:复制|创建|配置).{0,60}(?:示例|配置|环境变量|文件)[:：]$/u.test(
      normalized,
    ) ||
    /^(?:the )?(?:license|licensing) (?:model|mode) (?:is|includes)\s*[:：]$/u.test(
      normalized,
    ) ||
    /^(?:first,?\s*)?(?:copy|create|configure).{0,60}(?:example|configuration|environment variables?|files?)\s*[:：]$/u.test(
      normalized,
    )
  );
}

function isDocumentationPointer(text: string): boolean {
  const normalized = canonicalText(text).toLocaleLowerCase("en-US");

  return (
    /^(?:更多|更细|详情|详细|请|可以).{0,40}(?:参阅|查看|阅读|看).{0,80}(?:文档|说明|readme|docs?\/)/iu.test(
      normalized,
    ) ||
    /^(?:for (?:more|further) (?:details|information)|see|read|learn more).{0,100}(?:documentation|docs?\/|readme)/u.test(
      normalized,
    )
  );
}

function isExplicitLimitation(text: string): boolean {
  const normalized = canonicalText(text).toLocaleLowerCase("en-US");

  return (
    /(?:不|并不|并非|不是)(?:适合|适用|推荐|建议)(?:用于|作为)?|不面向/u.test(
      normalized,
    ) ||
    /(?:需要|要求).{0,32}(?:网络|联网|代理|镜像)|(?:网络|联网).{0,32}(?:需要|要求|受限)|(?:无法|不能).{0,24}(?:访问|连接|下载)/u.test(
      normalized,
    ) ||
    /(?:须|需要|必须).{0,24}(?:商业授权|商业许可)|功能边界.{0,20}(?:演化|变化)|持续(?:快速)?迭代/u.test(
      normalized,
    ) ||
    /\bnot (?:designed|intended|suitable|recommended) for\b/u.test(
      normalized,
    ) ||
    /\b(?:not for|should not be used for|do not use (?:it )?for)\b/u.test(
      normalized,
    ) ||
    /\brequires?.{0,32}(?:network|internet) access\b|\b(?:network|internet) access (?:is )?required\b/u.test(
      normalized,
    ) ||
    /\bcannot (?:access|connect|download)\b|\bcommercial (?:license|authorization) (?:is )?required\b/u.test(
      normalized,
    ) ||
    /\b(?:rapidly evolving|under active development)\b/u.test(normalized)
  );
}

function routedNarrativeSection(text: string): RoutedNarrativeSection | null {
  const normalized = canonicalText(text).toLocaleLowerCase("en-US");

  if (isExplicitLimitation(text)) return "limitations";

  if (
    /(?:适合|面向|目标用户|目标人群|适用人群)/u.test(normalized) ||
    /\b(?:built|designed|intended) for\b/u.test(normalized) ||
    /\btarget (?:audience|users?)\b/u.test(normalized)
  ) {
    return "audiences";
  }
  if (
    /(?:如果你想|如果你需要|想验证|想研究|适用于|使用场景)/u.test(normalized) ||
    /^(?:想|希望)(?:把|将|通过)/u.test(normalized) ||
    /\b(?:when to use|if you (?:want|need)|use cases?)\b/u.test(normalized)
  ) {
    return "useCases";
  }
  if (
    /(?:痛点|难以|困难|解决(?:了|的)?(?:问题|难题)|容易[^。！？]{0,40}(?:失败|冲突|失控|发散|偏离|混乱)|越[^。！？]{0,16}越(?:散|乱|偏))/u.test(
      normalized,
    ) ||
    /\b(?:pain points?|problems? solved|struggl(?:e|es|ing)|difficult to|hard to)\b/u.test(
      normalized,
    )
  ) {
    return "problems";
  }

  return null;
}

function overviewFactPriority(text: string): number {
  const normalized = canonicalText(text).toLocaleLowerCase("en-US");

  if (
    /(?:这是一个|(?:本|该|这个)?(?:项目|仓库|工具|系统|平台).{0,24}(?:是|用于|提供|帮助))/u.test(
      normalized,
    ) ||
    /\b(?:this|the) (?:project|repository|tool|application|system|workspace|service) (?:is|provides|offers|helps)\b/u.test(
      normalized,
    )
  ) {
    return 2;
  }

  return 1;
}

function documentedRuntimeIdentity(text: string): string | null {
  const normalized = canonicalText(text).toLocaleLowerCase("en-US");
  const runtime =
    /\b(bun|deno|go|java|node(?:\.js)?|npm|php|pnpm|python|ruby|rust|swift|yarn)\b/u.exec(
      normalized,
    );

  if (runtime === null) return null;
  const tail = normalized.slice(runtime.index + runtime[0].length);
  const versions =
    tail.match(/(?:[~^]|[<>]=?|v)?\s*\d+(?:\.\d+){0,2}(?:\.x)?/gu) ?? [];
  if (versions.length === 0) return null;

  const runtimeName = runtime[0] === "node.js" ? "node" : runtime[0];

  return `${runtimeName}:${versions
    .slice(0, 3)
    .map((version) => version.replace(/\s+/gu, ""))
    .join("|")}`;
}

function dependencyFactPriority(text: string): number {
  if (documentedRuntimeIdentity(text) !== null) return 4;

  const normalized = canonicalText(text);
  if (
    /(?:api key|密钥|秘钥)/iu.test(normalized) ||
    /(?:^|[^\p{L}\p{N}])(?:[A-Z][A-Z0-9]*_[A-Z0-9_]+)(?:$|[^\p{L}\p{N}])/u.test(
      normalized,
    ) ||
    /(?:[\w.-]+\/)?\.env(?:\.[\w-]+)*/iu.test(normalized)
  ) {
    return 3;
  }

  return 1;
}

function isDatedMaturityHeading(value: string): boolean {
  return /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u.test(
    value.normalize("NFKC").trim(),
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
  options: ReaderMarkdownExtractionOptions = {},
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
  const lines = file.text.split(/\r?\n/u);
  const seen = {
    scenarios: new Set<string>(),
    architecture: new Set<string>(),
    securityPrivacy: new Set<string>(),
  };
  const readmeSeen: Readonly<Record<ProfileTextSection, Set<string>>> = {
    overview: new Set<string>(),
    audiences: new Set<string>(),
    problems: new Set<string>(),
    useCases: new Set<string>(),
    workflow: new Set<string>(),
    dependencies: new Set<string>(),
    limitations: new Set<string>(),
    maturity: new Set<string>(),
  };
  const capabilityGroupIndices = new Map<string, number>();
  const capabilityGroups: PendingCapabilityGroup[] = [];
  const capabilityFacts: PendingCapabilityFact[] = [];
  let capabilityGroupsOverflowed = false;
  const failClosedCapabilityGroups = (): void => {
    capabilityGroupsOverflowed = true;
    capabilityGroupIndices.clear();
    capabilityGroups.length = 0;
    capabilityFacts.length = 0;
  };
  const fallbackCandidates: ReaderTextFact[] = [];
  const fallbackSeen = new Set<string>();
  const caps: Readonly<Record<ProseSection, number>> = {
    scenarios: 3,
    architecture: 8,
    securityPrivacy: 3,
  };
  const commands = new Map<
    ReaderCommandKind,
    { fact: ReaderCommandFact; priority: number }
  >();
  const scenarioExclusions = new Set(
    [...(options.scenarioExclusions ?? [])].map(canonicalText),
  );
  const headings: HeadingFrame[] = [];
  let paragraph: ParagraphState | null = null;
  let fence: FenceState | null = null;
  let inHtmlComment = false;
  let inCdata = false;
  let inProcessingInstruction = false;
  let inDeclaration = false;
  let inTwoCellTable = false;
  let doctype: DoctypeState | null = null;
  let htmlBlock: HtmlBlockState | null = null;
  let malformedBlock = false;
  let dependencyContinuationIndex: number | null = null;
  const overviewHeadingLevels = new Set<number>();

  const addProse = (section: ProseSection, candidate: string): void => {
    const text =
      section === "architecture"
        ? visibleProfileProse(candidate)
        : visibleProse(candidate);

    if (
      text === null ||
      (section === "architecture" && isDocumentationPointer(text))
    ) {
      return;
    }
    const key = canonicalText(text);
    if (
      (section === "scenarios" && scenarioExclusions.has(key)) ||
      evidence[section].length >= caps[section] ||
      seen[section].has(key)
    ) {
      return;
    }
    seen[section].add(key);
    evidence[section].push({ source, path: file.path, text });
  };

  const addReadmeFact = (
    section: ProfileTextSection,
    candidate: string,
  ): void => {
    const text = visibleProfileProse(candidate);

    if (
      text === null ||
      isContributionInvitation(text) ||
      isPureProfileLeadIn(text)
    ) {
      return;
    }
    const routedSection = routedNarrativeSection(text);
    const targetSection =
      routedSection === "limitations"
        ? routedSection
        : section === "overview"
          ? (routedSection ?? section)
          : section;
    const key = canonicalText(text);
    if (
      scenarioExclusions.has(key) ||
      evidence.readme[targetSection].length >=
        PROFILE_CANDIDATE_CAPS[targetSection] ||
      readmeSeen[targetSection].has(key)
    ) {
      return;
    }
    readmeSeen[targetSection].add(key);
    evidence.readme[targetSection].push({ source, path: file.path, text });
  };

  const appendDependencyContinuation = (
    index: number,
    candidate: string,
  ): number | null => {
    const current = evidence.readme.dependencies[index];
    const continuation = visibleProfileProse(candidate);
    if (current === undefined || continuation === null) return null;
    const combined = visibleProse(
      escapeMarkdownLiteral(`${current.text} — ${continuation}`),
    );
    if (combined === null) return null;
    const oldKey = canonicalText(current.text);
    const newKey = canonicalText(combined);
    if (newKey !== oldKey && readmeSeen.dependencies.has(newKey)) return null;

    readmeSeen.dependencies.delete(oldKey);
    readmeSeen.dependencies.add(newKey);
    current.text = combined;
    return index;
  };

  const rememberDependencyListFact = (beforeLength: number): void => {
    dependencyContinuationIndex =
      evidence.readme.dependencies.length > beforeLength
        ? evidence.readme.dependencies.length - 1
        : null;
  };

  const addCapabilityFact = (label: string, candidate: string): void => {
    if (capabilityGroupsOverflowed) return;
    const safeLabel = visibleProfileProse(label);
    const text = visibleProfileProse(candidate);

    if (safeLabel === null || text === null) return;
    const labelKey = canonicalText(safeLabel);
    const textKey = canonicalText(text);

    if (
      scenarioExclusions.has(labelKey) ||
      scenarioExclusions.has(textKey) ||
      textKey === labelKey
    ) {
      return;
    }

    let groupIndex = capabilityGroupIndices.get(labelKey);
    if (groupIndex === undefined) {
      if (
        capabilityGroups.length >=
        READER_MARKDOWN_PENDING_CAPABILITY_LIMITS.maxGroups
      ) {
        failClosedCapabilityGroups();
        return;
      }
      groupIndex = capabilityGroups.length;
      capabilityGroups.push({
        label: safeLabel,
        labelKey,
        factKeys: new Set<string>(),
        firstFactIndex: -1,
        lastFactIndex: -1,
      });
      capabilityGroupIndices.set(labelKey, groupIndex);
    }

    const group = capabilityGroups[groupIndex];
    if (group === undefined) return;
    if (group.factKeys.has(textKey)) return;
    if (
      group.factKeys.size >=
        READER_MARKDOWN_PENDING_CAPABILITY_LIMITS.maxFactsPerGroup ||
      capabilityFacts.length >=
        READER_MARKDOWN_PENDING_CAPABILITY_LIMITS.maxFactsTotal
    ) {
      failClosedCapabilityGroups();
      return;
    }
    group.factKeys.add(textKey);
    const factIndex = capabilityFacts.length;
    capabilityFacts.push({ text, textKey, nextFactIndex: -1 });
    if (group.lastFactIndex < 0) {
      group.firstFactIndex = factIndex;
    } else {
      const previous = capabilityFacts[group.lastFactIndex];
      if (previous === undefined) return;
      previous.nextFactIndex = factIndex;
    }
    group.lastFactIndex = factIndex;
  };

  const addFallbackCandidate = (candidate: string): void => {
    if (
      fallbackCandidates.length >= 8 ||
      !looksLikeFallbackOrientation(candidate)
    ) {
      return;
    }
    const text = visibleProfileProse(candidate);
    if (
      text === null ||
      isContributionInvitation(text) ||
      isPureProfileLeadIn(text)
    ) {
      return;
    }
    const routedSection = routedNarrativeSection(text);
    if (routedSection !== null) {
      addReadmeFact(routedSection, text);
      return;
    }
    const key = canonicalText(text);
    if (scenarioExclusions.has(key) || fallbackSeen.has(key)) return;
    fallbackSeen.add(key);
    fallbackCandidates.push({ source, path: file.path, text });
  };

  const addParagraphCandidate = (
    target: Pick<
      ParagraphState,
      "legacySection" | "profileSection" | "capabilityLabel" | "fallback"
    >,
    candidate: string,
  ): void => {
    if (target.legacySection !== null) {
      addProse(target.legacySection, candidate);
    }
    if (target.profileSection !== null) {
      addReadmeFact(target.profileSection, candidate);
    }
    if (target.capabilityLabel !== null) {
      addCapabilityFact(target.capabilityLabel, candidate);
    }
    if (target.fallback) addFallbackCandidate(candidate);
  };

  const flushParagraph = (): void => {
    if (
      paragraph !== null &&
      !paragraph.invalid &&
      paragraph.parts.length > 0
    ) {
      addParagraphCandidate(paragraph, paragraph.parts.join(" "));
    }
    paragraph = null;
  };

  const addParagraphLine = (
    target: Pick<
      ParagraphState,
      "legacySection" | "profileSection" | "capabilityLabel" | "fallback"
    >,
    line: string,
  ): void => {
    const profileTarget =
      target.profileSection !== null ||
      target.capabilityLabel !== null ||
      target.fallback;
    const text = profileTarget ? visibleProfileProse(line) : visibleProse(line);

    if (
      paragraph === null ||
      paragraph.legacySection !== target.legacySection ||
      paragraph.profileSection !== target.profileSection ||
      paragraph.capabilityLabel !== target.capabilityLabel ||
      paragraph.fallback !== target.fallback
    ) {
      flushParagraph();
      paragraph = {
        ...target,
        parts: [],
        codePoints: 0,
        invalid: false,
      };
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

  const addCommand = (
    kind: ReaderCommandKind,
    candidate: string,
    contextualPriority: number,
  ): void => {
    const normalized = candidate
      .normalize("NFKC")
      .trim()
      .replace(/^[$>](?:\s+|$)/u, "")
      .trim();
    const resolvedKind = documentedCommandKind(candidate, kind);
    const priority =
      resolvedKind === kind
        ? contextualPriority
        : Math.min(contextualPriority, 1);
    const existing = commands.get(resolvedKind);

    if (
      (existing !== undefined && existing.priority >= priority) ||
      normalized.startsWith("#") ||
      /^(?:`{3,}|~{3,})/u.test(normalized)
    ) {
      return;
    }
    const disposition = documentedCommandDisposition(candidate);
    if (disposition === null) return;
    commands.set(resolvedKind, {
      priority,
      fact: {
        source,
        path: file.path,
        kind: resolvedKind,
        command: disposition === "withheld" ? null : normalized,
        disposition,
      },
    });
  };

  const enterHeading = (
    level: number,
    name: string,
    label: string | null,
  ): void => {
    flushParagraph();
    const nestedUnderMaturity = headings.some(
      (frame) => frame.level < level && frame.profileSection === "maturity",
    );
    while ((headings.at(-1)?.level ?? 0) >= level) headings.pop();
    const profileSection = readmeProfileSection(name);
    const commandKind = readmeCommandKind(name);
    if (
      profileSection === null &&
      nestedUnderMaturity &&
      label !== null &&
      isDatedMaturityHeading(label)
    ) {
      addReadmeFact("maturity", label);
    }
    if (profileSection === "overview") overviewHeadingLevels.add(level);
    headings.push({
      level,
      profileSection,
      legacySection: readmeLegacySection(name),
      commandKind,
      commandPriority:
        commandKind === null ? 0 : BROAD_COMMAND_HEADINGS.has(name) ? 1 : 2,
      label,
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const priorDependencyContinuationIndex = dependencyContinuationIndex;
    dependencyContinuationIndex = null;
    let line = lines[index] ?? "";
    let trimmed = line.trim();

    if (!isTableLine(line) || line.includes("||")) inTwoCellTable = false;

    if (fence !== null) {
      if (
        closesFence(line, fence) ||
        (fence.indentedWrapper && closesFence(trimmed, fence))
      ) {
        fence = null;
      } else if (fence.kind !== null && trimmed.length > 0) {
        addCommand(fence.kind, trimmed, fence.commandPriority);
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
        const commandContext = activeCommandContext(headings);
        openingFence.kind = commandContext?.kind ?? null;
        openingFence.commandPriority = commandContext?.priority ?? 0;
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
      enterHeading(atxHeading.level, atxHeading.name, atxHeading.label);
      continue;
    }

    const nextLine = lines[index + 1];
    const underlineLevel =
      nextLine === undefined ? null : setextLevel(nextLine);
    if (trimmed.length > 0 && underlineLevel !== null) {
      const label = safeHeadingLabel(trimmed);
      enterHeading(
        underlineLevel,
        label === null ? "" : headingName(label),
        label,
      );
      index += 1;
      continue;
    }

    if (trimmed.length === 0) {
      flushParagraph();
      continue;
    }
    const legacySection = activeLegacySection(headings);
    const profile = activeProfileContext(headings);
    const commandContext = activeCommandContext(headings);
    const commandKind = commandContext?.kind ?? null;
    const commandPriority = commandContext?.priority ?? 0;
    const item = listItem(line);
    const candidate = item ?? trimmed;
    const target = {
      legacySection,
      profileSection:
        profile !== null && profile.section !== "capabilities"
          ? profile.section
          : null,
      capabilityLabel:
        profile?.section === "capabilities" ? profile.capabilityLabel : null,
      fallback:
        profile === null && legacySection === null && commandKind === null,
    } satisfies Pick<
      ParagraphState,
      "legacySection" | "profileSection" | "capabilityLabel" | "fallback"
    >;
    const rawTableParts = tableParts(line);
    const beginsTable =
      rawTableParts !== null && isTwoCellTableSeparator(lines[index + 1] ?? "");
    const tableSyntax =
      rawTableParts !== null || (isTableLine(line) && !line.includes("||"));
    const tableCommandDisposition =
      commandKind === null ? null : documentedCommandDisposition(candidate);
    const tableLike =
      tableSyntax &&
      (beginsTable ||
        inTwoCellTable ||
        commandKind === null ||
        tableCommandDisposition === null);

    if (tableLike) {
      flushParagraph();
      if (beginsTable) inTwoCellTable = true;
      const tableFact = beginsTable ? null : twoCellTableFact(line);

      if (tableFact !== null && profile !== null) {
        addParagraphCandidate(
          { ...target, legacySection: null, fallback: false },
          tableFact,
        );
      } else if (tableFact !== null && legacySection === "architecture") {
        addProse("architecture", tableFact);
      }
      continue;
    }
    const indentedDependencyContinuation =
      priorDependencyContinuationIndex !== null &&
      item === null &&
      /^(?: {2,3}|\t)\S/u.test(line) &&
      (profile?.section === "dependencies" || commandKind !== null) &&
      documentedCommandDisposition(candidate) === null &&
      !looksLikeDocumentedCommand(candidate);
    if (indentedDependencyContinuation) {
      flushParagraph();
      const continuationIndex = appendDependencyContinuation(
        priorDependencyContinuationIndex,
        candidate,
      );
      if (continuationIndex !== null) {
        dependencyContinuationIndex = continuationIndex;
        continue;
      }
    }
    if (isExplicitLimitation(candidate)) {
      flushParagraph();
      addReadmeFact("limitations", candidate);
      continue;
    }
    const inline = inlineCommands(line);
    let admittedCommand = false;
    let admittedRuntimeRequirement = false;

    for (const command of inline) {
      const disposition = documentedCommandDisposition(command);
      if (
        disposition === null &&
        isDocumentedRuntimeRequirement(command) &&
        (commandKind !== null || profile?.section === "dependencies")
      ) {
        admittedRuntimeRequirement = true;
      } else if (disposition !== null) {
        admittedCommand = true;
        if (commandKind !== null) {
          addCommand(commandKind, command, commandPriority);
        }
      }
    }
    const plainCommandContext =
      inline.length === 0 &&
      (commandKind !== null ||
        /^(?: {4}| {0,3}[$>](?:\s|$))/u.test(line) ||
        looksLikeDocumentedCommand(candidate));
    const plainDisposition = plainCommandContext
      ? documentedCommandDisposition(candidate)
      : null;

    if (plainDisposition !== null) {
      admittedCommand = true;
      if (commandKind !== null) {
        addCommand(commandKind, candidate, commandPriority);
      }
    }
    if (admittedRuntimeRequirement && !admittedCommand) {
      flushParagraph();
      const beforeLength = evidence.readme.dependencies.length;
      addReadmeFact("dependencies", candidate);
      if (item !== null) rememberDependencyListFact(beforeLength);
      continue;
    }
    if (
      !admittedCommand &&
      isDocumentedRuntimeRequirement(candidate) &&
      (commandKind !== null || profile?.section === "dependencies")
    ) {
      flushParagraph();
      const beforeLength = evidence.readme.dependencies.length;
      addReadmeFact("dependencies", candidate);
      if (item !== null) rememberDependencyListFact(beforeLength);
      continue;
    }
    if (
      candidate
        .normalize("NFKC")
        .trim()
        .replace(/^[$>](?:\s+|$)/u, "")
        .trimStart()
        .startsWith("#")
    ) {
      flushParagraph();
      continue;
    }
    if (admittedCommand) {
      flushParagraph();
      continue;
    }

    if (
      isReferenceDefinition(line) ||
      trimmed.startsWith("![") ||
      trimmed.startsWith("<") ||
      /^(?: {4}|\t)/u.test(line)
    ) {
      flushParagraph();
      continue;
    }

    if (item !== null) {
      flushParagraph();
      const beforeLength = evidence.readme.dependencies.length;
      addParagraphCandidate({ ...target, fallback: false }, item);
      if (target.profileSection === "dependencies") {
        rememberDependencyListFact(beforeLength);
      }
    } else {
      addParagraphLine(target, line);
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

  if (overviewHeadingLevels.size === 0) {
    evidence.readme.overview.push(
      ...fallbackCandidates.slice(0, README_PROFILE_CAPS.overview),
    );
  }

  const profileSeen = new Set(scenarioExclusions);
  const dependencyRuntimeSeen = new Set<string>();
  const finalizeFacts = (section: ProfileTextSection): void => {
    const finalized: ReaderTextFact[] = [];
    const sourceFacts = evidence.readme[section];
    const candidates =
      section === "overview" ||
      (section === "dependencies" &&
        sourceFacts.length > README_PROFILE_CAPS.dependencies)
        ? sourceFacts
            .map((fact, index) => ({ fact, index }))
            .sort((left, right) => {
              const priority = (fact: ReaderTextFact): number =>
                section === "overview"
                  ? overviewFactPriority(fact.text)
                  : dependencyFactPriority(fact.text);

              return (
                priority(right.fact) - priority(left.fact) ||
                left.index - right.index
              );
            })
            .map(({ fact }) => fact)
        : sourceFacts;
    for (const fact of candidates) {
      const key = canonicalText(fact.text);
      const runtimeIdentity =
        section === "dependencies"
          ? documentedRuntimeIdentity(fact.text)
          : null;
      if (
        profileSeen.has(key) ||
        (runtimeIdentity !== null && dependencyRuntimeSeen.has(runtimeIdentity))
      ) {
        continue;
      }
      profileSeen.add(key);
      if (runtimeIdentity !== null) {
        dependencyRuntimeSeen.add(runtimeIdentity);
      }
      finalized.push(fact);
      if (finalized.length >= README_PROFILE_CAPS[section]) break;
    }
    evidence.readme[section] = finalized;
  };

  for (const section of [
    "overview",
    "audiences",
    "problems",
    "useCases",
  ] as const) {
    finalizeFacts(section);
  }

  const finalizedGroups: ReaderMarkdownReadmeEvidence["capabilityGroups"] = [];
  for (const group of capabilityGroups) {
    if (profileSeen.has(group.labelKey)) continue;
    const groupSeen = new Set(profileSeen);
    groupSeen.add(group.labelKey);
    const facts: ReaderTextFact[] = [];
    const factKeys: string[] = [];
    let factIndex = group.firstFactIndex;
    while (factIndex >= 0) {
      const fact = capabilityFacts[factIndex];
      if (fact === undefined) break;
      if (!groupSeen.has(fact.textKey)) {
        groupSeen.add(fact.textKey);
        factKeys.push(fact.textKey);
        facts.push({ source, path: file.path, text: fact.text });
      }
      if (facts.length >= README_PROFILE_CAPS.capabilityFacts) break;
      factIndex = fact.nextFactIndex;
    }
    if (facts.length === 0) continue;
    profileSeen.add(group.labelKey);
    for (const key of factKeys) profileSeen.add(key);
    finalizedGroups.push({ label: group.label, facts });
    if (finalizedGroups.length >= README_PROFILE_CAPS.capabilityGroups) break;
  }
  evidence.readme.capabilityGroups = finalizedGroups;

  for (const section of [
    "workflow",
    "dependencies",
    "limitations",
    "maturity",
  ] as const) {
    finalizeFacts(section);
  }

  evidence.commands = READER_COMMAND_KINDS.flatMap((kind) => {
    const command = commands.get(kind);
    return command === undefined ? [] : [command.fact];
  });
  return evidence;
}
