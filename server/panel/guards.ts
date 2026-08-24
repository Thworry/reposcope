import { types as nodeUtilTypes } from "node:util";

import { containsCredentialLikeValue } from "../../src/features/analysis/project-brief-safety.js";
import type { Language } from "../../src/features/analysis/model.js";
import { isDeepReport } from "../../src/features/deep-analysis/guards.js";
import {
  DEEP_CONFIDENCE,
  DEEP_PROVENANCE,
  DEEP_REPORT_CAPS,
} from "../../src/features/deep-analysis/model.js";
import type {
  DeepEvidence,
  DeepReport,
} from "../../src/features/deep-analysis/model.js";
import type { EvidencePack } from "../evidence/model.js";
import {
  buildAlternativeRepositoryUrl,
  buildPrimaryRepositoryFileUrl,
} from "../evidence/build-evidence-pack.js";
import {
  assertCanonicalTimestamp,
  assertRepositoryComponent,
} from "../github/guards.js";
import {
  CHALLENGE_DESTINATIONS,
  EXPERT_ROLES,
  EXPERT_SECTIONS,
  PANEL_LIMITS,
  ROLE_REQUIRED_SECTIONS,
  SKEPTIC_CHALLENGE_KINDS,
} from "./model.js";
import type {
  ChallengeDestination,
  DeepReportDraft,
  DeepReportServerFields,
  ExpertFinding,
  ExpertReview,
  ExpertRole,
  ExpertSection,
  SkepticalChallenge,
  SkepticalReview,
} from "./model.js";

const MAX_EVIDENCE_REFERENCES = 6;
const MAX_TEXT_CODE_POINTS = DEEP_REPORT_CAPS.textCodePoints;
const MAX_GRAPH_DEPTH = 64;
const MAX_GRAPH_NODES = 10_000;
const MAX_GRAPH_PROPERTIES = 50_000;
const MAX_GRAPH_STRING_CODE_UNITS = 8_192;
const MAX_GRAPH_TOTAL_STRING_CODE_UNITS = 512 * 1_024;
const UNSAFE_CODE_POINT_PATTERN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u;
const FORBIDDEN_MARKUP_PATTERN =
  /<!--|<!\s*doctype\b|<\/?[A-Za-z][^>]*>|<\?xml\b|```|~~~|!?\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])|(?:[A-Za-z][A-Za-z0-9+.-]{1,31}:\/\/|mailto:|(?:javascript|data|file):|www\.)/iu;
const POPULARITY_PATTERN =
  /\b(?:stars?|stargazers?|watch(?:ers?)?|forks?|popularity|popular)\b|星标|收藏数|关注数|派生数|分叉数|受欢迎|热度/iu;
const LIVE_COUNT_NARRATIVE_PATTERN =
  /(?:\b(?:stars?|stargazers?|watch(?:ers?)?|forks?)\b[^\p{N}\r\n]{0,40}\p{N}|\p{N}[\p{N},._\s万亿千百kKmM]{0,20}[^\r\n]{0,24}\b(?:stars?|stargazers?|watch(?:ers?)?|forks?)\b|(?:星标|收藏数|关注数|派生数|分叉数)[^\p{N}\r\n]{0,40}\p{N}|\p{N}[\p{N},._\s万亿千百kKmM]{0,20}(?:个)?(?:星标|收藏|关注|派生|分叉))/iu;
const POPULARITY_QUALITY_PATTERN =
  /\b(?:reliable|secure|safe|trustworthy|stable|mature|maintained|quality)\b|靠谱|可靠|安全|可信|稳定|成熟|维护良好|高质量/iu;
const POPULARITY_DISCLAIMER_PATTERN =
  /\b(?:does not|do not|doesn't|cannot|can't|is not evidence|not enough to|must not|should not)\b[^.?!;]{0,120}\b(?:prove|establish|show|mean|infer|judge)\b|\b(?:cannot|can't|must not|should not)\b[^.?!;]{0,120}\b(?:infer|judge)\b|\b(?:attention|popularity)\b[^.?!;]{0,80}\b(?:not|never)\b[^.?!;]{0,40}\b(?:reliability|security|quality)\b|\bnot\b[^.?!;]{0,20}\b(?:reliability|security|quality)\b|(?:不代表|不能证明|无法说明|不足以说明|不等于|不能据此判断|不应据此判断)/iu;
const ABSOLUTE_SAFETY_PATTERN =
  /\b(?:absolutely|completely|perfectly|definitely|guaranteed) (?:safe|secure|risk-free)\b|\b(?:vulnerability|malware|tracking|leak|legal-risk)[ -]?free\b|\b(?:does not|cannot) (?:track|leak)\b|\b(?:(?:the|this) (?:project|repository|application|app|software)|it)\s+(?:does not|doesn't|cannot|never)\s+(?:collect|transmit|send|share|store|track|leak|expose)\b|\bno\s+(?:known\s+)?(?:vulnerabilit(?:y|ies)|malware|tracking|data leaks?)\s+(?:were|was|are|is)\s+(?:found|detected|observed)\b|\b(?:the project|this project|it) never (?:tracks?|leaks?)\b|\b(?:has|contains|there (?:are|is)|proves?)[^.?!;]{0,100}\bno (?:known )?(?:vulnerabilit(?:y|ies)|malicious (?:code|behavior)|tracking|data leaks?|legal risks?)\b|(?:不存在|没有)(?:任何)?(?:漏洞|恶意(?:代码|行为)?|跟踪|追踪|泄密|数据泄露|法律风险)|(?:项目|仓库|应用|软件)(?:不会|从不)(?:收集|传输|发送|共享|存储|跟踪|追踪|泄露)|(?:绝对|完全|百分之百|保证)(?:安全|可靠)/iu;
const DIRECT_SAFETY_ASSURANCE_PATTERN =
  /\b(?:(?:the|this) (?:project|repository|application|app|software|code)|it)\s+(?:is|remains|will be|seems|appears|looks)\s+(?:safe|secure|trustworthy|risk[- ]free)\b|\b(?:safe|secure)\s+(?:to use|for production|by default)\b|\b(?:poses?|presents?|has)\s+no\s+(?:security|privacy|legal|data[- ]leak)\s+risk\b|(?:项目|仓库|应用|软件|代码)(?:是|很|较为|相对|完全|绝对)?(?:安全|可信|无风险)|(?:可以放心|无需担心)/iu;
const SAFETY_QUALIFIER_PATTERN =
  /\b(?:cannot|can't|does not|doesn't|is not enough to|is insufficient to|insufficient evidence to|not enough evidence to)\b[^.?!;]{0,120}\b(?:establish|prove|confirm|conclude|determine|call|consider|assume)\b|(?:无法|不能|不足以|证据不足)[^。！？；]{0,120}(?:确认|证明|断定|判断|视为)/iu;
const POSITIVE_TURN_PATTERN =
  /\b(?:but|however|yet|nevertheless|still|therefore|thus)\b|(?:但|不过|然而|可是|仍然|因此|所以)/iu;
const UNKNOWN_ASSURANCE_PATTERN =
  /\b(?:but|however|yet|nevertheless|because|since|although|though|while|whereas|therefore|thus|so|as)\b[^.?!;]{0,120}\b(?:safe|secure|reliable|risk-free)\b|\band\s+(?:(?:the|this) (?:project|repository|application|app|software)|it)\s+(?:is|remains|seems|appears)\s+(?:safe|secure|reliable|risk-free)\b|\b(?:definitely|certainly|clearly|surely|risk-free)\b|,\s*(?:the project|this project|it)\b[^.?!;]{0,80}\b(?:safe|secure|reliable)\b|(?:但|不过|然而|可是|因为|由于|尽管|即使|所以|因此|肯定|一定|无需担心|可以放心|毫无风险)|[,，][^。！？；]{0,80}(?:安全|可靠|无风险)/iu;
const DANGEROUS_COMMAND_PATTERN =
  /\brm\b[^\r\n]{0,100}(?:(?:--recursive|-r)\b[^\r\n]{0,80}(?:--force|-f)\b|(?:--force|-f)\b[^\r\n]{0,80}(?:--recursive|-r)\b)|\brm\s+-[^\s]*(?:r[^\s]*f|f[^\s]*r)\b|\b(?:curl|wget)\b[^\n|]{0,240}\|\s*(?:sudo\s+)?(?:sh|bash|zsh|fish|powershell|pwsh)\b|\b(?:mkfs(?:\.[A-Za-z0-9]+)?|diskutil\s+erase|format\s+[A-Za-z]:|dd\s+[^\n]*\bof=\/dev\/|git\s+(?:reset\s+--hard|clean\s+-[^\s]*f|push\s+(?:--force|-f))|(?:drop|truncate)\s+(?:database|table)|delete\s+from\s+\S+|invoke-expression|\biex\b|remove-item\b(?=[^\n]{0,200}\b-recurse\b)(?=[^\n]{0,200}\b-force\b)|(?:chmod|chown)\s+-R\b[^\n]{0,160}\b(?:777|\/)|(?:delete|erase|wipe|remove)\b[^.?!;]{0,100}\b(?:home directory|root filesystem|all files|entire drive)|(?:删除|清空|抹掉)[^。！？；]{0,100}(?:主目录|根目录|所有文件|整个磁盘))/iu;
const COMMAND_EXECUTABLE_PATTERN =
  /^(?:\$\s*)?(?:npm|pnpm|yarn|bun|deno|node|npx|python(?:3)?|pip(?:3)?|uv|poetry|cargo|go|docker(?:\s+compose)?|make|cmake|composer|php|ruby|bundle|gem|java|mvn|gradle|dotnet|swift|xcodebuild|git|gh|bash|sh|zsh|powershell|pwsh)\b/iu;
const COMMAND_ATTRIBUTION_PATTERN =
  /\bREADME\b[^.?!;]{0,160}\b(?:documents?|records?|lists?|shows?|states?|provides?)\b|\b(?:documents?|records?|lists?|shows?|states?|provides?)\b[^.?!;]{0,160}\bREADME\b|(?:README|项目说明|仓库说明)[^。！？；]{0,160}(?:记录|列出|给出|注明|写明|提供)/iu;
const FUNCTION_LEVEL_CRITIQUE_PATTERN =
  /(?:\b(?:function|method|hook)\s+[`'"]?[A-Za-z_$][A-Za-z0-9_$.-]*[`'"]?|\b[`'"]?[A-Za-z_$][A-Za-z0-9_$.-]*[`'"]?\s+(?:function|method|hook)|\b[A-Za-z_$][A-Za-z0-9_$.-]*\s*\([^)]{0,80}\))\s+(?:is|looks|seems|appears|should|needs?|has)\b[^.?!;]{0,100}\b(?:bad|poor|messy|complex|confusing|rewrite|refactor|optimi[sz]e|problem)|(?:(?:函数|方法|钩子)[“”'"`]?[\p{L}_$][\p{L}\p{N}_$.-]*[“”'"`]?|[“”'"`]?[\p{L}_$][\p{L}\p{N}_$.-]*[“”'"`]?(?:函数|方法|钩子))(?:写得|实现得|需要|应该|存在)[^。！？；]{0,80}(?:糟糕|很差|复杂|混乱|重写|重构|优化|问题)/iu;

type DataRecord = Record<string, unknown>;

function strictDataSnapshot(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return null;
  try {
    const pending: Array<{ value: unknown; depth: number }> = [
      { value, depth: 0 },
    ];
    const seen = new WeakSet<object>();
    let nodes = 0;
    let properties = 0;
    let stringCodeUnits = 0;
    while (pending.length > 0) {
      const item = pending.pop();
      const current = item?.value;
      const depth = item?.depth ?? MAX_GRAPH_DEPTH + 1;
      if (typeof current !== "object" || current === null) return null;
      if (
        depth > MAX_GRAPH_DEPTH ||
        nodeUtilTypes.isProxy(current) ||
        seen.has(current)
      )
        return null;
      seen.add(current);
      nodes += 1;
      if (nodes > MAX_GRAPH_NODES) return null;
      if (Array.isArray(current) && current.length > MAX_GRAPH_PROPERTIES) {
        return null;
      }
      const prototype = Object.getPrototypeOf(current) as unknown;
      if (
        prototype !== Object.prototype &&
        prototype !== Array.prototype &&
        prototype !== null
      ) {
        return null;
      }
      const descriptors = Object.getOwnPropertyDescriptors(current);
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== "string") return null;
        const descriptor = descriptors[key];
        if (key === "length" && Array.isArray(current)) continue;
        if (
          descriptor === undefined ||
          descriptor.enumerable !== true ||
          !("value" in descriptor)
        ) {
          return null;
        }
        const child = descriptor.value as unknown;
        properties += 1;
        if (properties > MAX_GRAPH_PROPERTIES) return null;
        if (typeof child === "function" || typeof child === "symbol") {
          return null;
        }
        if (typeof child === "string") {
          if (child.length > MAX_GRAPH_STRING_CODE_UNITS) return null;
          stringCodeUnits += child.length;
          if (stringCodeUnits > MAX_GRAPH_TOTAL_STRING_CODE_UNITS) return null;
        }
        if (typeof child === "object" && child !== null) {
          pending.push({ value: child, depth: depth + 1 });
        }
      }
    }
    return structuredClone(value);
  } catch {
    return null;
  }
}

function exactRecord(
  value: unknown,
  requiredKeys: readonly string[],
): value is DataRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === requiredKeys.length &&
    requiredKeys.every((key) => Object.hasOwn(value, key))
  );
}

function denseArray(value: unknown, maximum: number): value is unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return false;
  const keys = Object.keys(value);
  return (
    keys.length === value.length &&
    keys.every((key, index) => key === String(index))
  );
}

function safeText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Array.from(value).length > 0 &&
    Array.from(value).length <= MAX_TEXT_CODE_POINTS &&
    value.normalize("NFKC").replace(/\s+/gu, " ").trim().length > 0 &&
    !UNSAFE_CODE_POINT_PATTERN.test(value) &&
    !FORBIDDEN_MARKUP_PATTERN.test(value) &&
    !containsCredentialLikeValue(value) &&
    !containsCredentialLikeValue(value.normalize("NFKC"))
  );
}

function escapedJsonCodePoints(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") return Number.POSITIVE_INFINITY;
    return Array.from(
      serialized
        .replaceAll("<", "\\u003c")
        .replaceAll(">", "\\u003e")
        .replaceAll("&", "\\u0026"),
    ).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

interface NarrativeEvidence {
  readonly id: string;
  readonly kind: DeepEvidence["kind"];
  readonly trust: "observed" | "repository-authored" | "external-repository";
  readonly label: string;
  readonly path: string | null;
  readonly url: string | null;
  readonly text: string | null;
}

function narrativeEvidenceById(
  pack: EvidencePack,
): ReadonlyMap<string, NarrativeEvidence> {
  const entries: NarrativeEvidence[] = [
    ...pack.facts
      .filter((fact) => fact.retention === "narrative")
      .map((fact) => ({
        id: fact.id,
        kind: fact.kind,
        trust: fact.trust,
        label: fact.label,
        path: fact.path,
        url: fact.url,
        text: null,
      })),
    ...pack.contentBlocks.map((block) => ({
      id: block.id,
      kind: block.kind,
      trust: block.trust,
      label: block.heading ?? block.path,
      path: block.path,
      url: buildPrimaryRepositoryFileUrl(
        pack.repository,
        pack.repository.commitSha,
        block.path,
      ),
      text: block.text,
    })),
  ];
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function validEvidenceReferences(
  value: unknown,
  knownEvidence: ReadonlyMap<string, NarrativeEvidence>,
  minimum: number,
): value is string[] {
  if (!denseArray(value, MAX_EVIDENCE_REFERENCES) || value.length < minimum) {
    return false;
  }
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !knownEvidence.has(id) || seen.has(id)) {
      return false;
    }
    seen.add(id);
  }
  return true;
}

function referencesMatchProvenance(
  provenance: unknown,
  references: readonly string[],
  knownEvidence: ReadonlyMap<string, NarrativeEvidence>,
): boolean {
  if (provenance === "unknown") return references.length === 0;
  if (provenance === "interpretation") return references.length >= 1;
  if (provenance === "repository-claim") {
    return references.some((id) => {
      const trust = knownEvidence.get(id)?.trust;
      return trust === "repository-authored" || trust === "external-repository";
    });
  }
  if (provenance === "observed-fact") {
    return references.some((id) => knownEvidence.get(id)?.trust === "observed");
  }
  return false;
}

function validUnknownText(value: string, language?: Language): boolean {
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const validEnglish = (): boolean => {
    const prefix = "Evidence does not establish ";
    if (!normalized.startsWith(prefix)) return false;
    const remainder = normalized.slice(prefix.length);
    const clause = remainder.endsWith(".") ? remainder.slice(0, -1) : remainder;
    return (
      clause.length > 0 &&
      !/[.!?;]/u.test(clause) &&
      !UNKNOWN_ASSURANCE_PATTERN.test(clause) &&
      !ABSOLUTE_SAFETY_PATTERN.test(clause)
    );
  };
  const validChinese = (): boolean => {
    const prefix = "现有证据无法确认";
    if (!normalized.startsWith(prefix)) return false;
    const remainder = normalized.slice(prefix.length);
    const clause = remainder.endsWith("。")
      ? remainder.slice(0, -1)
      : remainder;
    return (
      clause.length > 0 &&
      !/[。！？；;]/u.test(clause) &&
      !UNKNOWN_ASSURANCE_PATTERN.test(clause) &&
      !ABSOLUTE_SAFETY_PATTERN.test(clause)
    );
  };
  return language === "en"
    ? validEnglish()
    : language === "zh-CN"
      ? validChinese()
      : validEnglish() || validChinese();
}

function normalizedPlainText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function referencedReadmeText(
  references: readonly string[],
  knownEvidence: ReadonlyMap<string, NarrativeEvidence>,
): readonly string[] {
  return references.flatMap((id) => {
    const evidence = knownEvidence.get(id);
    return evidence?.kind === "readme" && evidence.text !== null
      ? [normalizedPlainText(evidence.text)]
      : [];
  });
}

function quotedCommands(value: string): string[] {
  const commands: string[] = [];
  for (const match of value.matchAll(/`(?<command>[^`\r\n]{1,240})`/gu)) {
    const command = match.groups?.command?.trim();
    if (command !== undefined && COMMAND_EXECUTABLE_PATTERN.test(command)) {
      commands.push(command.replace(/^\$\s*/u, "").trim());
    }
  }
  return commands;
}

function hasUnquotedImperativeCommand(value: string): boolean {
  const withoutQuotes = value.replace(/`[^`\r\n]{1,240}`/gu, "");
  return /(?:^|[.!?。！？；;:]\s*|\b)(?:(?:run|execute|type|invoke|launch|use|运行|执行|输入|启动|使用)\s+(?:the\s+command\s+)?|(?:should|must|please|can|请|应当|必须)\s+(?:run|execute|use|运行|执行|使用)?\s*)(?:\$\s*)?(?:npm|pnpm|yarn|bun|deno|node|npx|python(?:3)?|pip(?:3)?|uv|poetry|cargo|go|docker|make|cmake|composer|php|ruby|bundle|gem|java|mvn|gradle|dotnet|swift|xcodebuild|git|gh|bash|sh|zsh|powershell|pwsh|curl|wget)\b/iu.test(
    withoutQuotes,
  );
}

function commandsAreDocumentedReadmeQuotes(
  value: string,
  references: readonly string[],
  knownEvidence: ReadonlyMap<string, NarrativeEvidence>,
): boolean {
  if (DANGEROUS_COMMAND_PATTERN.test(value)) return false;
  if (hasUnquotedImperativeCommand(value)) return false;
  const commands = quotedCommands(value);
  if (commands.length === 0) return true;
  if (!COMMAND_ATTRIBUTION_PATTERN.test(value)) return false;
  const readmes = referencedReadmeText(references, knownEvidence);
  if (readmes.length === 0) return false;
  return commands.every((command) => {
    const normalized = normalizedPlainText(command);
    return readmes.some((readme) => readme.includes(normalized));
  });
}

function isUnsupportedSafetyAssurance(value: string): boolean {
  if (!ABSOLUTE_SAFETY_PATTERN.test(value)) {
    if (!DIRECT_SAFETY_ASSURANCE_PATTERN.test(value)) return false;
  }
  return !(
    SAFETY_QUALIFIER_PATTERN.test(value) && !POSITIVE_TURN_PATTERN.test(value)
  );
}

function violatesFinalPopularityBoundary(value: string): boolean {
  if (LIVE_COUNT_NARRATIVE_PATTERN.test(value)) return true;
  return (
    POPULARITY_PATTERN.test(value) &&
    POPULARITY_QUALITY_PATTERN.test(value) &&
    !POPULARITY_DISCLAIMER_PATTERN.test(value)
  );
}

function validHumanNarrative(
  value: string,
  references: readonly string[],
  knownEvidence: ReadonlyMap<string, NarrativeEvidence>,
  options: { unknown: boolean; finalDraft: boolean },
): boolean {
  if (
    DANGEROUS_COMMAND_PATTERN.test(value) ||
    FUNCTION_LEVEL_CRITIQUE_PATTERN.test(value) ||
    !commandsAreDocumentedReadmeQuotes(value, references, knownEvidence)
  ) {
    return false;
  }
  if (options.unknown) {
    return !UNKNOWN_ASSURANCE_PATTERN.test(value);
  }
  return (
    !isUnsupportedSafetyAssurance(value) &&
    (!options.finalDraft || !violatesFinalPopularityBoundary(value))
  );
}

function validFinding(
  value: unknown,
  expectedId: string,
  knownEvidence: ReadonlyMap<string, NarrativeEvidence>,
  unknown: boolean,
): value is ExpertFinding {
  if (
    !exactRecord(value, [
      "id",
      "section",
      "claim",
      "provenance",
      "confidence",
      "importance",
      "evidenceIds",
    ]) ||
    value.id !== expectedId ||
    typeof value.section !== "string" ||
    !EXPERT_SECTIONS.includes(value.section as never) ||
    !safeText(value.claim) ||
    typeof value.provenance !== "string" ||
    !DEEP_PROVENANCE.includes(value.provenance as never) ||
    typeof value.confidence !== "string" ||
    !DEEP_CONFIDENCE.includes(value.confidence as never) ||
    (value.importance !== "primary" && value.importance !== "supporting") ||
    !validEvidenceReferences(
      value.evidenceIds,
      knownEvidence,
      unknown ? 0 : 1,
    ) ||
    !referencesMatchProvenance(
      value.provenance,
      value.evidenceIds,
      knownEvidence,
    ) ||
    !validHumanNarrative(value.claim, value.evidenceIds, knownEvidence, {
      unknown,
      finalDraft: false,
    })
  ) {
    return false;
  }
  return unknown
    ? value.provenance === "unknown" &&
        value.confidence === "low" &&
        value.evidenceIds.length === 0 &&
        validUnknownText(value.claim)
    : value.provenance !== "unknown";
}

function validExpertReviewSnapshot(
  value: unknown,
  pack: EvidencePack,
): value is ExpertReview {
  if (
    !exactRecord(value, ["schemaVersion", "role", "findings", "unknowns"]) ||
    value.schemaVersion !== "1.0.0" ||
    typeof value.role !== "string" ||
    !EXPERT_ROLES.includes(value.role as never) ||
    !denseArray(value.findings, PANEL_LIMITS.findingsPerReview) ||
    !denseArray(value.unknowns, PANEL_LIMITS.findingsPerReview) ||
    value.findings.length + value.unknowns.length >
      PANEL_LIMITS.findingsPerReview ||
    escapedJsonCodePoints(value) > PANEL_LIMITS.expertReviewCodePoints
  ) {
    return false;
  }

  const role = value.role as ExpertRole;
  const knownEvidence = narrativeEvidenceById(pack);
  const claims = new Set<string>();
  const covered = new Set<ExpertSection>();
  const combined = [...value.findings, ...value.unknowns];
  for (let index = 0; index < combined.length; index += 1) {
    const finding = combined[index];
    const expectedId = `finding-${role}-${String(index + 1).padStart(4, "0")}`;
    if (
      !validFinding(
        finding,
        expectedId,
        knownEvidence,
        index >= value.findings.length,
      )
    ) {
      return false;
    }
    const canonicalClaim = finding.claim
      .normalize("NFKC")
      .replace(/\s+/gu, " ")
      .trim()
      .toLocaleLowerCase("en-US");
    if (claims.has(canonicalClaim)) return false;
    claims.add(canonicalClaim);
    covered.add(finding.section);
  }

  return ROLE_REQUIRED_SECTIONS[role].every((section) => covered.has(section));
}

export function isExpertReview(
  value: unknown,
  pack: EvidencePack,
): value is ExpertReview {
  const snapshot = strictDataSnapshot(value);
  return snapshot !== null && validExpertReviewSnapshot(snapshot, pack);
}

export function acceptedRolesCoverRequiredSections(
  reviews: readonly Pick<ExpertReview, "role">[],
): boolean {
  const roles = new Set<ExpertRole>();
  const covered = new Set<string>();
  for (const review of reviews) {
    if (!EXPERT_ROLES.includes(review.role) || roles.has(review.role)) {
      return false;
    }
    roles.add(review.role);
    for (const section of ROLE_REQUIRED_SECTIONS[review.role]) {
      covered.add(section);
    }
  }
  return EXPERT_SECTIONS.every((section) => covered.has(section));
}

function knownFindings(
  reviews: readonly ExpertReview[],
): ReadonlyMap<string, ExpertFinding> | null {
  const findings = new Map<string, ExpertFinding>();
  for (const review of reviews) {
    for (const finding of [...review.findings, ...review.unknowns]) {
      if (findings.has(finding.id)) return null;
      findings.set(finding.id, finding);
    }
  }
  return findings;
}

export function snapshotAcceptedExpertReviews(
  reviews: unknown,
  pack: EvidencePack,
): readonly ExpertReview[] | null {
  const snapshot = strictDataSnapshot(reviews);
  if (!denseArray(snapshot, EXPERT_ROLES.length)) return null;
  const accepted: ExpertReview[] = [];
  const roles = new Set<ExpertRole>();
  for (const review of snapshot) {
    if (!validExpertReviewSnapshot(review, pack) || roles.has(review.role)) {
      return null;
    }
    roles.add(review.role);
    accepted.push(review);
  }
  return escapedJsonCodePoints(accepted) <=
    PANEL_LIMITS.acceptedReviewsCodePoints
    ? accepted
    : null;
}

function validChallenge(
  value: unknown,
  expectedId: string,
  findings: ReadonlyMap<string, ExpertFinding>,
  knownEvidence: ReadonlyMap<string, NarrativeEvidence>,
): value is SkepticalChallenge {
  return (
    exactRecord(value, ["id", "findingId", "kind", "reason", "evidenceIds"]) &&
    value.id === expectedId &&
    typeof value.findingId === "string" &&
    findings.has(value.findingId) &&
    typeof value.kind === "string" &&
    SKEPTIC_CHALLENGE_KINDS.includes(value.kind as never) &&
    safeText(value.reason) &&
    validEvidenceReferences(value.evidenceIds, knownEvidence, 0)
  );
}

function validSkepticalReviewSnapshot(
  value: unknown,
  pack: EvidencePack,
  reviews: readonly ExpertReview[],
): value is SkepticalReview {
  const findings = knownFindings(reviews);
  if (
    findings === null ||
    !exactRecord(value, ["schemaVersion", "challenges"]) ||
    value.schemaVersion !== "1.0.0" ||
    !denseArray(value.challenges, PANEL_LIMITS.challenges) ||
    escapedJsonCodePoints(value) > PANEL_LIMITS.skepticalReviewCodePoints
  ) {
    return false;
  }
  const knownEvidence = narrativeEvidenceById(pack);
  const challengedKinds = new Set<string>();
  const challengeReasons = new Set<string>();
  const requiredByDestination: Record<ChallengeDestination, number> = {
    disagreements: 0,
    nextChecks: 0,
  };
  for (let index = 0; index < value.challenges.length; index += 1) {
    const challenge = value.challenges[index];
    if (
      !validChallenge(
        challenge,
        `challenge-${String(index + 1).padStart(4, "0")}`,
        findings,
        knownEvidence,
      )
    ) {
      return false;
    }
    const key = `${challenge.findingId}\u0000${challenge.kind}`;
    if (challengedKinds.has(key)) return false;
    challengedKinds.add(key);
    const normalizedReason = challenge.reason
      .normalize("NFKC")
      .replace(/\s+/gu, " ")
      .trim()
      .toLocaleLowerCase("en-US");
    if (challengeReasons.has(normalizedReason)) return false;
    challengeReasons.add(normalizedReason);
    const finding = findings.get(challenge.findingId);
    if (finding?.importance === "primary") {
      requiredByDestination[CHALLENGE_DESTINATIONS[challenge.kind]] += 1;
    }
  }
  for (const finding of findings.values()) {
    if (
      POPULARITY_PATTERN.test(finding.claim) &&
      !challengedKinds.has(`${finding.id}\u0000popularity-bias`)
    ) {
      return false;
    }
  }
  return (
    requiredByDestination.disagreements <= DEEP_REPORT_CAPS.disagreements &&
    requiredByDestination.nextChecks <= DEEP_REPORT_CAPS.statementsPerList
  );
}

export function isSkepticalReview(
  value: unknown,
  pack: EvidencePack,
  reviews: readonly ExpertReview[],
): value is SkepticalReview {
  return snapshotSkepticalReview(value, pack, reviews) !== null;
}

export function snapshotSkepticalReview(
  value: unknown,
  pack: EvidencePack,
  reviews: unknown,
): SkepticalReview | null {
  const snapshot = strictDataSnapshot(value);
  const accepted = snapshotAcceptedExpertReviews(reviews, pack);
  return snapshot !== null &&
    accepted !== null &&
    acceptedRolesCoverRequiredSections(accepted) &&
    validSkepticalReviewSnapshot(snapshot, pack, accepted)
    ? snapshot
    : null;
}

function validLinkedStatements(
  value: unknown,
  destination: ChallengeDestination,
): boolean {
  const cap =
    destination === "disagreements"
      ? DEEP_REPORT_CAPS.disagreements
      : DEEP_REPORT_CAPS.statementsPerList;
  return (
    denseArray(value, cap) &&
    value.every(
      (entry) =>
        exactRecord(entry, ["statement", "sourceChallengeId"]) &&
        ((typeof entry.sourceChallengeId === "string" &&
          /^challenge-\d{4}$/u.test(entry.sourceChallengeId)) ||
          (destination === "nextChecks" && entry.sourceChallengeId === null)),
    )
  );
}

function validDraftShape(value: unknown): value is DeepReportDraft {
  return (
    exactRecord(value, [
      "schemaVersion",
      "language",
      "orientation",
      "fit",
      "situations",
      "capabilities",
      "workflow",
      "architecture",
      "onboarding",
      "trust",
      "maintenance",
      "alternatives",
      "disagreements",
      "nextChecks",
      "finalVerdict",
    ]) &&
    value.schemaVersion === "1.0.0" &&
    (value.language === "en" || value.language === "zh-CN") &&
    exactRecord(value.maintenance, ["summary", "signals"]) &&
    denseArray(value.alternatives, DEEP_REPORT_CAPS.alternatives) &&
    validLinkedStatements(value.disagreements, "disagreements") &&
    validLinkedStatements(value.nextChecks, "nextChecks") &&
    value.alternatives.every(
      (alternative) =>
        exactRecord(alternative, ["repository", "whyCompare"]) &&
        exactRecord(alternative.repository, ["owner", "repo"]),
    )
  );
}

function hasRequiredDraftContent(
  draft: DeepReportDraft,
  pack: EvidencePack,
): boolean {
  try {
    return (
      draft.orientation.summary.length >= 1 &&
      draft.fit.goodFor.length >= 1 &&
      draft.fit.poorFor.length >= 1 &&
      draft.situations.length >= 1 &&
      draft.capabilities.length >= 1 &&
      draft.capabilities.every((group) => group.items.length >= 1) &&
      draft.workflow.length >= 1 &&
      draft.architecture.summary.length >= 1 &&
      draft.architecture.technologies.length >= 1 &&
      draft.architecture.concepts.length >= 1 &&
      draft.onboarding.prerequisites.length >= 1 &&
      draft.onboarding.install.length >= 1 &&
      draft.onboarding.run.length >= 1 &&
      draft.onboarding.develop.length >= 1 &&
      draft.onboarding.cautions.length >= 1 &&
      draft.trust.reliability.length >= 1 &&
      draft.trust.security.length >= 1 &&
      draft.trust.privacy.length >= 1 &&
      draft.trust.unknowns.length >= 1 &&
      draft.maintenance.summary.length >= 1 &&
      draft.maintenance.signals.length >= 1 &&
      (!pack.facts.some(
        (fact) => fact.kind === "alternative" && fact.retention === "narrative",
      ) ||
        draft.alternatives.length >= 1) &&
      draft.nextChecks.length >= 1
    );
  } catch {
    return false;
  }
}

function containsForbiddenMarkup(value: unknown): boolean {
  if (typeof value === "string") {
    return FORBIDDEN_MARKUP_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsForbiddenMarkup(entry));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((entry) => containsForbiddenMarkup(entry));
  }
  return false;
}

function validateAndCollectDraftReferences(
  value: unknown,
  language: Language,
  knownEvidence: ReadonlyMap<string, NarrativeEvidence>,
): ReadonlySet<string> | null {
  const referenced = new Set<string>();
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      for (const entry of current as unknown[]) pending.push(entry);
      continue;
    }
    if (typeof current !== "object" || current === null) continue;
    if (
      exactRecord(current, ["text", "provenance", "confidence", "evidenceIds"])
    ) {
      if (
        !safeText(current.text) ||
        typeof current.provenance !== "string" ||
        !DEEP_PROVENANCE.includes(current.provenance as never) ||
        typeof current.confidence !== "string" ||
        !DEEP_CONFIDENCE.includes(current.confidence as never) ||
        !validEvidenceReferences(
          current.evidenceIds,
          knownEvidence,
          current.provenance === "unknown" ? 0 : 1,
        ) ||
        !referencesMatchProvenance(
          current.provenance,
          current.evidenceIds,
          knownEvidence,
        ) ||
        (current.provenance === "unknown"
          ? current.confidence !== "low" ||
            current.evidenceIds.length !== 0 ||
            !validUnknownText(current.text, language)
          : false) ||
        !validHumanNarrative(current.text, current.evidenceIds, knownEvidence, {
          unknown: current.provenance === "unknown",
          finalDraft: true,
        })
      ) {
        return null;
      }
      for (const id of current.evidenceIds) referenced.add(id);
      continue;
    }
    pending.push(...Object.values(current as Record<string, unknown>));
  }
  return referenced;
}

function rewriteDraftEvidenceReferences(
  value: unknown,
  publicIdByOpaqueId: ReadonlyMap<string, string>,
): boolean {
  if (Array.isArray(value)) {
    return value.every((entry) =>
      rewriteDraftEvidenceReferences(entry, publicIdByOpaqueId),
    );
  }
  if (typeof value !== "object" || value === null) return true;
  if (exactRecord(value, ["text", "provenance", "confidence", "evidenceIds"])) {
    if (!denseArray(value.evidenceIds, MAX_EVIDENCE_REFERENCES)) return false;
    const rewritten: string[] = [];
    for (const id of value.evidenceIds) {
      if (typeof id !== "string") return false;
      const publicId = publicIdByOpaqueId.get(id);
      if (publicId === undefined) return false;
      rewritten.push(publicId);
    }
    value.evidenceIds = rewritten;
    return true;
  }
  return Object.values(value).every((entry) =>
    rewriteDraftEvidenceReferences(entry, publicIdByOpaqueId),
  );
}

function publicEvidenceLabel(value: string): string {
  return Array.from(value).slice(0, DEEP_REPORT_CAPS.textCodePoints).join("");
}

interface PreparedDeepReportDraft {
  readonly draft: DeepReportDraft;
  readonly selected: readonly NarrativeEvidence[];
  readonly publicIdByOpaqueId: ReadonlyMap<string, string>;
}

function prepareDeepReportDraft(
  value: unknown,
  pack: EvidencePack,
): PreparedDeepReportDraft | null {
  const snapshot = strictDataSnapshot(value);
  if (
    snapshot === null ||
    containsForbiddenMarkup(snapshot) ||
    !validDraftShape(snapshot) ||
    !hasRequiredDraftContent(snapshot, pack)
  ) {
    return null;
  }
  const knownEvidence = narrativeEvidenceById(pack);
  const references = validateAndCollectDraftReferences(
    snapshot,
    snapshot.language,
    knownEvidence,
  );
  if (references === null) return null;

  const selected = [...knownEvidence.values()].filter((entry) =>
    references.has(entry.id),
  );
  if (selected.length !== references.size) return null;
  const publicIdByOpaqueId = new Map(
    selected.map((entry, index) => [
      entry.id,
      `ev-${String(index + 1).padStart(4, "0")}`,
    ]),
  );
  if (!rewriteDraftEvidenceReferences(snapshot, publicIdByOpaqueId)) {
    return null;
  }
  return { draft: snapshot, selected, publicIdByOpaqueId };
}

function validServerCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validServerTimestamp(value: unknown): value is string | null {
  if (value === null) return true;
  try {
    return assertCanonicalTimestamp(value) === value;
  } catch {
    return false;
  }
}

function validServerCommunity(
  value: unknown,
): value is DeepReport["maintenance"]["community"] {
  return (
    exactRecord(value, [
      "stars",
      "forks",
      "watchers",
      "openIssues",
      "pushedAt",
      "archived",
      "license",
    ]) &&
    validServerCount(value.stars) &&
    validServerCount(value.forks) &&
    validServerCount(value.watchers) &&
    validServerCount(value.openIssues) &&
    validServerTimestamp(value.pushedAt) &&
    typeof value.archived === "boolean" &&
    (value.license === null ||
      (safeText(value.license) && Array.from(value.license).length <= 128))
  );
}

function repositoryKey(repository: { owner: string; repo: string }): string {
  return `${repository.owner.toLocaleLowerCase("en-US")}/${repository.repo.toLocaleLowerCase("en-US")}`;
}

function validatedServerRepository(
  value: unknown,
): { owner: string; repo: string } | null {
  if (!exactRecord(value, ["owner", "repo"])) return null;
  try {
    return {
      owner: assertRepositoryComponent(value.owner, "owner"),
      repo: assertRepositoryComponent(value.repo, "repo"),
    };
  } catch {
    return null;
  }
}

function parsedFactJson(text: string, prefix: string): DataRecord | null {
  if (!text.startsWith(prefix)) return null;
  try {
    const parsed = JSON.parse(text.slice(prefix.length)) as unknown;
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as DataRecord)
      : null;
  } catch {
    return null;
  }
}

function communityMatchesPackedLiveFacts(
  community: DeepReport["maintenance"]["community"],
  pack: EvidencePack,
): boolean {
  const countsFact = pack.facts.find(
    (fact) => fact.category === "community-live-counts",
  );
  if (countsFact !== undefined) {
    const counts = parsedFactJson(countsFact.text, "Community counts: ");
    if (
      counts === null ||
      community.stars !== counts.stars ||
      community.watchers !== counts.watchers ||
      community.forks !== counts.forks ||
      community.openIssues !== counts.openIssues
    ) {
      return false;
    }
  }
  const stateFact = pack.facts.find(
    (fact) => fact.category === "repository-live-state",
  );
  if (stateFact !== undefined) {
    const state = parsedFactJson(stateFact.text, "Repository state: ");
    const packedLicense = state?.license;
    if (
      state === null ||
      community.archived !== state.archived ||
      community.pushedAt !== state.pushedAt ||
      (packedLicense === "unknown"
        ? community.license !== null
        : community.license !== packedLicense)
    ) {
      return false;
    }
  }
  return true;
}

function alternativeMatchesPackedLiveFact(
  repository: { owner: string; repo: string },
  github: DeepReport["alternatives"][number]["github"],
  pack: EvidencePack,
): boolean {
  const url = buildAlternativeRepositoryUrl(repository);
  const liveFact = pack.facts.find(
    (fact) => fact.category === "alternative-live-state" && fact.url === url,
  );
  if (liveFact === undefined) return true;
  const state = parsedFactJson(liveFact.text, "Alternative state: ");
  const packedLicense = state?.license;
  return (
    state !== null &&
    state.repository === `${repository.owner}/${repository.repo}` &&
    github.stars === state.stars &&
    github.forks === state.forks &&
    github.watchers === state.watchers &&
    github.openIssues === state.openIssues &&
    github.pushedAt === state.pushedAt &&
    github.archived === state.archived &&
    (packedLicense === "unknown"
      ? github.license === null
      : github.license === packedLicense)
  );
}

function validatedServerFields(
  value: unknown,
  pack: EvidencePack,
): DeepReportServerFields | null {
  const snapshot = strictDataSnapshot(value);
  if (
    !exactRecord(snapshot, ["review", "community", "alternatives"]) ||
    !exactRecord(snapshot.review, ["coverage", "capabilityClass"]) ||
    (snapshot.review.coverage !== "full" &&
      snapshot.review.coverage !== "reduced") ||
    (snapshot.review.capabilityClass !== "auto" &&
      snapshot.review.capabilityClass !== "multi-model") ||
    !validServerCommunity(snapshot.community) ||
    !communityMatchesPackedLiveFacts(snapshot.community, pack) ||
    !denseArray(snapshot.alternatives, DEEP_REPORT_CAPS.alternatives)
  ) {
    return null;
  }

  const verifiedAlternativeUrls = new Set(
    pack.facts
      .filter(
        (fact) =>
          fact.category === "alternative-description" &&
          fact.retention === "narrative" &&
          fact.url !== null,
      )
      .map((fact) => fact.url as string),
  );
  const alternatives: DeepReportServerFields["alternatives"] = [];
  const seen = new Set<string>();
  for (const alternative of snapshot.alternatives) {
    if (
      !exactRecord(alternative, ["repository", "github"]) ||
      !validServerCommunity(alternative.github)
    ) {
      return null;
    }
    const repository = validatedServerRepository(alternative.repository);
    if (repository === null) return null;
    const key = repositoryKey(repository);
    if (
      key === repositoryKey(pack.repository) ||
      seen.has(key) ||
      !verifiedAlternativeUrls.has(buildAlternativeRepositoryUrl(repository)) ||
      !alternativeMatchesPackedLiveFact(repository, alternative.github, pack)
    ) {
      return null;
    }
    seen.add(key);
    alternatives.push({
      repository,
      github: { ...alternative.github },
    });
  }
  return {
    review: {
      coverage: snapshot.review.coverage,
      capabilityClass: snapshot.review.capabilityClass,
    },
    community: { ...snapshot.community },
    alternatives,
  };
}

function assemblePreparedReport(
  prepared: PreparedDeepReportDraft,
  pack: EvidencePack,
  serverFields: DeepReportServerFields,
): DeepReport | null {
  const { draft, selected, publicIdByOpaqueId } = prepared;
  const alternativeFacts = new Map(
    serverFields.alternatives.map((alternative) => [
      repositoryKey(alternative.repository),
      alternative.github,
    ]),
  );
  const alternatives = draft.alternatives.map((alternative) => {
    const github = alternativeFacts.get(repositoryKey(alternative.repository));
    return github === undefined
      ? null
      : { ...alternative, github: { ...github } };
  });
  if (alternatives.some((alternative) => alternative === null)) return null;

  const challengeNarrative = stripDraftChallengeLinks(draft);
  const report: DeepReport = {
    ...draft,
    repository: pack.repository,
    generatedAt: pack.acquiredAt,
    review: { ...serverFields.review },
    maintenance: {
      ...draft.maintenance,
      community: { ...serverFields.community },
    },
    alternatives: alternatives as DeepReport["alternatives"],
    ...challengeNarrative,
    evidence: selected.map((entry) => ({
      id: publicIdByOpaqueId.get(entry.id) as string,
      kind: entry.kind,
      label: publicEvidenceLabel(entry.label),
      path: entry.path,
      url: entry.url,
    })),
  };
  return isDeepReport(report) ? report : null;
}

/**
 * Emits a final report only after explicit server-owned live facts and review
 * metadata pass strict validation. Model drafts can never supply these fields.
 */
export function materializeDeepReportDraft(
  value: unknown,
  pack: EvidencePack,
  serverFields: unknown,
): DeepReport | null {
  const prepared = prepareDeepReportDraft(value, pack);
  const verifiedServerFields = validatedServerFields(serverFields, pack);
  return prepared === null || verifiedServerFields === null
    ? null
    : assemblePreparedReport(prepared, pack, verifiedServerFields);
}

function draftPassesPublicReportShape(
  value: unknown,
  pack: EvidencePack,
): boolean {
  const prepared = prepareDeepReportDraft(value, pack);
  if (prepared === null) return false;
  const sentinel: DeepReportServerFields = {
    review: { coverage: "reduced", capabilityClass: "auto" },
    community: {
      stars: 0,
      forks: 0,
      watchers: 0,
      openIssues: 0,
      pushedAt: null,
      archived: false,
      license: null,
    },
    alternatives: prepared.draft.alternatives.map((alternative) => ({
      repository: { ...alternative.repository },
      github: {
        stars: 0,
        forks: 0,
        watchers: 0,
        openIssues: 0,
        pushedAt: null,
        archived: false,
        license: null,
      },
    })),
  };
  return assemblePreparedReport(prepared, pack, sentinel) !== null;
}

function deepFreezeSnapshot<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeSnapshot(child);
  }
  return Object.freeze(value);
}

/**
 * Revalidates a cached narrative without requiring the transient expert and
 * skeptic objects from the original run. Opaque evidence references remain
 * unchanged so a later materialization can remap only the cited subset.
 */
export function snapshotDeepReportDraft(
  value: unknown,
  pack: EvidencePack,
  language: Language,
): DeepReportDraft | null {
  const snapshot = strictDataSnapshot(value);
  return snapshot !== null &&
    validDraftShape(snapshot) &&
    snapshot.language === language &&
    draftPassesPublicReportShape(snapshot, pack)
    ? deepFreezeSnapshot(snapshot)
    : null;
}

/** Removes model-only challenge linkage after a draft has passed its context guard. */
export function stripDraftChallengeLinks(
  draft: DeepReportDraft,
): Pick<DeepReport, "disagreements" | "nextChecks"> {
  return {
    disagreements: draft.disagreements.map((entry) =>
      structuredClone(entry.statement),
    ),
    nextChecks: draft.nextChecks.map((entry) =>
      structuredClone(entry.statement),
    ),
  };
}

function preservesPrimaryChallenges(
  draft: DeepReportDraft,
  reviews: readonly ExpertReview[],
  skeptic: SkepticalReview,
): boolean {
  const findings = knownFindings(reviews);
  if (findings === null) return false;
  const challenges = new Map(
    skeptic.challenges.map((challenge) => [challenge.id, challenge]),
  );
  const linked = new Set<string>();
  for (const destination of ["disagreements", "nextChecks"] as const) {
    for (const entry of draft[destination]) {
      const challengeId = entry.sourceChallengeId;
      if (challengeId === null) {
        if (destination !== "nextChecks") return false;
        continue;
      }
      const challenge = challenges.get(challengeId);
      if (
        challenge === undefined ||
        CHALLENGE_DESTINATIONS[challenge.kind] !== destination ||
        linked.has(challengeId)
      ) {
        return false;
      }
      linked.add(challengeId);
    }
  }
  return skeptic.challenges.every((challenge) => {
    const finding = findings.get(challenge.findingId);
    return finding?.importance !== "primary" || linked.has(challenge.id);
  });
}

export interface DeepReportDraftValidationContext {
  readonly pack: EvidencePack;
  readonly expectedLanguage: Language;
  readonly acceptedExpertReviews: readonly ExpertReview[];
  readonly skepticalReview: SkepticalReview;
}

export function isDeepReportDraft(
  value: unknown,
  context: DeepReportDraftValidationContext,
): value is DeepReportDraft {
  const snapshot = strictDataSnapshot(value);
  const accepted = snapshotAcceptedExpertReviews(
    context.acceptedExpertReviews,
    context.pack,
  );
  const skepticSnapshot = snapshotSkepticalReview(
    context.skepticalReview,
    context.pack,
    accepted,
  );
  const materialized =
    snapshot !== null && draftPassesPublicReportShape(snapshot, context.pack);
  return (
    snapshot !== null &&
    accepted !== null &&
    skepticSnapshot !== null &&
    acceptedRolesCoverRequiredSections(accepted) &&
    validDraftShape(snapshot) &&
    snapshot.language === context.expectedLanguage &&
    materialized &&
    hasRequiredDraftContent(snapshot, context.pack) &&
    preservesPrimaryChallenges(snapshot, accepted, skepticSnapshot)
  );
}
