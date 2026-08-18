import type {
  GeneralAnalysisInput,
  ReaderCommandDisposition,
  ReaderCommandFact,
  ReaderCommandKind,
} from "../../analysis/model";
import {
  containsCredentialLikeValue,
  isSafeProjectBriefPath,
} from "../../analysis/project-brief-safety";
import { toPathComparisonKey } from "../../scanner/file-registry";

const MAX_COMMAND_CODE_POINTS = 160;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_SCRIPT_KEYS = 128;
const ROOT_PACKAGE_PATH = "package.json";

type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

const DEPENDENCY_INSTALL_VERBS = Object.freeze({
  npm: new Set(["add", "ci", "i", "install"]),
  pnpm: new Set(["add", "i", "install"]),
  yarn: new Set(["add", "install"]),
  bun: new Set(["add", "i", "install"]),
} as const satisfies Readonly<Record<PackageManager, ReadonlySet<string>>>);

interface PackageManagerGlobalOptions {
  readonly withValue: ReadonlySet<string>;
  readonly withoutValue: ReadonlySet<string>;
  readonly shortWithValue: ReadonlySet<string>;
  readonly shortWithoutValue: ReadonlySet<string>;
}

const PACKAGE_MANAGER_GLOBAL_OPTIONS = Object.freeze({
  npm: {
    withValue: new Set([
      "--cache",
      "--prefix",
      "--registry",
      "--userconfig",
      "--workspace",
    ]),
    withoutValue: new Set([
      "--global",
      "--ignore-scripts",
      "--include-workspace-root",
      "--offline",
      "--silent",
      "--workspaces",
    ]),
    shortWithValue: new Set(["-w"]),
    shortWithoutValue: new Set(["-g"]),
  },
  pnpm: {
    withValue: new Set([
      "--config-dir",
      "--dir",
      "--filter",
      "--store-dir",
      "--workspace-dir",
    ]),
    withoutValue: new Set([
      "--offline",
      "--prefer-offline",
      "--recursive",
      "--silent",
      "--workspace-root",
    ]),
    shortWithValue: new Set(["-C", "-F"]),
    shortWithoutValue: new Set(["-r", "-w"]),
  },
  yarn: {
    withValue: new Set(["--cache-folder", "--cwd", "--modules-folder"]),
    withoutValue: new Set([
      "--ignore-scripts",
      "--json",
      "--offline",
      "--silent",
      "--verbose",
    ]),
    shortWithValue: new Set(),
    shortWithoutValue: new Set(),
  },
  bun: {
    withValue: new Set(["--config", "--cwd"]),
    withoutValue: new Set(["--silent", "--verbose"]),
    shortWithValue: new Set(["-C", "-c"]),
    shortWithoutValue: new Set(),
  },
} as const satisfies Readonly<
  Record<PackageManager, PackageManagerGlobalOptions>
>);

type PackageManagerCommandKind = "install" | "startup";

function isDocumentedAttachedShortValue(
  manager: PackageManager,
  option: string,
): boolean {
  if (manager === "npm") return /^-w=.+$/su.test(option);
  if (manager !== "pnpm") return false;
  if (!option.startsWith("-C") && !option.startsWith("-F")) return false;
  const suffix = option.slice(2);
  const value = suffix.startsWith("=") ? suffix.slice(1) : suffix;

  return value.length > 0;
}

function isStartupScript(value: string | undefined): boolean {
  const normalized = value?.toLocaleLowerCase("en-US");

  return (
    normalized === "dev" ||
    normalized === "serve" ||
    normalized === "start" ||
    normalized?.startsWith("dev:") === true ||
    normalized?.startsWith("serve:") === true ||
    normalized?.startsWith("start:") === true
  );
}

function packageManagerCommandKind(
  manager: PackageManager,
  arguments_: readonly string[],
): PackageManagerCommandKind | null {
  const options = PACKAGE_MANAGER_GLOBAL_OPTIONS[manager];
  let index = 0;

  while (index < arguments_.length) {
    const option = arguments_[index] ?? "";

    if (option === "--") {
      if (arguments_[index + 1] === undefined) return null;
      index += 1;
      break;
    }
    if (!option.startsWith("-")) break;

    if (option.startsWith("--")) {
      const equals = option.indexOf("=");
      const name = equals === -1 ? option : option.slice(0, equals);
      const inlineValue = equals === -1 ? null : option.slice(equals + 1);

      if (options.withValue.has(name)) {
        if (inlineValue !== null) {
          if (inlineValue.length === 0) return null;
          index += 1;
          continue;
        }
        const value = arguments_[index + 1];
        if (value === undefined || value.startsWith("-")) return null;
        index += 2;
        continue;
      }
      if (options.withoutValue.has(name) && inlineValue === null) {
        index += 1;
        continue;
      }

      return null;
    }

    if (options.shortWithValue.has(option)) {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith("-")) return null;
      index += 2;
      continue;
    }
    if (options.shortWithoutValue.has(option)) {
      index += 1;
      continue;
    }

    if (isDocumentedAttachedShortValue(manager, option)) {
      index += 1;
      continue;
    }

    return null;
  }

  const verb = arguments_[index]?.toLocaleLowerCase("en-US");

  if (verb === undefined) return manager === "yarn" ? "install" : null;
  if (DEPENDENCY_INSTALL_VERBS[manager].has(verb)) return "install";
  if (verb === "start") return "startup";
  if (
    (verb === "run" || (manager === "npm" && verb === "run-script")) &&
    isStartupScript(arguments_[index + 1])
  ) {
    return "startup";
  }
  if (manager !== "npm" && isStartupScript(verb)) return "startup";

  return null;
}

function isPackageManager(value: string): value is PackageManager {
  return Object.hasOwn(DEPENDENCY_INSTALL_VERBS, value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function normalizedCommandSyntax(command: string): string | null {
  if (containsUnsafeCodePoint(command)) return null;

  const normalized = command.normalize("NFKC").trim();
  const withoutPrompt = normalized.replace(/^[$>](?:\s+|$)/u, "").trim();

  if (
    withoutPrompt.length === 0 ||
    Array.from(withoutPrompt).length > MAX_COMMAND_CODE_POINTS ||
    containsUnsafeCodePoint(withoutPrompt)
  ) {
    return null;
  }

  return withoutPrompt;
}

function normalizedVisibleCommand(command: string): string | null {
  const normalized = normalizedCommandSyntax(command);

  return normalized === null || containsCredentialLikeValue(normalized)
    ? null
    : normalized;
}

function executableName(token: string | undefined): string {
  return (
    (token ?? "")
      .replace(/^\.\//u, "")
      .split("/")
      .at(-1)
      ?.toLocaleLowerCase("en-US") ?? ""
  );
}

interface UnwrappedCommand {
  executable: string;
  rawExecutable: string;
  arguments: string[];
  malformed: boolean;
}

function isAssignment(token: string | undefined): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*$/su.test(token ?? "");
}

function shellWords(segment: string): {
  tokens: string[];
  malformed: boolean;
} {
  const tokens: string[] = [];
  let token = "";
  let tokenStarted = false;
  let quote: "'" | '"' | null = null;
  let escaped = false;

  const pushToken = (): void => {
    if (!tokenStarted) return;
    tokens.push(token);
    token = "";
    tokenStarted = false;
  };

  for (const character of segment) {
    if (escaped) {
      token += character;
      tokenStarted = true;
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (character === "'") quote = null;
      else token += character;
      tokenStarted = true;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      tokenStarted = true;
      continue;
    }
    if (quote === '"') {
      if (character === '"') quote = null;
      else token += character;
      tokenStarted = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (/\s/u.test(character)) {
      pushToken();
      continue;
    }
    token += character;
    tokenStarted = true;
  }

  pushToken();
  return { tokens, malformed: quote !== null || escaped };
}

function envCommandIndex(
  tokens: readonly string[],
  start: number,
): { index: number; review: boolean } {
  let index = start;

  while (index < tokens.length) {
    const option = tokens[index] ?? "";
    if (option === "--") return { index: index + 1, review: false };
    if (option === "-") {
      index += 1;
      continue;
    }
    if (!option.startsWith("-")) break;

    if (option === "-S" || option.startsWith("-S")) {
      return { index, review: true };
    }
    if (option === "--split-string" || option.startsWith("--split-string=")) {
      return { index, review: true };
    }
    if (
      option === "--ignore-environment" ||
      option === "--debug" ||
      option.startsWith("--unset=") ||
      option.startsWith("--chdir=")
    ) {
      index += 1;
      continue;
    }
    if (option === "--unset" || option === "--chdir") {
      if (tokens[index + 1] === undefined) return { index, review: true };
      index += 2;
      continue;
    }
    if (option.startsWith("--")) return { index, review: true };

    let consumesNext = false;
    let recognized = true;
    for (let cursor = 1; cursor < option.length; cursor += 1) {
      const flag = option[cursor];
      if (flag === "i" || flag === "v") continue;
      if (flag === "S") return { index, review: true };
      if (flag === "u" || flag === "C" || flag === "P") {
        consumesNext = cursor === option.length - 1;
        break;
      }
      recognized = false;
      break;
    }
    if (!recognized) return { index, review: true };
    if (consumesNext) {
      if (tokens[index + 1] === undefined) return { index, review: true };
      index += 2;
    } else {
      index += 1;
    }
  }

  return { index, review: false };
}

function unwrapTokens(
  tokens: readonly string[],
  malformed: boolean,
): UnwrappedCommand {
  let index = 0;
  let review = malformed;

  while (isAssignment(tokens[index])) index += 1;
  while (executableName(tokens[index]) === "env") {
    const env = envCommandIndex(tokens, index + 1);
    index = env.index;
    review ||= env.review;
    while (isAssignment(tokens[index])) index += 1;
  }

  return {
    executable: executableName(tokens[index]),
    rawExecutable: tokens[index] ?? "",
    arguments: tokens.slice(index + 1),
    malformed: review,
  };
}

function unwrapCommand(segment: string): UnwrappedCommand {
  const { tokens, malformed } = shellWords(segment.trim());
  return unwrapTokens(tokens, malformed);
}

interface ScannedShellCommand {
  pipelines: string[][];
  malformed: boolean;
}

function scanShellCommand(command: string): ScannedShellCommand {
  const pipelines: string[][] = [];
  let pipeline: string[] = [];
  let segment = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let malformed = false;

  const pushSegment = (): void => {
    const candidate = segment.trim();
    if (candidate.length === 0) malformed = true;
    else pipeline.push(candidate);
    segment = "";
  };
  const pushPipeline = (): void => {
    pushSegment();
    if (pipeline.length > 0) pipelines.push(pipeline);
    pipeline = [];
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] ?? "";
    const next = command[index + 1];
    const previous = command[index - 1];

    if (escaped) {
      segment += character;
      escaped = false;
      continue;
    }
    if (quote === "'") {
      segment += character;
      if (character === "'") quote = null;
      continue;
    }
    if (character === "\\") {
      segment += character;
      escaped = true;
      continue;
    }
    if (quote === '"') {
      segment += character;
      if (character === '"') quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      segment += character;
      quote = character;
      continue;
    }

    if (
      (character === "&" && next === "&") ||
      (character === "|" && next === "|")
    ) {
      pushPipeline();
      index += 1;
      continue;
    }
    if (character === "|") {
      pushSegment();
      if (next === "&") index += 1;
      continue;
    }
    if (
      character === ";" ||
      (character === "&" &&
        previous !== ">" &&
        previous !== "<" &&
        next !== ">")
    ) {
      pushPipeline();
      continue;
    }

    segment += character;
  }

  if (quote !== null || escaped) malformed = true;
  pushPipeline();
  return { pipelines, malformed };
}

function destructiveRemove(arguments_: readonly string[]): boolean {
  let recursive = false;
  let force = false;

  for (const argument of arguments_) {
    if (argument === "--recursive") recursive = true;
    if (argument === "--force") force = true;
    if (/^-[^-]/u.test(argument)) {
      const flags = argument.slice(1);
      recursive ||= flags.includes("r") || flags.includes("R");
      force ||= flags.includes("f");
    }
  }

  return recursive && force;
}

function dangerousCommand(unwrapped: UnwrappedCommand): boolean {
  const { executable, arguments: arguments_ } = unwrapped;

  if (unwrapped.malformed) return true;
  if (executable === "sudo") return true;
  if (executable === "rm" && destructiveRemove(arguments_)) return true;
  if (executable === "mkfs" || executable.startsWith("mkfs.")) return true;
  if (
    executable === "dd" &&
    arguments_.some((item) => item.startsWith("of="))
  ) {
    return true;
  }
  if (executable === "chmod") {
    const mode = arguments_.find((item) => !item.startsWith("-"));
    if (mode === "777" || mode === "0777") return true;
  }

  return false;
}

const REMOTE_SOURCE_EXECUTABLES = new Set(["curl", "wget"]);
const SHELL_EXECUTABLES = new Set(["bash", "dash", "fish", "ksh", "sh", "zsh"]);
const DOCUMENTED_EXECUTABLES = new Set([
  "bun",
  "bundle",
  "cargo",
  "composer",
  "dart",
  "deno",
  "docker",
  "docker-compose",
  "dotnet",
  "flutter",
  "go",
  "gradle",
  "java",
  "make",
  "mvn",
  "node",
  "npm",
  "php",
  "pip",
  "pip3",
  "pnpm",
  "poetry",
  "python",
  "python3",
  "ruby",
  "swift",
  "uv",
  "yarn",
]);
const NATURAL_LANGUAGE_ARGUMENTS = new Set([
  "are",
  "can",
  "helps",
  "is",
  "provides",
  "requires",
  "should",
  "supports",
  "sure",
  "to",
  "uses",
]);

const SUDO_OPTIONS_WITH_ARGUMENT = new Set([
  "--chdir",
  "--close-from",
  "--command-timeout",
  "--group",
  "--host",
  "--other-user",
  "--prompt",
  "--role",
  "--type",
  "--user",
  "-C",
  "-D",
  "-R",
  "-T",
  "-g",
  "-h",
  "-p",
  "-r",
  "-t",
  "-u",
]);
const SUDO_OPTIONS_WITHOUT_ARGUMENT = new Set([
  "--askpass",
  "--background",
  "--bell",
  "--login",
  "--non-interactive",
  "--preserve-env",
  "--remove-timestamp",
  "--reset-timestamp",
  "--shell",
  "--stdin",
  "--validate",
  "-A",
  "-E",
  "-H",
  "-K",
  "-S",
  "-b",
  "-k",
  "-n",
  "-s",
  "-v",
]);
const SUDO_SHORT_OPTIONS_WITH_ARGUMENT = new Set([
  "C",
  "D",
  "R",
  "T",
  "U",
  "g",
  "h",
  "p",
  "r",
  "t",
  "u",
]);
const SUDO_SHORT_OPTIONS_WITHOUT_ARGUMENT = new Set([
  "A",
  "B",
  "E",
  "H",
  "K",
  "P",
  "S",
  "b",
  "i",
  "k",
  "l",
  "n",
  "s",
  "v",
]);

interface SudoCommandBoundary {
  index: number;
  shellMode: boolean;
}

function sudoCommandBoundary(
  arguments_: readonly string[],
): SudoCommandBoundary | null {
  let index = 0;
  let shellMode = false;

  while (index < arguments_.length) {
    const option = arguments_[index] ?? "";
    if (option === "--") return { index: index + 1, shellMode };
    if (!option.startsWith("-") || option === "-") {
      return { index, shellMode };
    }
    if (SUDO_OPTIONS_WITHOUT_ARGUMENT.has(option)) {
      shellMode ||=
        option === "--login" ||
        option === "--shell" ||
        option === "-i" ||
        option === "-s";
      index += 1;
      continue;
    }
    if (SUDO_OPTIONS_WITH_ARGUMENT.has(option)) {
      if (arguments_[index + 1] === undefined) return null;
      index += 2;
      continue;
    }
    if (option.startsWith("--")) {
      const equals = option.indexOf("=");
      if (equals === -1) return null;
      const name = option.slice(0, equals);
      const value = option.slice(equals + 1);
      if (
        name !== "--preserve-env" &&
        (!SUDO_OPTIONS_WITH_ARGUMENT.has(name) || value.length === 0)
      ) {
        return null;
      }
      index += 1;
      continue;
    }
    if (/^-[^-]/u.test(option)) {
      let consumesNext = false;

      for (let cursor = 1; cursor < option.length; cursor += 1) {
        const flag = option[cursor] ?? "";
        if (SUDO_SHORT_OPTIONS_WITHOUT_ARGUMENT.has(flag)) {
          shellMode ||= flag === "i" || flag === "s";
          continue;
        }
        if (!SUDO_SHORT_OPTIONS_WITH_ARGUMENT.has(flag)) return null;
        consumesNext = cursor === option.length - 1;
        break;
      }
      if (consumesNext) {
        if (arguments_[index + 1] === undefined) return null;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    return null;
  }

  return { index, shellMode };
}

interface RemoteSink {
  command: UnwrappedCommand;
  shellMode: boolean;
}

function unwrapRemoteSink(segment: string): RemoteSink | null {
  let current = unwrapCommand(segment);
  const maximumDepth = Array.from(segment).length + 1;
  let shellMode = false;

  for (let depth = 0; depth < maximumDepth; depth += 1) {
    if (current.executable !== "sudo") return { command: current, shellMode };
    const boundary = sudoCommandBoundary(current.arguments);
    if (boundary === null) return null;
    shellMode ||= boundary.shellMode;
    current = unwrapTokens(
      current.arguments.slice(boundary.index),
      current.malformed,
    );
  }

  return null;
}

function remoteSourceReachesShell(scanned: ScannedShellCommand): boolean {
  for (const pipeline of scanned.pipelines) {
    let remoteSource = false;

    for (const segment of pipeline) {
      const unwrapped = unwrapCommand(segment);
      const sink = remoteSource ? unwrapRemoteSink(segment) : null;
      if (
        sink !== null &&
        (sink.shellMode ||
          (!sink.command.malformed &&
            SHELL_EXECUTABLES.has(sink.command.executable)))
      ) {
        return true;
      }
      remoteSource ||= REMOTE_SOURCE_EXECUTABLES.has(unwrapped.executable);
    }
  }

  return false;
}

function reviewBeforeRunning(command: string): boolean {
  const scanned = scanShellCommand(command);
  if (scanned.malformed) return true;

  for (const pipeline of scanned.pipelines) {
    let remoteSource = false;

    for (const segment of pipeline) {
      const unwrapped = unwrapCommand(segment);
      if (dangerousCommand(unwrapped)) return true;
      if (remoteSource && SHELL_EXECUTABLES.has(unwrapped.executable)) {
        return true;
      }
      remoteSource ||= REMOTE_SOURCE_EXECUTABLES.has(unwrapped.executable);
    }
  }

  return false;
}

/** Classifies an inert, single-line repository command without executing it. */
export function commandDisposition(command: string): ReaderCommandDisposition {
  const normalized = normalizedVisibleCommand(command);

  if (normalized === null) return "withheld";
  return reviewBeforeRunning(normalized) ? "review" : "ready";
}

/** Identifies a documented runtime/version requirement without admitting it as a command. */
export function isDocumentedRuntimeRequirement(command: string): boolean {
  const normalized = command.normalize("NFKC").replace(/\s+/gu, " ").trim();

  if (
    /^(?:[~^]|[<>]=?)?\d+(?:\.\d+){0,2}(?:\.x)?(?:\s*\|\|\s*(?:[~^]|[<>]=?)?\d+(?:\.\d+){0,2}(?:\.x)?)*$/iu.test(
      normalized,
    )
  ) {
    return true;
  }

  return /^(?:bun|deno|go|java|node(?:\.js)?|npm|php|pnpm|python|ruby|rust|swift|yarn)(?:\s+version)?\s+(?:[~^]|[<>]=?|v)?\s*\d+(?:\.\d+){0,2}(?:\.x)?(?:\s*\|\|\s*(?:[~^]|[<>]=?|v)?\s*\d+(?:\.\d+){0,2}(?:\.x)?)*$/iu.test(
    normalized,
  );
}

/** Admits only an inert command with a documented executable position. */
export function documentedCommandDisposition(
  command: string,
): ReaderCommandDisposition | null {
  const normalized = normalizedVisibleCommand(command);

  if (normalized === null) return "withheld";
  const scanned = scanShellCommand(normalized);
  const first = scanned.pipelines[0]?.[0];

  if (first === undefined) return null;
  const unwrapped = unwrapCommand(first);
  const basename = unwrapped.rawExecutable.split("/").at(-1) ?? "";
  const projectExecutable = unwrapped.rawExecutable.slice(2);
  const directlyDocumented =
    unwrapped.rawExecutable.startsWith("./") &&
    projectExecutable.length > 0 &&
    isSafeProjectBriefPath(projectExecutable);
  const naturalArgument = unwrapped.arguments[0]?.toLocaleLowerCase("en-US");
  const recognizedSafetyShape =
    (REMOTE_SOURCE_EXECUTABLES.has(unwrapped.executable) &&
      remoteSourceReachesShell(scanned)) ||
    dangerousCommand({ ...unwrapped, malformed: false });

  if (
    isDocumentedRuntimeRequirement(normalized) ||
    (!directlyDocumented &&
      !DOCUMENTED_EXECUTABLES.has(unwrapped.executable) &&
      !recognizedSafetyShape) ||
    (!directlyDocumented && basename !== unwrapped.executable) ||
    (naturalArgument !== undefined &&
      NATURAL_LANGUAGE_ARGUMENTS.has(naturalArgument))
  ) {
    return null;
  }

  return reviewBeforeRunning(normalized) ? "review" : "ready";
}

/** Routes an already-admitted dependency installation command to its semantic slot. */
export function documentedCommandKind(
  command: string,
  contextualKind: ReaderCommandKind,
): ReaderCommandKind {
  const normalized = normalizedCommandSyntax(command);

  if (normalized === null) return contextualKind;
  const scanned = scanShellCommand(normalized);
  if (scanned.malformed) return contextualKind;
  let includesInstall = false;

  for (const pipeline of scanned.pipelines) {
    for (const segment of pipeline) {
      const unwrapped = unwrapRemoteSink(segment)?.command;

      if (unwrapped === undefined || unwrapped.malformed) return contextualKind;
      if (isPackageManager(unwrapped.executable)) {
        const kind = packageManagerCommandKind(
          unwrapped.executable,
          unwrapped.arguments,
        );

        if (kind !== "install") return contextualKind;
        includesInstall = true;
        continue;
      }
      if (!dangerousCommand(unwrapped)) return contextualKind;
    }
  }

  return includesInstall ? "install" : contextualKind;
}

function commandFact(
  kind: ReaderCommandKind,
  command: string,
  source: "readme" | "manifest",
  path: string,
): ReaderCommandFact {
  const disposition = commandDisposition(command);

  return {
    source,
    path,
    kind,
    command:
      disposition === "withheld" ? null : normalizedVisibleCommand(command),
    disposition,
  };
}

function packageManager(paths: ReadonlySet<string>): PackageManager {
  if (paths.has("pnpm-lock.yaml")) return "pnpm";
  if (paths.has("yarn.lock")) return "yarn";
  if (paths.has("bun.lock") || paths.has("bun.lockb")) return "bun";
  return "npm";
}

function selectedScriptKeys(
  scripts: Record<string, unknown>,
  keys: readonly string[],
): Partial<Record<Exclude<ReaderCommandKind, "install">, string>> | null {
  const run = keys.includes("start")
    ? "start"
    : keys.includes("serve")
      ? "serve"
      : undefined;
  const test = keys.includes("test")
    ? "test"
    : keys.filter((key) => key.startsWith("test:")).sort(compareText)[0];
  const selected = {
    ...(run === undefined ? {} : { run }),
    ...(keys.includes("dev") ? { develop: "dev" } : {}),
    ...(test === undefined ? {} : { test }),
    ...(keys.includes("build") ? { build: "build" } : {}),
  } satisfies Partial<Record<Exclude<ReaderCommandKind, "install">, string>>;

  if (
    Object.values(selected).some((key) => {
      const body = scripts[key];
      return typeof body !== "string" || body.trim().length === 0;
    })
  ) {
    return null;
  }

  return selected;
}

/** Derives inert root-package commands from script keys and root lockfiles. */
export function manifestReaderCommands(
  input: Pick<GeneralAnalysisInput, "tree" | "files">,
): ReaderCommandFact[] {
  const rootTreeFiles = input.tree.files.filter(
    (file) => toPathComparisonKey(file.path) === ROOT_PACKAGE_PATH,
  );
  const rootManifests = input.files.filter(
    (file) =>
      file.category === "manifest" &&
      toPathComparisonKey(file.path) === ROOT_PACKAGE_PATH,
  );

  if (rootTreeFiles.length !== 1 || rootManifests.length !== 1) return [];

  const manifest = rootManifests[0];
  if (
    manifest === undefined ||
    !isSafeProjectBriefPath(manifest.path) ||
    new TextEncoder().encode(manifest.text).byteLength > MAX_MANIFEST_BYTES
  ) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(manifest.text) as unknown;
  } catch {
    return [];
  }

  if (!isRecord(parsed) || !isRecord(parsed.scripts)) return [];

  const keys = Object.keys(parsed.scripts);
  if (keys.length > MAX_SCRIPT_KEYS) return [];

  const selected = selectedScriptKeys(parsed.scripts, keys);
  if (selected === null) return [];

  const rootPaths = new Set(
    input.tree.files
      .map((file) => toPathComparisonKey(file.path))
      .filter((path) => !path.includes("/")),
  );
  const manager = packageManager(rootPaths);
  const commands: ReaderCommandFact[] = [
    commandFact("install", `${manager} install`, "manifest", manifest.path),
  ];
  const orderedKinds = ["run", "develop", "test", "build"] as const;

  for (const kind of orderedKinds) {
    const key = selected[kind];

    if (key !== undefined) {
      commands.push(
        commandFact(kind, `${manager} run ${key}`, "manifest", manifest.path),
      );
    }
  }

  return commands;
}
