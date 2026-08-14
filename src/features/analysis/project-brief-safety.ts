export const MAX_PROJECT_BRIEF_PATH_LENGTH = 1_024;

const GITHUB_TOKEN_PATTERN =
  /(?:^|[^A-Za-z0-9_])(?:gh[pousr]_?[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|githubpat[A-Za-z0-9]{20,})(?=$|[^A-Za-z0-9_])/u;
const COMMON_TOKEN_PATTERN =
  /\b(?:AKIA[0-9A-Z]{16}|sk_(?:live|test)_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{16,})\b/u;
const PEM_PRIVATE_KEY_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+){0,4} PRIVATE KEY-----/iu;
const CREDENTIAL_KEY =
  "(?:password|passphrase|passwd|pwd|secret|token|api[-_ ]?key|access[-_ ]?token|auth(?:orization)?|client[-_ ]?secret|private[-_ ]?key)";
const CREDENTIAL_ASSIGNMENT_PATTERN = new RegExp(
  `(?:\\\\?["'])?${CREDENTIAL_KEY}(?:\\\\?["'])?\\s*([=:])\\s*`,
  "iu",
);
const DOCUMENTATION_VALUE_WORDS = new Set([
  "avoid",
  "bearer",
  "boolean",
  "configure",
  "field",
  "generated",
  "identifies",
  "keep",
  "metadata",
  "nil",
  "never",
  "none",
  "null",
  "obtained",
  "optional",
  "provided",
  "required",
  "rotate",
  "rules",
  "securely",
  "store",
  "string",
  "true",
  "validation",
  "values",
  "false",
]);

function isLikelyCredentialValue(value: string | undefined): boolean {
  if (value === undefined) return false;

  const normalized = value
    .normalize("NFKC")
    .replace(/[.:!?]+$/u, "")
    .toLocaleLowerCase("en-US");

  return normalized.length > 0 && !DOCUMENTATION_VALUE_WORDS.has(normalized);
}

function allMatches(
  value: string,
  pattern: RegExp,
): RegExpStringIterator<RegExpExecArray> {
  return value.matchAll(new RegExp(pattern.source, `${pattern.flags}g`));
}

function hasAssignmentBoundary(value: string, index: number): boolean {
  return index === 0 || !/[\p{L}\p{N}_]/u.test(value[index - 1] ?? "");
}

const EXACT_CREDENTIAL_KEY_PATTERN = new RegExp(`^${CREDENTIAL_KEY}$`, "iu");

function decodeJsonUnicodeEscapes(value: string): string {
  return value.replace(/\\u([0-9a-f]{4})/giu, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function jsonValueHasCredential(value: unknown): boolean {
  const pending: unknown[] = [value];

  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      for (const entry of current) pending.push(entry);
      continue;
    }
    if (typeof current !== "object" || current === null) continue;

    for (const [key, entry] of Object.entries(current)) {
      if (EXACT_CREDENTIAL_KEY_PATTERN.test(key.normalize("NFKC"))) {
        if (typeof entry === "string" && isLikelyCredentialValue(entry)) {
          return true;
        }
        if (
          entry !== null &&
          typeof entry !== "string" &&
          typeof entry !== "boolean"
        )
          return true;
      }
      pending.push(entry);
    }
  }
  return false;
}

function inspectJsonCandidates(value: string): {
  structured: boolean;
  credential: boolean;
} {
  let attempts = 0;
  let scanned = 0;
  let structured = false;

  for (let start = 0; start < value.length; start += 1) {
    const opening = value[start];
    if (opening !== "{" && opening !== "[") continue;
    attempts += 1;
    if (attempts > 128 || scanned > 1_048_576) {
      return { structured: true, credential: false };
    }

    const stack = [opening];
    let quote = false;
    let escaped = false;
    for (let cursor = start + 1; cursor < value.length; cursor += 1) {
      scanned += 1;
      const character = value[cursor] ?? "";
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quote = false;
        continue;
      }
      if (character === '"') {
        quote = true;
        continue;
      }
      if (character === "{" || character === "[") stack.push(character);
      else if (character === "}" || character === "]") {
        const expected = character === "}" ? "{" : "[";
        if (stack.at(-1) !== expected) break;
        stack.pop();
        if (stack.length > 0) continue;

        try {
          const parsed: unknown = JSON.parse(value.slice(start, cursor + 1));
          if (typeof parsed === "object" && parsed !== null) {
            structured = true;
            if (jsonValueHasCredential(parsed)) {
              return { structured: true, credential: true };
            }
          }
        } catch {
          // A later opening delimiter can still begin a valid JSON structure.
        }
        break;
      }
    }
  }

  return { structured, credential: false };
}

function startsWithJsonStructure(value: string): boolean {
  const opening = value[0];
  if (opening !== "{" && opening !== "[") return false;
  const stack = [opening];
  let quote = false;
  let escaped = false;

  for (let cursor = 1; cursor < value.length; cursor += 1) {
    const character = value[cursor] ?? "";
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quote = false;
      continue;
    }
    if (character === '"') {
      quote = true;
      continue;
    }
    if (character === "{" || character === "[") stack.push(character);
    else if (character === "}" || character === "]") {
      const expected = character === "}" ? "{" : "[";
      if (stack.at(-1) !== expected) return false;
      stack.pop();
      if (stack.length > 0) continue;
      try {
        const parsed: unknown = JSON.parse(value.slice(0, cursor + 1));
        return typeof parsed === "object" && parsed !== null;
      } catch {
        return false;
      }
    }
  }

  return false;
}

function inspectStructuredJsonText(value: string): {
  structured: boolean;
  credential: boolean;
  decodedString: string | null;
} {
  const normalized = decodeJsonUnicodeEscapes(value);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.trim());
  } catch {
    const candidates = inspectJsonCandidates(normalized);
    return {
      structured: candidates.structured,
      credential: hasAssignedCredential(normalized) || candidates.credential,
      decodedString: null,
    };
  }

  if (typeof parsed === "string") {
    return {
      structured: false,
      credential: false,
      decodedString: parsed,
    };
  }

  let credential = hasAssignedCredential(normalized);
  if (typeof parsed === "object" && parsed !== null) {
    credential ||= jsonValueHasCredential(parsed);
  }

  return {
    structured: credential || (typeof parsed === "object" && parsed !== null),
    credential,
    decodedString: typeof parsed === "string" ? parsed : null,
  };
}

function stripEncodedStructuredJsonStrings(value: string): {
  value: string;
  credential: boolean;
} {
  const parts: string[] = [];
  let copiedUntil = 0;
  let cursor = 0;
  let credential = false;

  while (cursor < value.length) {
    if (value[cursor] !== '"') {
      cursor += 1;
      continue;
    }

    const start = cursor;
    cursor += 1;
    let escaped = false;
    while (cursor < value.length) {
      const character = value[cursor] ?? "";
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        cursor += 1;
        break;
      }
      cursor += 1;
    }
    if (cursor > value.length || value[cursor - 1] !== '"') break;

    try {
      const decoded: unknown = JSON.parse(value.slice(start, cursor));
      if (typeof decoded === "string") {
        let current = decoded;
        let structured = false;
        for (let depth = 0; depth < 3; depth += 1) {
          const inspection = inspectStructuredJsonText(current);
          structured ||= inspection.structured;
          credential ||= inspection.credential;
          if (inspection.decodedString === null) break;
          current = inspection.decodedString;
          if (depth === 2) {
            structured = true;
            credential = true;
          }
        }
        if (structured) {
          parts.push(value.slice(copiedUntil, start), " ");
          copiedUntil = cursor;
        }
      }
    } catch {
      // Invalid JSON strings remain unchanged and are handled conservatively.
    }
  }

  if (copiedUntil === 0) return { value, credential };
  parts.push(value.slice(copiedUntil));
  return { value: parts.join(""), credential };
}

interface CredentialScanState {
  cursor: number;
  linePrefix: "indent" | "dash" | "list" | "other";
  flowDepth: number;
  quote: '"' | "'" | "`" | null;
  quotedFlowDepth: number;
  quotedFlowString: boolean;
  escaped: boolean;
  lastNonWhitespace: string | null;
}

function advanceCredentialContext(
  value: string,
  state: CredentialScanState,
  end: number,
): void {
  while (state.cursor < end) {
    const character = value[state.cursor] ?? "";
    const previousNonWhitespace = state.lastNonWhitespace;
    state.cursor += 1;

    if (character === "\r" || character === "\n") {
      state.linePrefix = "indent";
      state.lastNonWhitespace = null;
      continue;
    }

    if (character === " " || character === "\t") {
      if (state.linePrefix === "dash") state.linePrefix = "list";
    } else {
      if (state.linePrefix === "indent") {
        state.linePrefix = character === "-" ? "dash" : "other";
      } else if (state.linePrefix === "dash" || state.linePrefix === "list") {
        state.linePrefix = "other";
      }
      state.lastNonWhitespace = character;
    }

    if (state.quote !== null) {
      if (state.escaped) {
        if (character === state.quote && state.quotedFlowDepth > 0) {
          state.quotedFlowString = !state.quotedFlowString;
        }
        state.escaped = false;
      } else if (character === "\\") {
        state.escaped = true;
      } else if (character === state.quote) {
        state.quote = null;
        state.quotedFlowDepth = 0;
        state.quotedFlowString = false;
      } else if (
        !state.quotedFlowString &&
        (character === "{" || character === "[")
      ) {
        state.quotedFlowDepth += 1;
      } else if (
        !state.quotedFlowString &&
        (character === "}" || character === "]")
      ) {
        state.quotedFlowDepth = Math.max(0, state.quotedFlowDepth - 1);
      }
      continue;
    }

    if (
      (character === '"' || character === "'" || character === "`") &&
      (previousNonWhitespace === null ||
        previousNonWhitespace === "{" ||
        previousNonWhitespace === "[" ||
        previousNonWhitespace === "," ||
        previousNonWhitespace === ":" ||
        previousNonWhitespace === "=")
    ) {
      state.quote = character;
      state.quotedFlowDepth = 0;
      state.quotedFlowString = false;
    } else if (character === "{" || character === "[") {
      state.flowDepth += 1;
    } else if (character === "}" || character === "]") {
      state.flowDepth = Math.max(0, state.flowDepth - 1);
    }
  }
}

interface ParsedCredentialValue {
  value: string;
  end: number;
  wrapped: boolean;
}

function parseCredentialValue(
  source: string,
  start: number,
  flowContext: boolean,
): ParsedCredentialValue {
  const escapedQuoteWrapper =
    source[start] === "\\" && /["'`]/u.test(source[start + 1] ?? "");
  const opening = escapedQuoteWrapper ? source[start + 1] : source[start];
  const closing =
    opening === '"' || opening === "'" || opening === "`"
      ? opening
      : opening === "{"
        ? "}"
        : opening === "["
          ? "]"
          : null;

  if (closing !== null) {
    let cursor = start + (escapedQuoteWrapper ? 2 : 1);
    let escaped = false;
    let depth = opening === "{" || opening === "[" ? 1 : 0;

    while (cursor < source.length) {
      const character = source[cursor] ?? "";
      if (escaped) {
        escaped = false;
      } else if (
        escapedQuoteWrapper &&
        character === "\\" &&
        source[cursor + 1] === closing
      ) {
        return {
          value: source
            .slice(start + 2, cursor)
            .replaceAll(`\\\\${closing}`, closing)
            .trim(),
          end: cursor + 2,
          wrapped: true,
        };
      } else if (character === "\\") {
        escaped = true;
      } else if (opening === "{" || opening === "[") {
        if (character === opening) depth += 1;
        if (character === closing) {
          depth -= 1;
          if (depth === 0)
            return {
              value: source.slice(start + 1, cursor).trim(),
              end: cursor + 1,
              wrapped: true,
            };
        }
      } else if (
        opening === "'" &&
        character === closing &&
        source[cursor + 1] === closing
      ) {
        cursor += 2;
        continue;
      } else if (character === closing) {
        return {
          value: source.slice(start + 1, cursor).trim(),
          end: cursor + 1,
          wrapped: true,
        };
      }
      cursor += 1;
    }

    return {
      value: source.slice(start + 1).trim(),
      end: source.length,
      wrapped: true,
    };
  }

  let end = start;
  while (end < source.length) {
    const character = source[end] ?? "";
    if (
      character === "\r" ||
      character === "\n" ||
      (flowContext &&
        (character === "," ||
          character === ";" ||
          character === "}" ||
          character === "]")) ||
      (!flowContext && /[\s"'`,;}{)\]]/u.test(character))
    )
      break;
    end += 1;
  }

  return { value: source.slice(start, end).trim(), end, wrapped: false };
}

function hasAssignedCredential(value: string): boolean {
  const state: CredentialScanState = {
    cursor: 0,
    linePrefix: "indent",
    flowDepth: 0,
    quote: null,
    quotedFlowDepth: 0,
    quotedFlowString: false,
    escaped: false,
    lastNonWhitespace: null,
  };

  for (const match of allMatches(value, CREDENTIAL_ASSIGNMENT_PATTERN)) {
    advanceCredentialContext(value, state, match.index);
    if (!hasAssignmentBoundary(value, match.index)) continue;

    const equalsAssignment = match[1] === "=";
    const nextOperatorCharacter = value[match.index + match[0].length];
    if (
      (equalsAssignment &&
        (nextOperatorCharacter === "=" || nextOperatorCharacter === ">")) ||
      (!equalsAssignment && nextOperatorCharacter === "=")
    )
      continue;
    const insidePlainString =
      state.quote !== null &&
      (state.quotedFlowDepth === 0 || state.quotedFlowString);
    const flowContext =
      (state.flowDepth > 0 || state.quotedFlowDepth > 0) &&
      (state.lastNonWhitespace === "{" ||
        state.lastNonWhitespace === "[" ||
        state.lastNonWhitespace === ",");
    const sentenceContext =
      state.lastNonWhitespace === "." ||
      state.lastNonWhitespace === "!" ||
      state.lastNonWhitespace === "?" ||
      state.lastNonWhitespace === ";" ||
      state.lastNonWhitespace === "}" ||
      state.lastNonWhitespace === "]";
    if (
      !equalsAssignment &&
      (insidePlainString ||
        !(
          state.linePrefix === "indent" ||
          state.linePrefix === "list" ||
          flowContext ||
          sentenceContext
        ))
    )
      continue;

    const parsed = parseCredentialValue(
      value,
      match.index + match[0].length,
      flowContext,
    );
    if (!isLikelyCredentialValue(parsed.value)) continue;
    if (equalsAssignment || parsed.wrapped || flowContext) return true;

    let remainderStart = parsed.end;
    while (value[remainderStart] === " " || value[remainderStart] === "\t") {
      remainderStart += 1;
    }
    const firstRemainder = value[remainderStart];
    if (
      firstRemainder === undefined ||
      firstRemainder === "\r" ||
      firstRemainder === "\n"
    )
      return true;
    if (firstRemainder === "#") return true;
    if (
      (firstRemainder === "{" || firstRemainder === "[") &&
      startsWithJsonStructure(value.slice(remainderStart))
    )
      return true;
    if (firstRemainder === ";" || firstRemainder === ",") {
      let afterSeparator = remainderStart + 1;
      while (value[afterSeparator] === " " || value[afterSeparator] === "\t") {
        afterSeparator += 1;
      }
      if (
        value[afterSeparator] === undefined ||
        value[afterSeparator] === "\r" ||
        value[afterSeparator] === "\n" ||
        value[afterSeparator] === "#"
      )
        return true;
      if (
        firstRemainder === ";" &&
        (value[afterSeparator] === "{" || value[afterSeparator] === "[") &&
        startsWithJsonStructure(value.slice(afterSeparator))
      )
        return true;
    }
    if (
      firstRemainder === ")" ||
      firstRemainder === "}" ||
      firstRemainder === "]"
    )
      return true;
    const boundedRemainder = value.slice(remainderStart, remainderStart + 512);
    if (CREDENTIAL_ASSIGNMENT_PATTERN.exec(boundedRemainder)?.index === 0)
      return true;
  }

  return false;
}

/** Returns true for bounded, high-confidence credential material. */
export function containsCredentialLikeValue(value: string): boolean {
  const normalizedValue = decodeJsonUnicodeEscapes(value);
  const structured = stripEncodedStructuredJsonStrings(value);
  return (
    PEM_PRIVATE_KEY_PATTERN.test(value) ||
    GITHUB_TOKEN_PATTERN.test(value) ||
    COMMON_TOKEN_PATTERN.test(value) ||
    inspectJsonCandidates(normalizedValue).credential ||
    structured.credential ||
    hasAssignedCredential(
      decodeJsonUnicodeEscapes(structured.value).normalize("NFKC"),
    )
  );
}

function hasUnsafeCodePoint(value: string): boolean {
  return Array.from(value).some((character) => {
    const point = character.codePointAt(0);

    return (
      point === undefined ||
      point === 0 ||
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
    );
  });
}

/** Matches the strict report path boundary used by project-brief evidence. */
export function isSafeProjectBriefPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PROJECT_BRIEF_PATH_LENGTH &&
    !hasUnsafeCodePoint(value) &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value
      .split("/")
      .every(
        (segment) => segment.length > 0 && segment !== "." && segment !== "..",
      )
  );
}
