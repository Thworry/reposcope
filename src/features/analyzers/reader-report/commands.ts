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

function normalizedVisibleCommand(command: string): string | null {
  if (containsUnsafeCodePoint(command)) return null;

  const normalized = command.normalize("NFKC").trim();
  const withoutPrompt = normalized.replace(/^[$>](?:\s+|$)/u, "").trim();

  if (
    withoutPrompt.length === 0 ||
    Array.from(withoutPrompt).length > MAX_COMMAND_CODE_POINTS ||
    containsUnsafeCodePoint(withoutPrompt) ||
    containsCredentialLikeValue(withoutPrompt)
  ) {
    return null;
  }

  return withoutPrompt;
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
  arguments: string[];
}

function isAssignment(token: string | undefined): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=\S+$/u.test(token ?? "");
}

function unwrapCommand(segment: string): UnwrappedCommand {
  const tokens = segment.trim().split(/\s+/u);
  let index = 0;

  while (isAssignment(tokens[index])) index += 1;
  if (executableName(tokens[index]) === "env") {
    index += 1;
    while (tokens[index]?.startsWith("-") === true) {
      const option = tokens[index] ?? "";

      if (option === "--") {
        index += 1;
        break;
      }
      if (
        option === "-u" ||
        option === "--unset" ||
        option === "-C" ||
        option === "--chdir"
      ) {
        index += 2;
        continue;
      }
      index += 1;
    }
    while (isAssignment(tokens[index])) index += 1;
  }

  return {
    executable: executableName(tokens[index]),
    arguments: tokens.slice(index + 1),
  };
}

function pipesRemoteContentToShell(
  command: string,
  executable: string,
): boolean {
  if (executable !== "curl" && executable !== "wget") return false;

  const pipe = command.indexOf("|");
  if (pipe === -1) return false;

  const piped = unwrapCommand(command.slice(pipe + 1));

  if (piped.executable === "sudo") return true;

  return new Set(["bash", "dash", "fish", "ksh", "sh", "zsh"]).has(
    piped.executable,
  );
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

function reviewBeforeRunning(command: string): boolean {
  const unwrapped = unwrapCommand(command.split("|", 1)[0] ?? "");
  const { executable, arguments: arguments_ } = unwrapped;

  if (executable === "sudo") return true;
  if (pipesRemoteContentToShell(command, executable)) return true;
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

/** Classifies an inert, single-line repository command without executing it. */
export function commandDisposition(command: string): ReaderCommandDisposition {
  const normalized = normalizedVisibleCommand(command);

  if (normalized === null) return "withheld";
  return reviewBeforeRunning(normalized) ? "review" : "ready";
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
