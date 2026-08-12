import type { ImportingFile } from "../../analysis/model";
import type { GraphFile } from "./model";
import { comparisonPath, comparePathValues } from "./path-order";

const JS_TS_EXTENSIONS = [
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".d.ts",
] as const;
const JS_TS_INDEX_FILES = JS_TS_EXTENSIONS.map(
  (extension) => `index${extension}`,
);
const PYTHON_MODULE_FILES = [".py", ".pyi"] as const;
const PYTHON_PACKAGE_FILES = ["__init__.py", "__init__.pyi"] as const;

function normalizePosixPath(path: string): string | null {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\")) {
    return null;
  }

  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment.length === 0 || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  return segments.length === 0 ? null : segments.join("/");
}

function directoryOf(path: string): string {
  const separator = path.lastIndexOf("/");

  return separator === -1 ? "" : path.slice(0, separator);
}

function joinPath(directory: string, target: string): string | null {
  return normalizePosixPath(
    directory.length === 0 ? target : `${directory}/${target}`,
  );
}

function isJavaScriptTypeScriptLanguage(
  language: ImportingFile["language"],
): boolean {
  return language === "javascript" || language === "typescript";
}

function resolveCandidate(
  candidates: readonly string[],
  filesByPath: ReadonlyMap<string, GraphFile>,
  language: ImportingFile["language"],
): GraphFile | null {
  for (const candidate of candidates) {
    const normalized = normalizePosixPath(candidate);

    if (normalized === null) {
      continue;
    }
    const target = filesByPath.get(comparisonPath(normalized));

    if (
      target !== undefined &&
      (language === "python"
        ? target.language === "python"
        : isJavaScriptTypeScriptLanguage(target.language))
    ) {
      return target;
    }
  }

  return null;
}

function resolveJavaScriptTypeScriptImport(
  file: GraphFile,
  specifier: string,
  filesByPath: ReadonlyMap<string, GraphFile>,
): GraphFile | null {
  if (!(specifier.startsWith("./") || specifier.startsWith("../"))) {
    return null;
  }
  const base = joinPath(directoryOf(file.path), specifier);

  if (base === null) {
    return null;
  }

  return resolveCandidate(
    [
      base,
      ...JS_TS_EXTENSIONS.map((extension) => `${base}${extension}`),
      ...JS_TS_INDEX_FILES.map((indexFile) => `${base}/${indexFile}`),
    ],
    filesByPath,
    file.language,
  );
}

function pythonImportBase(file: GraphFile, specifier: string): string | null {
  const relative = /^(\.+)(.*)$/u.exec(specifier);

  if (relative === null) {
    return null;
  }
  const dots = relative[1]?.length ?? 0;
  const module = relative[2] ?? "";
  const directorySegments = directoryOf(file.path).split("/").filter(Boolean);
  const levelsUp = dots - 1;

  if (levelsUp > directorySegments.length) {
    return null;
  }
  directorySegments.splice(directorySegments.length - levelsUp, levelsUp);

  const moduleSegments = module.length === 0 ? [] : module.split(".");

  return normalizePosixPath(
    [...directorySegments, ...moduleSegments].join("/"),
  );
}

function resolvePythonImport(
  file: GraphFile,
  specifier: string,
  filesByPath: ReadonlyMap<string, GraphFile>,
): GraphFile | null {
  const base = pythonImportBase(file, specifier);

  if (base === null) {
    return null;
  }
  const hasModule = /^(\.+).+$/u.test(specifier);
  const candidates = hasModule
    ? [
        ...PYTHON_MODULE_FILES.map((extension) => `${base}${extension}`),
        ...PYTHON_PACKAGE_FILES.map((fileName) => `${base}/${fileName}`),
      ]
    : PYTHON_PACKAGE_FILES.map((fileName) => `${base}/${fileName}`);

  return resolveCandidate(candidates, filesByPath, "python");
}

function resolvePythonImportCandidate(
  file: GraphFile,
  specifier: string,
  filesByPath: ReadonlyMap<string, GraphFile>,
): GraphFile | null {
  const candidate = /^(\.+)([^.]+)$/u.exec(specifier);

  if (candidate === null) {
    return null;
  }
  const packageBase = pythonImportBase(file, candidate[1] ?? "");
  const importedName = candidate[2];

  if (packageBase === null || importedName === undefined) {
    return null;
  }
  const packageFile = resolveCandidate(
    PYTHON_PACKAGE_FILES.map((fileName) => `${packageBase}/${fileName}`),
    filesByPath,
    "python",
  );

  if (
    packageFile?.comparisonPath !== file.comparisonPath &&
    packageFile?.topLevelDefinedNames.includes(importedName) === true
  ) {
    return null;
  }

  return resolvePythonImport(file, specifier, filesByPath);
}

export function buildImportGraph(
  input: readonly ImportingFile[],
): Map<string, string[]> {
  const ordered = input
    .map((file) => ({
      path: file.path,
      comparisonPath: comparisonPath(file.path),
      language: file.language,
      relativeImports: file.relativeImports,
      relativeImportCandidates: file.relativeImportCandidates ?? [],
      topLevelDefinedNames: file.topLevelDefinedNames ?? [],
    }))
    .sort((left, right) => comparePathValues(left.path, right.path));
  const filesByPath = new Map<string, GraphFile>();

  for (const file of ordered) {
    if (!filesByPath.has(file.comparisonPath)) {
      filesByPath.set(file.comparisonPath, file);
    }
  }

  const graph = new Map<string, string[]>();
  for (const file of filesByPath.values()) {
    const edges = new Set<string>();
    const imports = [...file.relativeImports].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    );

    for (const specifier of imports) {
      const target =
        file.language === "python"
          ? resolvePythonImport(file, specifier, filesByPath)
          : resolveJavaScriptTypeScriptImport(file, specifier, filesByPath);

      if (target !== null && target.comparisonPath !== file.comparisonPath) {
        edges.add(target.path);
      }
    }
    if (file.language === "python") {
      const candidates = [...file.relativeImportCandidates].sort(
        (left, right) => left.localeCompare(right, "en-US"),
      );

      for (const specifier of candidates) {
        const target = resolvePythonImportCandidate(
          file,
          specifier,
          filesByPath,
        );

        if (target !== null && target.comparisonPath !== file.comparisonPath) {
          edges.add(target.path);
        }
      }
    }
    graph.set(file.path, [...edges].sort(comparePathValues));
  }

  return graph;
}
