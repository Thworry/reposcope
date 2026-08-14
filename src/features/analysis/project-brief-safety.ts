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
const METADATA_FIELD_PATTERN =
  /^(?:"[^"]+"|'[^']+'|\$?[\p{L}_][\p{L}\p{N}_./-]*|\d+)\s*[:=]/u;
const NEXT_METADATA_FIELD_PATTERN =
  /^(?:"[^"]+"|'[^']+'|\$?[\p{L}_][\p{L}\p{N}_./-]*|\d+)\s*[:=][ \t]+/u;
const PRIOR_METADATA_FIELD_PATTERN =
  /(?:^|[,;][ \t]*)(?:"[^"]+"|'[^']+'|\$?[\p{L}_][\p{L}\p{N}_./-]*|\d+)\s*[:=][ \t]*[^,;\r\n]*[,;][ \t]*$/u;
const DOCUMENTATION_VALUE_WORDS = new Set([
  "a",
  "access",
  "an",
  "application",
  "accepted",
  "avoid",
  "bearer",
  "based",
  "boolean",
  "browser",
  "configure",
  "config",
  "configuration",
  "cryptographically",
  "custom",
  "client",
  "default",
  "defaults",
  "disabled",
  "documented",
  "documentation",
  "disable",
  "each",
  "empty",
  "enabled",
  "encrypted",
  "encoded",
  "example",
  "examples",
  "external",
  "field",
  "format",
  "formats",
  "generated",
  "guidance",
  "hardware",
  "hashed",
  "identifies",
  "identifier",
  "implementation",
  "immutable",
  "is",
  "it",
  "keep",
  "keychain",
  "log",
  "lived",
  "managed",
  "management",
  "metadata",
  "meaning",
  "minimum",
  "masked",
  "nil",
  "never",
  "no",
  "none",
  "null",
  "obtained",
  "optional",
  "of",
  "organization",
  "opaque",
  "only",
  "out",
  "object",
  "parameter",
  "placeholder",
  "placeholders",
  "policies",
  "policy",
  "provided",
  "property",
  "reference",
  "recommended",
  "requirements",
  "responsibility",
  "read",
  "required",
  "rotate",
  "rotation",
  "salted",
  "scope",
  "sample",
  "samples",
  "schema",
  "schemas",
  "rules",
  "secure",
  "securely",
  "server",
  "settings",
  "side",
  "store",
  "storage",
  "stores",
  "string",
  "serialized",
  "secrets",
  "source",
  "specific",
  "strong",
  "the",
  "third",
  "text",
  "textual",
  "to",
  "token",
  "true",
  "type",
  "types",
  "defined",
  "control",
  "unset",
  "validation",
  "variable",
  "user",
  "vendor",
  "short",
  "s",
  "values",
  "value",
  "false",
  "backed",
  "environmentally",
  "ephemeral",
  "exportable",
  "locally",
  "non",
  "party",
  "platform",
  "runtime",
  "are",
  "base64",
  "included",
  "passphrase",
  "secret",
  "support",
  "vault",
  "centrally",
  "kms",
  "rotatable",
  "single",
  "use",
  "hash",
  "header",
  "protocol",
  "and",
  "at",
  "after",
  "app",
  "account",
  "authentication",
  "automatically",
  "below",
  "by",
  "cloud",
  "details",
  "device",
  "docs",
  "during",
  "environment",
  "expires",
  "feature",
  "guide",
  "hashes",
  "identify",
  "in",
  "leaves",
  "login",
  "machine",
  "name",
  "note",
  "oauth",
  "ordinary",
  "operator",
  "per",
  "protected",
  "scoped",
  "security",
  "see",
  "sha256",
  "sufficient",
  "supplied",
  "supported",
  "tenant",
  "through",
  "tpm",
  "stored",
  "your",
  "x",
  "credentials",
  "from",
  "hsm",
  "issued",
  "logging",
  "logs",
  "logout",
  "resettable",
  "revoked",
  "sharing",
  "storing",
  "synchronized",
  "users",
  "them",
  "on",
  "aes256",
  "oauth2",
  "pbkdf2",
  "rsa2048",
]);
const STRUCTURED_DOCUMENTATION_VALUE_WORDS = new Set([
  "boolean",
  "false",
  "null",
  "optional",
  "required",
  "string",
  "true",
]);
const WEAK_DEFAULT_CREDENTIAL_VALUE_WORDS = new Set([
  "default",
  "defaults",
  "example",
  "examples",
  "sample",
  "samples",
]);
const BRACKET_DOCUMENTATION_PREFIX_WORDS = new Set([
  "metadata",
  "rules",
  "values",
]);
const DOCUMENTATION_QUALIFIER_WORDS = new Set([
  "and",
  "according",
  "as",
  "between",
  "by",
  "compact",
  "compliant",
  "defined",
  "encoded",
  "characters",
  "for",
  "form",
  "format",
  "in",
  "length",
  "maximum",
  "max",
  "minimum",
  "min",
  "of",
  "per",
  "production",
  "recommended",
  "rfc",
  "rfcs",
  "section",
  "sections",
  "serialization",
  "settings",
  "specified",
  "to",
  "use",
  "with",
  "is",
]);
const DOCUMENTATION_TECHNICAL_VALUE_PATTERN =
  /^(?:(?:oauth[1-9]\d?(?:\.\d)?)|oidc|(?:saml[1-9]\d?)|(?:tls[1-9]\d?(?:\.\d)?)|(?:pbkdf[1-9]\d?(?:-(?:hmac-)?sha-?\d{3,4})?)|(?:hkdf-sha-?\d{3,4})|(?:aes(?:-?(?:128|192|256))?(?:-(?:gcm|cbc|ctr|ccm|xts))?)|(?:rsa-?\d{3,5})|(?:(?:rs|es|hs)\d{3,4})|(?:sha[1-5]?-?\d{2,4})|md5|(?:hmac(?:-?sha-?\d{2,4})?)|(?:argon2(?:id|i|d)?)|(?:ed(?:25519|448))|(?:p-?\d{3,4})|(?:ecdh-?p?\d{3,4})|(?:ecdsa-?p?\d{3,4})|(?:x(?:25519|448))|(?:curve(?:25519|448))|(?:secp(?:256k1|256r1|384r1|521r1))|(?:x?chacha20(?:-?poly1305)?)|(?:utf-?(?:8|16|32))|(?:uuid(?:v[1-8])?)|(?:base(?:16|32|64|85))|(?:blake(?:2[bs]|3))|(?:pkcs#?\d{1,2})|(?:x\.509)|(?:der(?:-encoded)?)|jwe|jwt|totp|hotp|dpop|ssh|pgp|mtls|webauthn|jwk|pem|bcrypt|scrypt|(?:(?:bearer|refresh|session|jwt)-token)|api-key|secret-reference)$/iu;
const SECTION_REFERENCE = "\\d{1,2}(?: \\d{1,2}){0,2}";
const RFC_CLAUSE = `rfc \\d{4}(?: section ${SECTION_REFERENCE}| sections ${SECTION_REFERENCE}(?: and ${SECTION_REFERENCE})?)?`;
const RFC_QUALIFIER_PATTERN = new RegExp(
  `^(?:(?:per|as (?:defined|specified) (?:in|by)|according to|compliant with) )?(?:${RFC_CLAUSE}(?: and ${RFC_CLAUSE})?|rfcs \\d{4} and \\d{4})$`,
  "u",
);
const SECTION_QUALIFIER_PATTERN =
  /^sections? \d{1,2}(?: (?:and )?\d{1,2}){0,2}$/u;
const LENGTH_QUALIFIER_PATTERN =
  /^(?:(?:min|minimum|max|maximum) length(?: of| is)? \d{1,4}(?: to \d{1,4})?|length \d{1,4}(?: to \d{1,4})?|length between \d{1,4} and \d{1,4}|min max length between \d{1,4} and \d{1,4})(?: characters)?$/u;

function normalizedValueWords(value: string | undefined): string[] {
  if (value === undefined) return [];

  return value
    .normalize("NFKC")
    .replace(/[.:!?]+$/u, "")
    .toLocaleLowerCase("en-US")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function isDocumentationTechnicalValue(value: string | undefined): boolean {
  if (value === undefined) return false;
  return DOCUMENTATION_TECHNICAL_VALUE_PATTERN.test(
    value
      .normalize("NFKC")
      .trim()
      .replace(/[.!?]+$/u, "")
      .toLocaleLowerCase("en-US"),
  );
}

function isLikelyCredentialValue(
  value: string | undefined,
  allowNaturalDocumentation: boolean,
): boolean {
  const words = normalizedValueWords(value);
  if (!allowNaturalDocumentation) {
    if (
      words.length > 0 &&
      words.every((word) => STRUCTURED_DOCUMENTATION_VALUE_WORDS.has(word))
    )
      return false;
    if (
      value !== undefined &&
      isStructuredInstructionalDocumentationPhrase(value)
    )
      return false;
    return words.length > 0;
  }
  if (
    isDocumentationTechnicalValue(value) ||
    isQualifiedDocumentationValue(value) ||
    isBracketDocumentationPhrase(value, words)
  )
    return false;
  if (value !== undefined && isPossessiveDocumentationPhrase(value))
    return false;
  const broadCredential =
    words.length > 0 &&
    !words.every((word) => DOCUMENTATION_VALUE_WORDS.has(word));
  return broadCredential;
}

function isQualifiedDocumentationValue(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.normalize("NFKC").trim();
  const firstToken = normalized.match(/^[^\s([{]+/u)?.[0];
  if (firstToken === undefined) return false;
  const firstWords = normalizedValueWords(firstToken);
  if (
    !isDocumentationTechnicalValue(firstToken) &&
    !(
      firstWords.length === 1 &&
      STRUCTURED_DOCUMENTATION_VALUE_WORDS.has(firstWords[0] ?? "")
    )
  )
    return false;
  const rawQualifiers = normalized.slice(firstToken.length);
  const grammarSource = rawQualifiers
    .replace(/min\/max/giu, "min max")
    .replace(/(\d)[-–](\d)/gu, "$1 to $2");
  if (/[^A-Za-z0-9\s()[\],.]/u.test(grammarSource)) return false;
  const qualifiers = normalizedValueWords(grammarSource);
  const documentationQualifiers = qualifiers.filter((word) =>
    DOCUMENTATION_QUALIFIER_WORDS.has(word),
  );
  const numericQualifiers = qualifiers.filter((word) => /^\d+$/u.test(word));
  if (
    qualifiers.length === 0 ||
    documentationQualifiers.length === 0 ||
    !qualifiers.every(
      (word) =>
        DOCUMENTATION_QUALIFIER_WORDS.has(word) || /^\d{1,4}$/u.test(word),
    )
  )
    return false;
  if (numericQualifiers.length === 0) return true;
  const qualifierSequence = qualifiers.join(" ");
  if (RFC_QUALIFIER_PATTERN.test(qualifierSequence)) return true;
  if (SECTION_QUALIFIER_PATTERN.test(qualifierSequence)) return true;
  if (firstWords[0] === "string") {
    return (
      LENGTH_QUALIFIER_PATTERN.test(qualifierSequence) &&
      numericQualifiers.every((word) => Number(word) <= 4_096)
    );
  }
  return false;
}

function isBracketDocumentationPhrase(
  value: string | undefined,
  words: readonly string[],
): boolean {
  const remainingWords = words.slice(1);
  const numericWords = remainingWords.filter((word) => /^\d+$/u.test(word));
  const hasDocumentationWord = remainingWords.some((word) =>
    DOCUMENTATION_VALUE_WORDS.has(word),
  );
  const safeSmallExample =
    (words[0] ?? "") === "metadata" &&
    remainingWords.includes("details") &&
    numericWords.length <= 3 &&
    numericWords.every((word) => /^\d$/u.test(word));
  return (
    value !== undefined &&
    (value.includes("{") || value.includes("[")) &&
    BRACKET_DOCUMENTATION_PREFIX_WORDS.has(words[0] ?? "") &&
    words.length > 1 &&
    hasDocumentationWord &&
    words.every(
      (word) => DOCUMENTATION_VALUE_WORDS.has(word) || /^\d+$/u.test(word),
    ) &&
    (numericWords.length === 0 || safeSmallExample)
  );
}

function isStructuredInstructionalDocumentationPhrase(value: string): boolean {
  const normalized = value.normalize("NFKC").trim();
  const words = normalizedValueWords(normalized);
  return (
    /^(?:avoid (?:logging|sharing|storing)\b|keep (?:it|this|them) out of\b|never log (?:it|this|them)\b)/iu.test(
      normalized,
    ) &&
    words.length > 1 &&
    words.every((word) => DOCUMENTATION_VALUE_WORDS.has(word))
  );
}

function isPossessiveDocumentationPhrase(value: string): boolean {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("en-US");
  if (!/\p{L}+(?:['’]s|s['’])/u.test(normalized)) return false;
  const remainingWords = normalizedValueWords(
    normalized.replace(/\p{L}+(?:['’]s|s['’])/gu, " "),
  );
  return (
    remainingWords.length > 0 &&
    remainingWords.every((word) => DOCUMENTATION_VALUE_WORDS.has(word))
  );
}

function isLikelyStructuredCredentialValue(value: string): boolean {
  const words = normalizedValueWords(value);
  return (
    words.length > 0 &&
    !words.every((word) => STRUCTURED_DOCUMENTATION_VALUE_WORDS.has(word))
  );
}

function isWeakDefaultCredentialValue(value: string | undefined): boolean {
  const words = normalizedValueWords(value);
  return (
    words.length > 0 &&
    words.every((word) => WEAK_DEFAULT_CREDENTIAL_VALUE_WORDS.has(word))
  );
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

function startsWithLowercaseCredentialKey(match: string): boolean {
  const firstLetter = /[A-Za-z]/u.exec(match)?.[0];
  return firstLetter !== undefined && firstLetter === firstLetter.toLowerCase();
}

function afterHorizontalWhitespace(value: string, start: number): number {
  let cursor = start;
  while (value[cursor] === " " || value[cursor] === "\t") cursor += 1;
  return cursor;
}

function hasPriorMetadataField(value: string, end: number): boolean {
  const boundedStart = Math.max(0, end - 512);
  const window = value.slice(boundedStart, end);
  const lineStart = Math.max(
    window.lastIndexOf("\n"),
    window.lastIndexOf("\r"),
  );
  return PRIOR_METADATA_FIELD_PATTERN.test(window.slice(lineStart + 1));
}

function isLineEndOrComment(value: string, start: number): boolean {
  const character = value[start];
  return (
    character === undefined ||
    character === "\r" ||
    character === "\n" ||
    character === "#"
  );
}

function hasStructuredYamlTerminator(
  value: string,
  remainderStart: number,
): boolean {
  if (isLineEndOrComment(value, remainderStart)) return true;

  const separator = value[remainderStart];
  if (separator !== "," && separator !== ";") return false;

  const afterSeparator = afterHorizontalWhitespace(value, remainderStart + 1);
  return (
    isLineEndOrComment(value, afterSeparator) ||
    METADATA_FIELD_PATTERN.test(
      value.slice(afterSeparator, afterSeparator + 128),
    )
  );
}

function hasTopLevelWeakYamlTerminator(
  value: string,
  remainderStart: number,
  parsedValue: string,
): boolean {
  if (/[.!?]$/u.test(parsedValue.trim())) return false;
  if (isLineEndOrComment(value, remainderStart)) return true;

  const separator = value[remainderStart];
  if (separator !== "," && separator !== ";") return false;
  const afterSeparator = afterHorizontalWhitespace(value, remainderStart + 1);
  return METADATA_FIELD_PATTERN.test(
    value.slice(afterSeparator, afterSeparator + 128),
  );
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
        if (
          typeof entry === "string" &&
          isLikelyStructuredCredentialValue(entry)
        ) {
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

function extendPlainCredentialValue(
  source: string,
  start: number,
  parsed: ParsedCredentialValue,
  shouldExtend: boolean,
): ParsedCredentialValue {
  if (parsed.wrapped || !shouldExtend) return parsed;

  let end = start;
  const boundedEnd = Math.min(source.length, start + 512);
  while (end < boundedEnd) {
    const character = source[end] ?? "";
    if (
      character === "\r" ||
      character === "\n" ||
      (character === "#" &&
        (end === start || /\s/u.test(source[end - 1] ?? "")))
    )
      break;
    if (character === "," || character === ";") {
      const afterSeparator = afterHorizontalWhitespace(source, end + 1);
      if (
        source[afterSeparator] === undefined ||
        source[afterSeparator] === "\r" ||
        source[afterSeparator] === "\n" ||
        source[afterSeparator] === "#"
      )
        break;
      if (
        NEXT_METADATA_FIELD_PATTERN.test(
          source.slice(afterSeparator, afterSeparator + 128),
        )
      )
        break;
    }
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
    const lowercaseCredentialKey = startsWithLowercaseCredentialKey(match[0]);
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
      state.lastNonWhitespace === "," ||
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

    const quotedCredentialKey = /^(?:\\?["'])/u.test(match[0]);
    const leadingYamlIndent =
      state.linePrefix === "indent" &&
      match.index > 0 &&
      (value[match.index - 1] === " " || value[match.index - 1] === "\t");
    const naturalTitleContext =
      !lowercaseCredentialKey &&
      state.linePrefix === "indent" &&
      !leadingYamlIndent &&
      !quotedCredentialKey;
    const strictStructuredContext =
      equalsAssignment ||
      flowContext ||
      leadingYamlIndent ||
      state.linePrefix === "list" ||
      quotedCredentialKey ||
      (state.linePrefix === "indent" && lowercaseCredentialKey) ||
      hasPriorMetadataField(value, match.index);
    const allowNaturalDocumentation =
      naturalTitleContext || !strictStructuredContext;
    const valueStart = match.index + match[0].length;
    const preliminaryValue = parseCredentialValue(
      value,
      valueStart,
      flowContext,
    );
    const parsed = extendPlainCredentialValue(
      value,
      valueStart,
      preliminaryValue,
      !flowContext,
    );
    const proseLikely = isLikelyCredentialValue(
      parsed.value,
      allowNaturalDocumentation,
    );
    const structuredLikely = isLikelyStructuredCredentialValue(parsed.value);
    const weakDefaultCredential = isWeakDefaultCredentialValue(parsed.value);
    const strictWeakYamlContext =
      lowercaseCredentialKey ||
      state.linePrefix === "list" ||
      leadingYamlIndent ||
      quotedCredentialKey ||
      state.lastNonWhitespace === "," ||
      state.lastNonWhitespace === ";";
    const explicitProseContext =
      lowercaseCredentialKey ||
      state.linePrefix === "list" ||
      leadingYamlIndent ||
      quotedCredentialKey ||
      state.lastNonWhitespace === "," ||
      state.lastNonWhitespace === ";" ||
      state.linePrefix === "indent";
    if (
      equalsAssignment ||
      flowContext ||
      (parsed.wrapped && proseLikely && explicitProseContext)
    ) {
      if (structuredLikely) return true;
      continue;
    }
    if (!proseLikely && !structuredLikely) continue;

    const remainderStart = afterHorizontalWhitespace(value, parsed.end);
    const firstRemainder = value[remainderStart];
    if (!proseLikely) {
      if (
        weakDefaultCredential &&
        ((strictWeakYamlContext &&
          hasStructuredYamlTerminator(value, remainderStart)) ||
          (!strictWeakYamlContext &&
            hasTopLevelWeakYamlTerminator(value, remainderStart, parsed.value)))
      )
        return true;
      continue;
    }
    if (!explicitProseContext) continue;
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
        METADATA_FIELD_PATTERN.test(
          value.slice(afterSeparator, afterSeparator + 128),
        )
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
