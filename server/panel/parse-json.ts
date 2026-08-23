import { isProxy, isUint8Array } from "node:util/types";

import { containsCredentialLikeValue } from "../../src/features/analysis/project-brief-safety.js";

export const STRICT_JSON_MAX_BYTES = 2 * 1024 * 1024;
export const JSON_REPAIR_MAX_BYTES = 64 * 1024;

const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 10_000;
const MAX_JSON_PROPERTIES = 50_000;
const REPAIR_SCAN_MAX_BYTES = STRICT_JSON_MAX_BYTES;
const REPAIR_OMISSION = "[credential-bearing output omitted]";
const REPAIR_TRUNCATION = "\n[output truncated]";
const PEM_BLOCK_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+){0,4} (?:PRIVATE KEY|OPENSSH PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----[\s\S]*?(?:-----END(?: [A-Z0-9]+){0,4} (?:PRIVATE KEY|OPENSSH PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----|$)/giu;
const TOKEN_PATTERN =
  /(?:gh[pousr]_?[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|githubpat[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|sk_(?:live|test)_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{16,})/gu;
const CREDENTIAL_ASSIGNMENT_PATTERN =
  /((?:\\?["'])?(?:password|passphrase|passwd|pwd|secret|token|api[-_ ]?key|access[-_ ]?token|auth(?:orization)?|client[-_ ]?secret|private[-_ ]?key)(?:\\?["'])?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/giu;
const CREDENTIAL_IDENTIFIER_ASSIGNMENT_PATTERN =
  /(?:^|[\s,;{]|\[)(?:\\?["'])?(?:[\p{L}\p{N}_.-]{1,64}(?:(?:password|passphrase|passwd|pwd|secret|token|credential)|api[-_ ]?key|access[-_ ]?key|auth(?:orization)?|client[-_ ]?secret|private[-_ ]?key)[\p{L}\p{N}_.-]{0,64}|(?:(?:password|passphrase|passwd|pwd|secret|token|credential)|api[-_ ]?key|access[-_ ]?key|auth(?:orization)?|client[-_ ]?secret|private[-_ ]?key)[\p{L}\p{N}_.-]{1,64}|(?:database|db)[-_ ]?(?:url|uri)|connection[-_ ]?string|dsn)(?:\\?["'])?\s*[:=]/iu;
const AUTHORITY_CREDENTIAL_PATTERN =
  /https?:\/\/[^\s/@:]+:[^\s/@]+@|\b(?:bearer|basic)\s+[A-Za-z0-9._~+/-]{16,}={0,2}\b/iu;
const MODERN_TOKEN_PATTERN =
  /(?:sk-(?:proj-|svcacct-)?|glpat-|npm_|pypi-)[A-Za-z0-9_-]{16,}/u;

const typedArrayByteLengthDescriptor = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype) as object,
  "byteLength",
);

type JsonPrimitive = null | boolean | number | string;
type JsonData = JsonPrimitive | JsonData[] | { [key: string]: JsonData };

interface SnapshotBudget {
  nodes: number;
  properties: number;
  seen: WeakSet<object>;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index);
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (current >= 0xdc00 && current <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function decodeBoundedUtf8(
  input: unknown,
  maximumBytes: number,
): string | null {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) return null;
  if (typeof input === "string") {
    if (
      hasUnpairedSurrogate(input) ||
      Buffer.byteLength(input, "utf8") > maximumBytes
    ) {
      return null;
    }
    return input;
  }
  if (
    typeof input !== "object" ||
    input === null ||
    isProxy(input) ||
    !isUint8Array(input) ||
    typedArrayByteLengthDescriptor?.get === undefined
  ) {
    return null;
  }
  try {
    const byteLength = typedArrayByteLengthDescriptor.get.call(
      input,
    ) as unknown;
    if (
      typeof byteLength !== "number" ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0 ||
      byteLength > maximumBytes
    ) {
      return null;
    }
    const decoded = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(input);
    return hasUnpairedSurrogate(decoded) ? null : decoded;
  } catch {
    return null;
  }
}

function jsonObjectKeysAreUniqueAndSafe(value: string): boolean {
  const containers: Array<Set<string> | null> = [];
  let properties = 0;
  for (let index = 0; index < value.length;) {
    const character = value[index] ?? "";
    if (character === '"') {
      const start = index;
      index += 1;
      let escaped = false;
      let closed = false;
      while (index < value.length) {
        const current = value[index] ?? "";
        index += 1;
        if (escaped) escaped = false;
        else if (current === "\\") escaped = true;
        else if (current === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) return false;
      let next = index;
      while (
        value[next] === " " ||
        value[next] === "\t" ||
        value[next] === "\n" ||
        value[next] === "\r"
      ) {
        next += 1;
      }
      if (value[next] === ":") {
        const keys = containers.at(-1);
        if (!(keys instanceof Set)) return false;
        let key: unknown;
        try {
          key = JSON.parse(value.slice(start, index)) as unknown;
        } catch {
          return false;
        }
        if (
          typeof key !== "string" ||
          hasUnpairedSurrogate(key) ||
          keys.has(key)
        ) {
          return false;
        }
        properties += 1;
        if (properties > MAX_JSON_PROPERTIES) return false;
        keys.add(key);
      }
      continue;
    }
    if (character === "{") containers.push(new Set<string>());
    else if (character === "[") containers.push(null);
    else if (character === "}") {
      if (!(containers.pop() instanceof Set)) return false;
    } else if (character === "]") {
      if (containers.pop() !== null) return false;
    }
    index += 1;
  }
  return containers.length === 0;
}

function jsonBoundsAreSafe(value: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const character = value[index] ?? "";
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      else if (code <= 0x1f) return false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") {
      depth += 1;
      if (depth > MAX_JSON_DEPTH) return false;
    } else if (character === "}" || character === "]") {
      depth -= 1;
      if (depth < 0) return false;
    } else if (
      code <= 0x1f &&
      character !== " " &&
      character !== "\t" &&
      character !== "\n" &&
      character !== "\r"
    ) {
      return false;
    }
  }
  return !inString && !escaped && depth === 0;
}

function cloneJsonData(
  value: unknown,
  depth: number,
  budget: SnapshotBudget,
): JsonData | null | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    return hasUnpairedSurrogate(value) ? undefined : value;
  }
  if (typeof value !== "object" || depth > MAX_JSON_DEPTH) return undefined;
  if (isProxy(value)) return undefined;
  if (budget.seen.has(value)) return undefined;
  budget.seen.add(value);
  budget.nodes += 1;
  if (budget.nodes > MAX_JSON_NODES) return undefined;

  let descriptors: PropertyDescriptorMap;
  let prototype: object | null;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
    prototype = Object.getPrototypeOf(value) as object | null;
  } catch {
    return undefined;
  }
  if (
    prototype !== Object.prototype &&
    prototype !== Array.prototype &&
    prototype !== null
  ) {
    return undefined;
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) return undefined;

  if (Array.isArray(value)) {
    const lengthDescriptor = descriptors.length;
    if (
      lengthDescriptor === undefined ||
      !("value" in lengthDescriptor) ||
      typeof lengthDescriptor.value !== "number" ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      keys.length !== lengthDescriptor.value + 1
    ) {
      return undefined;
    }
    const result: JsonData[] = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor)
      ) {
        return undefined;
      }
      budget.properties += 1;
      if (budget.properties > MAX_JSON_PROPERTIES) return undefined;
      const cloned = cloneJsonData(descriptor.value, depth + 1, budget);
      if (cloned === undefined) return undefined;
      result.push(cloned);
    }
    return result;
  }

  const result: { [key: string]: JsonData } = Object.create(null) as {
    [key: string]: JsonData;
  };
  for (const key of keys as string[]) {
    if (hasUnpairedSurrogate(key)) return undefined;
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !("value" in descriptor)
    ) {
      return undefined;
    }
    budget.properties += 1;
    if (budget.properties > MAX_JSON_PROPERTIES) return undefined;
    const cloned = cloneJsonData(descriptor.value, depth + 1, budget);
    if (cloned === undefined) return undefined;
    Object.defineProperty(result, key, {
      value: cloned,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

/** Copies JSON-compatible data without invoking property accessors. */
export function snapshotJsonData(value: unknown): unknown {
  const cloned = cloneJsonData(value, 0, {
    nodes: 0,
    properties: 0,
    seen: new WeakSet<object>(),
  });
  return cloned === undefined ? null : cloned;
}

export class StrictJsonObjectError extends Error {
  override readonly name = "StrictJsonObjectError";

  constructor() {
    super("Model output was not one bounded JSON object");
  }
}

/** Parses exactly one bounded UTF-8 JSON object and returns detached data. */
export function parseStrictJsonObject(
  input: string | Uint8Array,
  maximumBytes = STRICT_JSON_MAX_BYTES,
): Record<string, unknown> {
  const decoded = decodeBoundedUtf8(
    input,
    Math.min(maximumBytes, STRICT_JSON_MAX_BYTES),
  );
  if (decoded === null || decoded.startsWith("\uFEFF")) {
    throw new StrictJsonObjectError();
  }
  let start = 0;
  let end = decoded.length;
  while (
    decoded[start] === " " ||
    decoded[start] === "\t" ||
    decoded[start] === "\n" ||
    decoded[start] === "\r"
  ) {
    start += 1;
  }
  while (
    decoded[end - 1] === " " ||
    decoded[end - 1] === "\t" ||
    decoded[end - 1] === "\n" ||
    decoded[end - 1] === "\r"
  ) {
    end -= 1;
  }
  const trimmed = decoded.slice(start, end);
  if (
    trimmed.length < 2 ||
    trimmed[0] !== "{" ||
    trimmed.at(-1) !== "}" ||
    !jsonBoundsAreSafe(trimmed) ||
    !jsonObjectKeysAreUniqueAndSafe(trimmed)
  ) {
    throw new StrictJsonObjectError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new StrictJsonObjectError();
  }
  const snapshot = snapshotJsonData(parsed);
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot)
  ) {
    throw new StrictJsonObjectError();
  }
  return snapshot as Record<string, unknown>;
}

function decodeJsonUnicodeEscapes(value: string): string {
  return value.replace(/\\u([0-9a-f]{4})/giu, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/** Conservatively detects credential material before model or disk retention. */
export function containsPotentialCredentialMaterial(value: string): boolean {
  const normalized = value.normalize("NFKC");
  const decoded = decodeJsonUnicodeEscapes(normalized).normalize("NFKC");
  return [value, normalized, decoded].some(
    (candidate) =>
      containsCredentialLikeValue(candidate) ||
      CREDENTIAL_IDENTIFIER_ASSIGNMENT_PATTERN.test(candidate) ||
      AUTHORITY_CREDENTIAL_PATTERN.test(candidate) ||
      MODERN_TOKEN_PATTERN.test(candidate),
  );
}

function truncateUtf8(value: string, maximumBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maximumBytes) return value;
  const markerBytes = Buffer.byteLength(REPAIR_TRUNCATION, "utf8");
  const contentLimit = Math.max(0, maximumBytes - markerBytes);
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > contentLimit) break;
    result += character;
    bytes += size;
  }
  return `${result}${REPAIR_TRUNCATION}`;
}

/**
 * Produces the only invalid-output fragment permitted in a schema-repair call.
 * The helper deliberately returns no diagnostic or original exception text.
 */
export function buildInvalidJsonRepairPayload(
  input: string | Uint8Array,
): string {
  const decoded = decodeBoundedUtf8(input, REPAIR_SCAN_MAX_BYTES);
  if (decoded === null || decoded.trim().length === 0) {
    return "[invalid output omitted]";
  }
  if (containsPotentialCredentialMaterial(decoded)) return REPAIR_OMISSION;
  let filtered = decoded
    .replace(PEM_BLOCK_PATTERN, REPAIR_OMISSION)
    .replace(TOKEN_PATTERN, REPAIR_OMISSION)
    .replace(CREDENTIAL_ASSIGNMENT_PATTERN, `$1"${REPAIR_OMISSION}"`);
  if (
    containsPotentialCredentialMaterial(filtered) ||
    containsPotentialCredentialMaterial(filtered.normalize("NFKC"))
  ) {
    filtered = REPAIR_OMISSION;
  }
  return truncateUtf8(filtered, JSON_REPAIR_MAX_BYTES);
}
