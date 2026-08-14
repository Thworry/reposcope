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
  `(?:^|[^\\p{L}\\p{N}_])["']?${CREDENTIAL_KEY}["']?\\s*=\\s*${SECRET_VALUE}`,
  "iu",
);
const STRUCTURED_COLON_CREDENTIAL_PATTERN = new RegExp(
  `(?:^|[\\[{,]\\s*)["']?${CREDENTIAL_KEY}["']?\\s*:\\s*${SECRET_VALUE}`,
  "iu",
);
const DOCUMENTATION_VALUE_WORDS = new Set([
  "bearer",
  "boolean",
  "field",
  "identifies",
  "nil",
  "none",
  "null",
  "optional",
  "required",
  "rotate",
  "securely",
  "string",
  "true",
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

/** Returns true for bounded, high-confidence credential material. */
export function containsCredentialLikeValue(value: string): boolean {
  const equalMatch = EQUAL_CREDENTIAL_PATTERN.exec(value);
  const colonMatch = STRUCTURED_COLON_CREDENTIAL_PATTERN.exec(value);

  return (
    PEM_PRIVATE_KEY_PATTERN.test(value) ||
    GITHUB_TOKEN_PATTERN.test(value) ||
    COMMON_TOKEN_PATTERN.test(value) ||
    isLikelyCredentialValue(equalMatch?.[1]) ||
    isLikelyCredentialValue(colonMatch?.[1])
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
