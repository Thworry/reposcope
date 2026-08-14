export const MAX_PROJECT_BRIEF_PATH_LENGTH = 1_024;

const GITHUB_TOKEN_PATTERN =
  /(?:^|[^A-Za-z0-9_])(?:gh[pousr]_?[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|githubpat[A-Za-z0-9]{20,})(?=$|[^A-Za-z0-9_])/u;
const COMMON_TOKEN_PATTERN =
  /\b(?:AKIA[0-9A-Z]{16}|sk_(?:live|test)_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{16,})\b/u;
const PEM_PRIVATE_KEY_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+){0,4} PRIVATE KEY-----/iu;
const CREDENTIAL_KEY =
  "(?:password|passphrase|passwd|pwd|secret|token|api[-_ ]?key|access[-_ ]?token|auth(?:orization)?|client[-_ ]?secret|private[-_ ]?key)";
const SECRET_VALUE = "(?:(?:\"|'|`|\\{|\\[)\\s*)?([^\\s\"'`,;}{)\\]]{4,})";
const EQUAL_CREDENTIAL_PATTERN = new RegExp(
  `["']?${CREDENTIAL_KEY}["']?\\s*=\\s*${SECRET_VALUE}`,
  "iu",
);
const STRUCTURED_COLON_CREDENTIAL_PATTERN = new RegExp(
  `["']?${CREDENTIAL_KEY}["']?\\s*:\\s*${SECRET_VALUE}`,
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
  "nil",
  "never",
  "none",
  "null",
  "obtained",
  "optional",
  "provided",
  "required",
  "rotate",
  "securely",
  "store",
  "string",
  "true",
  "validation",
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

interface ColonScanState {
  cursor: number;
  linePrefix: "indent" | "dash" | "list" | "other";
  flowDepth: number;
  quote: '"' | "'" | "`" | null;
  escaped: boolean;
  lastNonWhitespace: string | null;
}

function advanceColonContext(
  value: string,
  state: ColonScanState,
  end: number,
): void {
  while (state.cursor < end) {
    const character = value[state.cursor] ?? "";
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
        state.escaped = false;
      } else if (character === "\\") {
        state.escaped = true;
      } else if (character === state.quote) {
        state.quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      state.quote = character;
    } else if (character === "{" || character === "[") {
      state.flowDepth += 1;
    } else if (character === "}" || character === "]") {
      state.flowDepth = Math.max(0, state.flowDepth - 1);
    }
  }
}

function closingWrapper(
  match: RegExpExecArray,
  credential: string,
): string | null {
  const beforeCredential = match[0].slice(0, -credential.length).trimEnd();
  const opening = beforeCredential.at(-1);

  if (opening === '"' || opening === "'" || opening === "`") return opening;
  if (opening === "{") return "}";
  if (opening === "[") return "]";
  return null;
}

function hasEqualCredential(value: string): boolean {
  for (const match of allMatches(value, EQUAL_CREDENTIAL_PATTERN)) {
    if (
      hasAssignmentBoundary(value, match.index) &&
      isLikelyCredentialValue(match[1])
    )
      return true;
  }

  return false;
}

function hasStructuredColonCredential(value: string): boolean {
  const state: ColonScanState = {
    cursor: 0,
    linePrefix: "indent",
    flowDepth: 0,
    quote: null,
    escaped: false,
    lastNonWhitespace: null,
  };

  for (const match of allMatches(value, STRUCTURED_COLON_CREDENTIAL_PATTERN)) {
    advanceColonContext(value, state, match.index);
    const flowContext =
      state.flowDepth > 0 &&
      (state.lastNonWhitespace === "{" ||
        state.lastNonWhitespace === "[" ||
        state.lastNonWhitespace === ",");
    const sentenceContext =
      state.lastNonWhitespace === "." ||
      state.lastNonWhitespace === "!" ||
      state.lastNonWhitespace === "?";
    if (
      !(
        state.linePrefix === "indent" ||
        state.linePrefix === "list" ||
        flowContext ||
        sentenceContext
      ) ||
      !isLikelyCredentialValue(match[1])
    )
      continue;

    let remainderStart = match.index + match[0].length;
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
    const expectedWrapper = closingWrapper(match, match[1] ?? "");
    if (expectedWrapper !== null && firstRemainder === expectedWrapper)
      return true;
    if (
      firstRemainder === ")" ||
      firstRemainder === "}" ||
      firstRemainder === "]"
    )
      return true;
    if (flowContext && (firstRemainder === "," || firstRemainder === ";"))
      return true;
    const boundedRemainder = value.slice(remainderStart, remainderStart + 512);
    if (STRUCTURED_COLON_CREDENTIAL_PATTERN.exec(boundedRemainder)?.index === 0)
      return true;
  }

  return false;
}

/** Returns true for bounded, high-confidence credential material. */
export function containsCredentialLikeValue(value: string): boolean {
  return (
    PEM_PRIVATE_KEY_PATTERN.test(value) ||
    GITHUB_TOKEN_PATTERN.test(value) ||
    COMMON_TOKEN_PATTERN.test(value) ||
    hasEqualCredential(value) ||
    hasStructuredColonCredential(value)
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
