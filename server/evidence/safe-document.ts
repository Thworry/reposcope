import { containsCredentialLikeValue } from "../../src/features/analysis/project-brief-safety.js";
import { assertRepositoryPath } from "../github/guards.js";
import type { EvidenceTextFile } from "../github/model.js";
import { EVIDENCE_LIMITS } from "./model.js";
import type {
  EvidenceContentBlockDraft,
  SanitizedEvidenceDocument,
} from "./model.js";

const UNSAFE_NON_CONTROL_PATTERN = /[\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u;
const CREDENTIAL_OMISSION = "[credential-like line omitted]";
const UNSAFE_LINE_OMISSION = "[unsafe line omitted]";
const PRIVATE_KEY_OMISSION = "[private-key block omitted]";
const PRIVATE_KEY_BEGIN_PATTERN =
  /-----BEGIN (?:(?!PUBLIC KEY)[A-Z0-9 -]{0,40}PRIVATE KEY(?: BLOCK)?)-----/iu;
const PRIVATE_KEY_END_PATTERN =
  /-----END (?:(?!PUBLIC KEY)[A-Z0-9 -]{0,40}PRIVATE KEY(?: BLOCK)?)-----/iu;
const PRIVATE_KEY_MARKER_PATTERN =
  /-----(?:BEGIN|END) (?:(?!PUBLIC KEY)[A-Z0-9 -]{0,40}PRIVATE KEY(?: BLOCK)?)-----/iu;
const PRIVATE_KEY_FRAGMENT_PATTERN =
  /(?:\bMII[A-Za-z0-9+/=]{60,}\b|\bb3BlbnNzaC1rZXktdjEAAAAA[A-Za-z0-9+/=]{16,}\b|\blQ[A-Za-z0-9+/=]{60,}\b)/u;
const PRIVATE_KEY_BASE64_BLOCK_PATTERN =
  /(?:^|\n)[ \t]{0,8}[A-Za-z0-9+/]{48,}={0,2}[ \t]*(?:\n[ \t]{0,8}[A-Za-z0-9+/]{48,}={0,2}[ \t]*)+(?:$|\n)/u;
const CREDENTIAL_ASSIGNMENT_PATTERN =
  /(?:^|[^\p{L}\p{N}_])(?:(?:github[-_ ]?)?token|password|passphrase|passwd|pwd|secret|api[-_ ]?key|access[-_ ]?token|authorization|client[-_ ]?secret|private[-_ ]?key)\s*[:=]\s*\S+/iu;
const CREDENTIAL_VALUE_PATTERN =
  /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|sk_(?:live|test)_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{16,})\b/u;

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function prefixByCodePoints(value: string, maximum: number): string {
  const points = Array.from(value);
  return points.length <= maximum ? value : points.slice(0, maximum).join("");
}

function prefixByUtf8Bytes(
  value: string,
  maximum: number,
): {
  text: string;
  complete: boolean;
} {
  const encoder = new TextEncoder();
  const boundedByCodeUnits = value.slice(0, maximum);
  if (
    boundedByCodeUnits.length === value.length &&
    encoder.encode(boundedByCodeUnits).byteLength <= maximum
  ) {
    return { text: value, complete: true };
  }

  let low = 0;
  let high = boundedByCodeUnits.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (
      encoder.encode(boundedByCodeUnits.slice(0, middle)).byteLength <= maximum
    ) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  let end = low;
  if (
    end > 0 &&
    end < boundedByCodeUnits.length &&
    /[\uD800-\uDBFF]/u.test(boundedByCodeUnits[end - 1] ?? "")
  ) {
    end -= 1;
  }
  return { text: boundedByCodeUnits.slice(0, end), complete: false };
}

function preserveNewlines(match: string): string {
  return "\n".repeat(match.split("\n").length - 1);
}

interface HtmlTagToken {
  closing: boolean;
  end: number;
  name: string | null;
}

interface HtmlTagScan {
  incompleteEnd: number | null;
  token: HtmlTagToken | null;
}

function isAsciiLetter(character: string | undefined): boolean {
  if (character === undefined) return false;
  const code = character.codePointAt(0);
  return (
    code !== undefined &&
    ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a))
  );
}

function isTagNameCharacter(character: string | undefined): boolean {
  if (character === undefined) return false;
  const code = character.codePointAt(0);
  return (
    isAsciiLetter(character) ||
    (code !== undefined && code >= 0x30 && code <= 0x39) ||
    character === ":" ||
    character === "_" ||
    character === "-"
  );
}

function htmlTagAt(value: string, start: number): HtmlTagScan {
  if (value[start] !== "<") {
    return { incompleteEnd: null, token: null };
  }
  let cursor = start + 1;
  let closing = false;
  if (value[cursor] === "/") {
    closing = true;
    cursor += 1;
  }

  let name: string | null = null;
  if (isAsciiLetter(value[cursor])) {
    const nameStart = cursor;
    cursor += 1;
    while (isTagNameCharacter(value[cursor])) cursor += 1;
    name = value.slice(nameStart, cursor).toLocaleLowerCase("en-US");
  } else if (!closing && (value[cursor] === "!" || value[cursor] === "?")) {
    cursor += 1;
  } else {
    return { incompleteEnd: null, token: null };
  }

  let quote: '"' | "'" | null = null;
  while (cursor < value.length) {
    const character = value[cursor];
    if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return {
        incompleteEnd: null,
        token: { closing, end: cursor + 1, name },
      };
    }
    cursor += 1;
  }

  return { incompleteEnd: value.length, token: null };
}

function rawTextClosingTagAt(
  value: string,
  start: number,
  name: "script" | "style",
): HtmlTagScan {
  if (value[start] !== "<" || value[start + 1] !== "/") {
    return { incompleteEnd: null, token: null };
  }
  let cursor = start + 2;
  for (const expected of name) {
    if (value[cursor]?.toLocaleLowerCase("en-US") !== expected) {
      return { incompleteEnd: null, token: null };
    }
    cursor += 1;
  }
  const boundary = value[cursor];
  if (
    boundary !== ">" &&
    boundary !== "/" &&
    boundary !== " " &&
    boundary !== "\t" &&
    boundary !== "\n" &&
    boundary !== "\f" &&
    boundary !== "\r"
  ) {
    return { incompleteEnd: null, token: null };
  }
  const end = value.indexOf(">", cursor);
  if (end < 0) return { incompleteEnd: value.length, token: null };
  return {
    incompleteEnd: null,
    token: { closing: true, end: end + 1, name },
  };
}

function shouldNeutralizeTagOpener(value: string, start: number): boolean {
  const next = value[start + 1];
  return (
    isAsciiLetter(next) ||
    next === "/" ||
    next === "!" ||
    next === "?" ||
    next === "<"
  );
}

function appendNeutralizedTagOpeners(
  chunks: string[],
  value: string,
  start: number,
  end: number,
): boolean {
  let changed = false;
  let cursor = start;
  while (cursor < end) {
    const opening = value.indexOf("<", cursor);
    if (opening < 0 || opening >= end) {
      chunks.push(value.slice(cursor, end));
      break;
    }
    chunks.push(value.slice(cursor, opening));
    if (shouldNeutralizeTagOpener(value, opening)) {
      chunks.push("‹");
      changed = true;
    } else {
      chunks.push("<");
    }
    cursor = opening + 1;
  }
  return changed;
}

export function stripHtmlLikeTags(value: string): {
  text: string;
  changed: boolean;
} {
  const chunks: string[] = [];
  let changed = false;
  let cursor = 0;

  while (cursor < value.length) {
    const opening = value.indexOf("<", cursor);
    if (opening < 0) {
      chunks.push(value.slice(cursor));
      break;
    }
    chunks.push(value.slice(cursor, opening));
    const scan = htmlTagAt(value, opening);
    if (scan.token !== null) {
      chunks.push(preserveNewlines(value.slice(opening, scan.token.end)));
      cursor = scan.token.end;
      changed = true;
      continue;
    }
    if (scan.incompleteEnd !== null) {
      changed =
        appendNeutralizedTagOpeners(
          chunks,
          value,
          opening,
          scan.incompleteEnd,
        ) || changed;
      cursor = scan.incompleteEnd;
      continue;
    }
    chunks.push(shouldNeutralizeTagOpener(value, opening) ? "‹" : "<");
    changed ||= shouldNeutralizeTagOpener(value, opening);
    cursor = opening + 1;
  }
  return { text: chunks.join(""), changed };
}

function removeScriptAndStyleBlocks(value: string): {
  text: string;
  changed: boolean;
} {
  const chunks: string[] = [];
  let changed = false;
  let cursor = 0;
  let activeBlock: "script" | "style" | null = null;
  let activeStart = 0;

  while (cursor < value.length) {
    const opening = value.indexOf("<", cursor);
    if (opening < 0) {
      chunks.push(value.slice(activeBlock === null ? cursor : activeStart));
      break;
    }
    if (activeBlock === null) chunks.push(value.slice(cursor, opening));

    const scan: HtmlTagScan =
      activeBlock === null
        ? htmlTagAt(value, opening)
        : rawTextClosingTagAt(value, opening, activeBlock);
    if (scan.token === null) {
      if (scan.incompleteEnd !== null) {
        chunks.push(
          value.slice(
            activeBlock === null ? opening : activeStart,
            scan.incompleteEnd,
          ),
        );
        cursor = scan.incompleteEnd;
      } else {
        if (activeBlock === null) chunks.push("<");
        cursor = opening + 1;
      }
      continue;
    }

    if (activeBlock !== null) {
      if (scan.token.closing && scan.token.name === activeBlock) {
        chunks.push(preserveNewlines(value.slice(activeStart, scan.token.end)));
        activeBlock = null;
        changed = true;
      }
    } else if (
      !scan.token.closing &&
      (scan.token.name === "script" || scan.token.name === "style")
    ) {
      activeBlock = scan.token.name;
      activeStart = opening;
    } else {
      chunks.push(value.slice(opening, scan.token.end));
    }
    cursor = scan.token.end;
  }
  return { text: chunks.join(""), changed };
}

function literalReplacement(
  value: string,
  pattern: RegExp,
  replacement: string,
): { text: string; changed: boolean } {
  const text = value.replace(pattern, replacement);
  return { text, changed: text !== value };
}

function newlineReplacement(
  value: string,
  pattern: RegExp,
): { text: string; changed: boolean } {
  const text = value.replace(pattern, preserveNewlines);
  return { text, changed: text !== value };
}

function removeActiveMarkup(value: string): {
  text: string;
  changed: boolean;
} {
  let text = value;
  let changed = false;
  const applyLiteral = (pattern: RegExp, replacement: string): void => {
    const result = literalReplacement(text, pattern, replacement);
    text = result.text;
    changed ||= result.changed;
  };
  const applyNewlines = (pattern: RegExp): void => {
    const result = newlineReplacement(text, pattern);
    text = result.text;
    changed ||= result.changed;
  };

  applyNewlines(/<!--[\s\S]*?(?:-->|$)/gu);
  const activeBlocks = removeScriptAndStyleBlocks(text);
  text = activeBlocks.text;
  changed ||= activeBlocks.changed;
  applyLiteral(/^\s{0,3}\[[^\]]+\]:\s*\S+.*$/gmu, "");
  applyLiteral(/!\[([^\]]*)\]\([^\n)]*(?:\([^\n)]*\)[^\n)]*)*\)/gu, "$1");
  applyLiteral(/\[([^\]]+)\]\([^\n)]*(?:\([^\n)]*\)[^\n)]*)*\)/gu, "$1");
  applyLiteral(
    /<(?:(?:https?|ftp):\/\/|mailto:)[^>\n]+>/giu,
    "[link destination omitted]",
  );
  applyLiteral(
    /\b(?:(?:https?|ftp):\/\/|mailto:)[^\s<>"')\]]+/giu,
    "[link destination omitted]",
  );
  const tags = stripHtmlLikeTags(text);
  text = tags.text;
  changed ||= tags.changed;
  return { text, changed };
}

function hasUnsafeCodePoint(value: string): boolean {
  for (const point of value) {
    const code = point.codePointAt(0);
    if (
      code === undefined ||
      (code <= 0x1f && code !== 0x09) ||
      (code >= 0x7f && code <= 0x9f) ||
      UNSAFE_NON_CONTROL_PATTERN.test(point)
    ) {
      return true;
    }
  }
  return false;
}

function safeLine(value: string): { text: string; omitted: boolean } {
  if (hasUnsafeCodePoint(value)) {
    return { text: UNSAFE_LINE_OMISSION, omitted: true };
  }
  if (isCredentialShapedText(value)) {
    return { text: CREDENTIAL_OMISSION, omitted: true };
  }
  return {
    text: value.replace(/[\t\f\v]+/gu, "  ").replace(/[ \t]+$/gu, ""),
    omitted: false,
  };
}

export function containsPrivateKeyMaterial(value: string): boolean {
  const normalized = value.normalize("NFKC").replace(/\r\n?/gu, "\n");
  return (
    PRIVATE_KEY_MARKER_PATTERN.test(normalized) ||
    PRIVATE_KEY_FRAGMENT_PATTERN.test(normalized) ||
    PRIVATE_KEY_BASE64_BLOCK_PATTERN.test(normalized)
  );
}

export function isCredentialShapedText(value: string): boolean {
  return (
    containsPrivateKeyMaterial(value) ||
    CREDENTIAL_ASSIGNMENT_PATTERN.test(value) ||
    CREDENTIAL_VALUE_PATTERN.test(value) ||
    containsCredentialLikeValue(value) ||
    containsCredentialLikeValue(value.normalize("NFKC"))
  );
}

function headingOf(line: string): string | null {
  const match = /^\s{0,3}#{1,6}[ \t]+(?<heading>.*?)(?:[ \t]+#*)?$/u.exec(line);
  const heading = match?.groups?.heading?.trim();
  if (heading === undefined || heading.length === 0) return null;
  return prefixByCodePoints(heading, EVIDENCE_LIMITS.blockCodePoints);
}

export function sanitizeEvidenceDocument(
  file: EvidenceTextFile,
  kind: "readme" | "documentation",
): SanitizedEvidenceDocument {
  if (file.kind !== kind) {
    throw new TypeError(`Expected a ${kind} evidence file`);
  }
  const path = assertRepositoryPath(file.path);
  if (isCredentialShapedText(path)) return { blocks: [], complete: false };

  const bounded = prefixByUtf8Bytes(file.text, EVIDENCE_LIMITS.inputBytes);
  const markup = removeActiveMarkup(bounded.text.replace(/\r\n?/gu, "\n"));
  const normalizedLines = markup.text.split("\n");
  const blocks: EvidenceContentBlockDraft[] = [];
  let complete = bounded.complete && !markup.changed;
  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  let currentStart = 1;
  let currentEnd = 1;
  let admittedCodePoints = 0;

  const appendBlock = (
    text: string,
    startLine: number,
    endLine: number,
  ): boolean => {
    if (text.length === 0) return true;
    const remaining = EVIDENCE_LIMITS.modelCodePoints - admittedCodePoints;
    if (remaining <= 0 || blocks.length >= EVIDENCE_LIMITS.contentBlocks) {
      complete = false;
      return false;
    }
    const maximum = Math.min(EVIDENCE_LIMITS.blockCodePoints, remaining);
    const admitted = prefixByCodePoints(text, maximum);
    if (admitted !== text) complete = false;
    blocks.push({
      kind,
      path,
      heading: currentHeading,
      text: admitted,
      startLine,
      endLine,
      trust: "repository-authored",
    });
    admittedCodePoints += codePointLength(admitted);
    return admitted === text;
  };

  const flush = (): boolean => {
    if (currentLines.length === 0) return true;
    const joined = currentLines.join("\n");
    currentLines = [];
    if (codePointLength(joined) <= EVIDENCE_LIMITS.blockCodePoints) {
      return appendBlock(joined, currentStart, currentEnd);
    }

    let piece = "";
    for (const point of joined) {
      if (codePointLength(piece) === EVIDENCE_LIMITS.blockCodePoints) {
        if (!appendBlock(piece, currentStart, currentEnd)) return false;
        piece = "";
      }
      piece += point;
    }
    return piece.length === 0 || appendBlock(piece, currentStart, currentEnd);
  };

  for (let index = 0; index < normalizedLines.length; index += 1) {
    const rawLine = normalizedLines[index] ?? "";
    const sourceLine = index + 1;
    if (PRIVATE_KEY_BEGIN_PATTERN.test(rawLine.normalize("NFKC"))) {
      if (!flush()) break;
      let endIndex = index;
      while (
        endIndex + 1 < normalizedLines.length &&
        !PRIVATE_KEY_END_PATTERN.test(
          (normalizedLines[endIndex] ?? "").normalize("NFKC"),
        )
      ) {
        endIndex += 1;
      }
      currentStart = sourceLine;
      currentEnd = endIndex + 1;
      complete = false;
      if (!appendBlock(PRIVATE_KEY_OMISSION, currentStart, currentEnd)) break;
      index = endIndex;
      continue;
    }
    const sanitized = safeLine(rawLine);
    const line = sanitized.text;
    if (sanitized.omitted) complete = false;
    const heading = headingOf(line);
    if (heading !== null) {
      if (!flush()) break;
      currentHeading = heading;
      currentStart = sourceLine;
      currentEnd = sourceLine;
      currentLines.push(line);
      continue;
    }
    if (line.trim().length === 0) {
      if (!flush()) break;
      continue;
    }
    if (currentLines.length === 0) currentStart = sourceLine;
    const candidate =
      currentLines.length === 0 ? line : `${currentLines.join("\n")}\n${line}`;
    if (codePointLength(candidate) > EVIDENCE_LIMITS.blockCodePoints) {
      if (!flush()) break;
      currentStart = sourceLine;
    }
    currentLines.push(line);
    currentEnd = sourceLine;
  }
  flush();

  return { blocks, complete };
}

export function sanitizeDocumentForModel(
  file: EvidenceTextFile,
): SanitizedEvidenceDocument {
  return sanitizeEvidenceDocument(file, "documentation");
}
