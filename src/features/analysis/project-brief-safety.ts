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
  `(?:^|[^\\p{L}\\p{N}_])["']?${CREDENTIAL_KEY}["']?\\s*:\\s*${SECRET_VALUE}`,
  "iu",
);

/** Returns true for bounded, high-confidence credential material. */
export function containsCredentialLikeValue(value: string): boolean {
  const colonMatch = STRUCTURED_COLON_CREDENTIAL_PATTERN.exec(value);
  const colonValue =
    colonMatch === null
      ? ""
      : colonMatch[0].slice(colonMatch[0].indexOf(":") + 1).trimStart();
  const colonWrapper = colonValue[0];
  const wrappedColonValue =
    colonWrapper === '"' ||
    colonWrapper === "'" ||
    colonWrapper === "`" ||
    colonWrapper === "{" ||
    colonWrapper === "[";
  const colonRemainder =
    colonMatch === null
      ? value
      : value.slice(colonMatch.index + colonMatch[0].length);
  const standaloneColonValue = /^[\s"'`}\]),;]*$/u.test(colonRemainder);

  return (
    PEM_PRIVATE_KEY_PATTERN.test(value) ||
    GITHUB_TOKEN_PATTERN.test(value) ||
    COMMON_TOKEN_PATTERN.test(value) ||
    EQUAL_CREDENTIAL_PATTERN.test(value) ||
    (colonMatch !== null &&
      (wrappedColonValue ||
        standaloneColonValue ||
        /\d/u.test(colonMatch[1] ?? "") ||
        (colonMatch[1]?.length ?? 0) >= 20))
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
