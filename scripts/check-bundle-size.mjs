import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const BUDGETS = Object.freeze({
  initialJs: 204_800,
  initialCss: 51_200,
  analyzer: 512_000,
});

const ANALYZER_NAMES = Object.freeze(["js-ts", "python"]);

export function gzipBytes(filePath) {
  return gzipSync(readFileSync(filePath)).byteLength;
}

function readManifest(distDir) {
  const manifestPath = join(distDir, ".vite", "manifest.json");
  let value;
  try {
    value = JSON.parse(String(readFileSync(manifestPath)));
  } catch (error) {
    const reason = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(
      `missing or invalid Vite manifest at ${manifestPath}${reason}`,
      {
        cause: error,
      },
    );
  }
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`invalid Vite manifest object at ${manifestPath}`);
  }
  return value;
}

function recordFor(manifest, key) {
  const record = manifest[key];
  if (record === null || Array.isArray(record) || typeof record !== "object") {
    throw new Error(`missing manifest record: ${key}`);
  }
  return record;
}

function stringArray(record, field, key) {
  const value = record[field];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`invalid ${field} list in manifest record: ${key}`);
  }
  return value;
}

function emittedPath(distDir, asset) {
  if (typeof asset !== "string" || asset.length === 0 || asset.includes("\\")) {
    throw new Error(`invalid emitted chunk path: ${String(asset)}`);
  }
  const normalized = normalize(asset);
  if (
    normalized !== asset ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/")
  ) {
    throw new Error(`unsafe emitted chunk path: ${asset}`);
  }
  const root = resolve(distDir);
  const filePath = resolve(root, normalized);
  if (relative(root, filePath).startsWith("..") || !existsSync(filePath)) {
    throw new Error(`missing emitted chunk: ${asset}`);
  }
  return filePath;
}

function walkStaticGraph(manifest, roots) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length > 0) {
    const key = stack.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    const record = recordFor(manifest, key);
    stack.push(...stringArray(record, "imports", key));
  }
  return seen;
}

function analyzerName(record) {
  const values = [record.name, record.file].filter(
    (value) => typeof value === "string",
  );
  return ANALYZER_NAMES.find((name) =>
    values.some((value) =>
      new RegExp(`(?:^|/)${name}(?:-|\\.|$)`, "u").test(value),
    ),
  );
}

function sumJavaScript(manifest, keys, distDir) {
  let total = 0;
  const files = [];
  const seenFiles = new Set();
  for (const key of [...keys].sort()) {
    const record = recordFor(manifest, key);
    if (typeof record.file !== "string") {
      throw new Error(`missing emitted file in manifest record: ${key}`);
    }
    if (![".js", ".mjs"].includes(extname(record.file))) continue;
    if (seenFiles.has(record.file)) continue;
    seenFiles.add(record.file);
    const filePath = emittedPath(distDir, record.file);
    total += gzipBytes(filePath);
    files.push(record.file);
  }
  return { total, files };
}

export function measureBundle(distDir) {
  const manifest = readManifest(distDir);
  const entries = Object.entries(manifest)
    .filter(([, record]) => record?.isEntry === true)
    .map(([key]) => key);
  if (entries.length === 0) throw new Error("Vite manifest has no entry chunk");

  const initialGraph = walkStaticGraph(manifest, entries);
  const initial = sumJavaScript(manifest, initialGraph, distDir);

  const css = new Set();
  for (const key of initialGraph) {
    const record = recordFor(manifest, key);
    for (const asset of stringArray(record, "css", key)) css.add(asset);
  }
  let initialCss = 0;
  for (const asset of [...css].sort()) {
    initialCss += gzipBytes(emittedPath(distDir, asset));
  }

  const dynamicAnalyzerKeys = new Map();
  for (const [key, record] of Object.entries(manifest)) {
    for (const dynamicKey of stringArray(record, "dynamicImports", key)) {
      const dynamicRecord = recordFor(manifest, dynamicKey);
      const name = analyzerName(dynamicRecord);
      if (name === undefined) continue;
      if (dynamicAnalyzerKeys.has(name)) {
        throw new Error(
          `multiple dynamic ${name} analyzer chunks in Vite manifest`,
        );
      }
      dynamicAnalyzerKeys.set(name, dynamicKey);
    }
  }

  const analyzers = ANALYZER_NAMES.map((name) => {
    const key = dynamicAnalyzerKeys.get(name);
    if (key === undefined) {
      throw new Error(
        `missing dynamic ${name} analyzer chunk in Vite manifest`,
      );
    }
    const graph = walkStaticGraph(manifest, [key]);
    const measured = sumJavaScript(manifest, graph, distDir);
    return { name, gzipBytes: measured.total, files: measured.files };
  });

  return {
    initialJs: initial.total,
    initialCss,
    initialFiles: initial.files,
    cssFiles: [...css].sort(),
    analyzers,
  };
}

function assertAtMost(name, measured, budget) {
  if (!Number.isFinite(measured) || measured < 0) {
    throw new Error(`${name} has invalid measured bytes: ${String(measured)}`);
  }
  if (measured > budget) {
    throw new Error(
      `${name} measured ${measured} bytes; budget is ${budget} bytes`,
    );
  }
}

export function assertBundleBudgets(result) {
  assertAtMost("initial JavaScript", result.initialJs, BUDGETS.initialJs);
  assertAtMost("initial CSS", result.initialCss, BUDGETS.initialCss);
  for (const analyzer of result.analyzers) {
    assertAtMost(analyzer.name, analyzer.gzipBytes, BUDGETS.analyzer);
  }
}

function report(result) {
  const lines = [
    `initial JavaScript: ${result.initialJs} / ${BUDGETS.initialJs} bytes gzip`,
    `initial CSS: ${result.initialCss} / ${BUDGETS.initialCss} bytes gzip`,
    ...result.analyzers.map(
      (analyzer) =>
        `${analyzer.name}: ${analyzer.gzipBytes} / ${BUDGETS.analyzer} bytes gzip`,
    ),
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const result = measureBundle(resolve(process.argv[2] ?? "dist"));
    assertBundleBudgets(result);
    report(result);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
