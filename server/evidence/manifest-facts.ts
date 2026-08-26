import { parse as parseToml } from "smol-toml";

import { assertRepositoryPath } from "../github/guards.js";
import type { EvidenceTextFile } from "../github/model.js";
import { EVIDENCE_LIMITS } from "./model.js";
import type { EvidenceContentBlockDraft } from "./model.js";
import { isCredentialShapedText, stripHtmlLikeTags } from "./safe-document.js";

const JSON_MANIFESTS = new Set(["package.json", "deno.json", "composer.json"]);
const TOML_MANIFESTS = new Set(["pyproject.toml", "cargo.toml"]);
const UNSAFE_PATTERN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u;

type DataRecord = Record<string, unknown>;

function record(value: unknown): DataRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null
    ? (value as DataRecord)
    : null;
}

function own(recordValue: DataRecord | null, key: string): unknown {
  if (recordValue === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(recordValue, key);
  return descriptor !== undefined && "value" in descriptor
    ? (descriptor.value as unknown)
    : undefined;
}

function safeExtractedText(value: unknown, maximum = 512): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (
    Array.from(value).length > maximum ||
    UNSAFE_PATTERN.test(value) ||
    isCredentialShapedText(value)
  ) {
    return null;
  }
  const sanitized = stripHtmlLikeTags(
    value.replace(
      /\b(?:https?|ftp):\/\/[^\s"'<>]+/giu,
      "[link destination omitted]",
    ),
  ).text.trim();
  return sanitized.length > 0 ? sanitized : null;
}

function sourceLine(source: string, needle: string): number {
  const normalized = needle.normalize("NFKC").toLocaleLowerCase("en-US");
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  const index = lines.findIndex((line) =>
    line.normalize("NFKC").toLocaleLowerCase("en-US").includes(normalized),
  );
  return index < 0 ? 1 : index + 1;
}

class Collector {
  readonly blocks: EvidenceContentBlockDraft[] = [];
  readonly #seen = new Set<string>();

  constructor(
    private readonly file: EvidenceTextFile,
    private readonly source: string,
  ) {}

  add(heading: string, text: string, needle: string): void {
    if (this.blocks.length >= EVIDENCE_LIMITS.manifestEntries) return;
    const safeHeading = safeExtractedText(heading, 128);
    const safeText = safeExtractedText(text, EVIDENCE_LIMITS.blockCodePoints);
    if (safeHeading === null || safeText === null) return;
    const key = `${safeHeading.normalize("NFKC").toLocaleLowerCase("en-US")}\u0000${safeText.normalize("NFKC").replace(/\s+/gu, " ").toLocaleLowerCase("en-US")}`;
    if (this.#seen.has(key)) return;
    this.#seen.add(key);
    const line = sourceLine(this.source, needle);
    this.blocks.push({
      kind: "manifest",
      path: this.file.path,
      heading: safeHeading,
      text: safeText,
      startLine: line,
      endLine: line,
      trust: "repository-authored",
    });
  }
}

function sortedEntries(value: unknown): Array<[string, unknown]> {
  const object = record(value);
  if (object === null) return [];
  return Object.keys(object)
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((key) => [key, own(object, key)]);
}

function addStringMap(
  collector: Collector,
  heading: string,
  value: unknown,
  format: (name: string, version: string) => string,
): void {
  for (const [rawName, rawVersion] of sortedEntries(value)) {
    const name = safeExtractedText(rawName, 214);
    const version = safeExtractedText(rawVersion, 320);
    if (name !== null && version !== null) {
      collector.add(heading, format(name, version), rawName);
    }
  }
}

function extractJson(
  file: EvidenceTextFile,
  parsed: DataRecord,
): EvidenceContentBlockDraft[] {
  const collector = new Collector(file, file.text);
  const name = safeExtractedText(own(parsed, "name"), 214);
  if (name !== null) collector.add("Project", `Project name: ${name}`, "name");

  addStringMap(
    collector,
    "Runtime constraints",
    own(parsed, "engines"),
    (runtime, version) => `${runtime} ${version}`,
  );
  for (const key of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const) {
    addStringMap(
      collector,
      "Dependencies",
      own(parsed, key),
      (dependency, version) => `${dependency} ${version}`,
    );
  }
  addStringMap(
    collector,
    "Scripts (inert text)",
    own(parsed, "scripts"),
    (nameValue, script) => `${nameValue}: ${script}`,
  );

  const bin = own(parsed, "bin");
  const stringBin = safeExtractedText(bin, 320);
  if (stringBin !== null) {
    collector.add("Entry points", `bin: ${stringBin}`, "bin");
  } else {
    addStringMap(
      collector,
      "Entry points",
      bin,
      (entry, target) => `${entry}: ${target}`,
    );
  }
  for (const key of ["main", "module", "types"] as const) {
    const value = safeExtractedText(own(parsed, key), 320);
    if (value !== null) collector.add("Entry points", `${key}: ${value}`, key);
  }
  return collector.blocks;
}

function dependencyText(name: string, value: unknown): string | null {
  const direct = safeExtractedText(value, 320);
  if (direct !== null) return `${name} ${direct}`;
  const object = record(value);
  const version = safeExtractedText(own(object, "version"), 320);
  return version === null ? name : `${name} ${version}`;
}

function extractToml(
  file: EvidenceTextFile,
  parsed: DataRecord,
): EvidenceContentBlockDraft[] {
  const collector = new Collector(file, file.text);
  const project = record(own(parsed, "project"));
  const cargoPackage = record(own(parsed, "package"));
  const tool = record(own(parsed, "tool"));
  const poetry = record(own(tool, "poetry"));

  const name =
    safeExtractedText(own(project, "name"), 214) ??
    safeExtractedText(own(cargoPackage, "name"), 214) ??
    safeExtractedText(own(poetry, "name"), 214);
  if (name !== null) collector.add("Project", `Project name: ${name}`, "name");

  const python = safeExtractedText(own(project, "requires-python"), 320);
  if (python !== null) {
    collector.add("Runtime constraints", `Python ${python}`, "requires-python");
  }
  const rust = safeExtractedText(own(cargoPackage, "rust-version"), 320);
  if (rust !== null) {
    collector.add("Runtime constraints", `Rust ${rust}`, "rust-version");
  }

  const projectDependencies = own(project, "dependencies");
  if (Array.isArray(projectDependencies)) {
    for (const dependency of projectDependencies.slice(
      0,
      EVIDENCE_LIMITS.manifestEntries,
    )) {
      const safe = safeExtractedText(dependency, 512);
      if (safe !== null)
        collector.add("Dependencies", safe, safe.split(/[ <>=~!]/u)[0] ?? safe);
    }
  }
  for (const dependencySource of [
    own(parsed, "dependencies"),
    own(poetry, "dependencies"),
    own(parsed, "dev-dependencies"),
  ]) {
    for (const [rawName, rawValue] of sortedEntries(dependencySource)) {
      const nameValue = safeExtractedText(rawName, 214);
      if (nameValue === null) continue;
      const text = dependencyText(nameValue, rawValue);
      if (text !== null) collector.add("Dependencies", text, rawName);
    }
  }

  for (const scripts of [own(project, "scripts"), own(poetry, "scripts")]) {
    addStringMap(
      collector,
      "Entry points (inert text)",
      scripts,
      (entry, target) => `${entry}: ${target}`,
    );
  }
  return collector.blocks;
}

/** Extracts a bounded allowlist of inert facts; malformed manifests yield no evidence. */
export function extractManifestFacts(
  file: EvidenceTextFile,
): EvidenceContentBlockDraft[] {
  if (
    file.kind !== "manifest" ||
    !Number.isSafeInteger(file.bytes) ||
    file.bytes < 0 ||
    file.bytes > EVIDENCE_LIMITS.inputBytes ||
    file.text.length > EVIDENCE_LIMITS.inputBytes ||
    new TextEncoder().encode(file.text).byteLength > EVIDENCE_LIMITS.inputBytes
  )
    return [];
  try {
    const path = assertRepositoryPath(file.path);
    if (isCredentialShapedText(path)) return [];
    const safeFile = { ...file, path };
    const name = path.split("/").at(-1)?.toLocaleLowerCase("en-US") ?? "";
    if (JSON_MANIFESTS.has(name)) {
      const parsed = record(JSON.parse(file.text) as unknown);
      return parsed === null ? [] : extractJson(safeFile, parsed);
    }
    if (TOML_MANIFESTS.has(name)) {
      const parsed = record(parseToml(file.text));
      return parsed === null ? [] : extractToml(safeFile, parsed);
    }
  } catch {
    return [];
  }
  return [];
}
