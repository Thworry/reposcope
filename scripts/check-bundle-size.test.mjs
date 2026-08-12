import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import test from "node:test";
import { build } from "vite";

import {
  assertBundleBudgets,
  gzipBytes,
  measureBundle,
} from "./check-bundle-size.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "reposcope-bundle-"));
  mkdirSync(join(root, ".vite"), { recursive: true });
  mkdirSync(join(root, "assets"), { recursive: true });

  const assets = {
    "entry.js": "entry".repeat(120),
    "shared.js": "shared".repeat(80),
    "initial.css": "body{color:#172b3a}".repeat(20),
    "worker.js": "worker".repeat(60),
    "js-ts.js": "javascript parser".repeat(70),
    "js-parser.js": "babel parser".repeat(40),
    "python.js": "python parser".repeat(70),
    "python-parser.js": "lezer parser".repeat(40),
    "unrelated.js": "must not count".repeat(1_000),
    "entry.js.map": "source map".repeat(1_000),
  };
  for (const [name, content] of Object.entries(assets)) {
    writeFileSync(join(root, "assets", name), content);
  }

  writeFileSync(
    join(root, ".vite", "manifest.json"),
    JSON.stringify({
      "index.html": {
        file: "assets/entry.js",
        isEntry: true,
        imports: ["_shared", "_shared-alias"],
        css: ["assets/initial.css"],
      },
      _shared: { file: "assets/shared.js" },
      "_shared-alias": { file: "assets/shared.js" },
      _worker: {
        file: "assets/worker.js",
        dynamicImports: ["_js-ts", "_python"],
      },
      "_js-ts": {
        file: "assets/js-ts.js",
        name: "js-ts",
        imports: ["_js-parser"],
        isDynamicEntry: true,
      },
      "_js-parser": { file: "assets/js-parser.js" },
      _python: {
        file: "assets/python.js",
        name: "python",
        imports: ["_python-parser"],
        isDynamicEntry: true,
      },
      "_python-parser": { file: "assets/python-parser.js" },
      _unrelated: { file: "assets/unrelated.js" },
    }),
  );

  return root;
}

test("measures only the initial entry graph and separate initial CSS", () => {
  const root = fixture();
  try {
    const result = measureBundle(root);
    assert.equal(
      result.initialJs,
      gzipBytes(join(root, "assets/entry.js")) +
        gzipBytes(join(root, "assets/shared.js")),
    );
    assert.equal(
      result.initialCss,
      gzipBytes(join(root, "assets/initial.css")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("detects both analyzer dynamic chunks and their static parser imports", () => {
  const root = fixture();
  try {
    const result = measureBundle(root);
    assert.deepEqual(
      result.analyzers.map(({ name, gzipBytes: bytes }) => [name, bytes]),
      [
        [
          "js-ts",
          gzipBytes(join(root, "assets/js-ts.js")) +
            gzipBytes(join(root, "assets/js-parser.js")),
        ],
        [
          "python",
          gzipBytes(join(root, "assets/python.js")) +
            gzipBytes(join(root, "assets/python-parser.js")),
        ],
      ],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts exact budgets and rejects one byte over each budget", () => {
  assert.doesNotThrow(() =>
    assertBundleBudgets({
      initialJs: 204_800,
      initialCss: 51_200,
      analyzers: [
        { name: "js-ts", gzipBytes: 512_000 },
        { name: "python", gzipBytes: 512_000 },
      ],
    }),
  );

  for (const [result, pattern] of [
    [
      { initialJs: 204_801, initialCss: 0, analyzers: [] },
      /initial JavaScript.*204801.*204800/u,
    ],
    [
      { initialJs: 0, initialCss: 51_201, analyzers: [] },
      /initial CSS.*51201.*51200/u,
    ],
    [
      {
        initialJs: 0,
        initialCss: 0,
        analyzers: [{ name: "python", gzipBytes: 512_001 }],
      },
      /python.*512001.*512000/u,
    ],
  ]) {
    assert.throws(() => assertBundleBudgets(result), pattern);
  }
});

test("fails closed for a missing manifest, manifest record, or emitted chunk", () => {
  const absent = mkdtempSync(join(tmpdir(), "reposcope-bundle-"));
  try {
    assert.throws(() => measureBundle(absent), /manifest/u);
    const cli = spawnSync(
      process.execPath,
      [resolve("scripts/check-bundle-size.mjs"), absent],
      { encoding: "utf8" },
    );
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /manifest/u);
  } finally {
    rmSync(absent, { recursive: true, force: true });
  }

  const root = fixture();
  try {
    const manifestPath = join(root, ".vite", "manifest.json");
    const manifest = JSON.parse(String(readFileSync(manifestPath)));
    manifest._worker.dynamicImports.push("_missing");
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(
      () => measureBundle(root),
      /missing manifest record.*_missing/u,
    );

    manifest._worker.dynamicImports.pop();
    writeFileSync(manifestPath, JSON.stringify(manifest));
    rmSync(join(root, "assets/python.js"));
    assert.throws(
      () => measureBundle(root),
      /missing emitted chunk.*python\.js/u,
    );
    const cli = spawnSync(
      process.execPath,
      [resolve("scripts/check-bundle-size.mjs"), root],
      { encoding: "utf8" },
    );
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /missing emitted chunk.*python\.js/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function filesUnder(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

test("production output has exact CSP, local assets, and a complete subpath manifest", async () => {
  const output = mkdtempSync(join(tmpdir(), "reposcope-release-"));
  const previousBase = process.env.REPOSCOPE_BASE_PATH;
  process.env.REPOSCOPE_BASE_PATH = "/reposcope/";
  try {
    await build({
      configFile: resolve("vite.config.ts"),
      logLevel: "silent",
      build: { outDir: output, emptyOutDir: true },
    });

    const sourceHtml = String(readFileSync(resolve("index.html")));
    const html = String(readFileSync(join(output, "index.html")));
    assert.equal(
      (sourceHtml.match(/http-equiv=["']Content-Security-Policy["']/giu) ?? [])
        .length,
      0,
    );

    const cspMatches = [
      ...html.matchAll(
        /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)">/giu,
      ),
    ];
    assert.equal(cspMatches.length, 1);
    assert.equal(
      cspMatches[0][1].replaceAll("&#39;", "'"),
      [
        "default-src 'self'",
        "connect-src 'self' https://api.github.com https://raw.githubusercontent.com",
        "img-src 'self' data:",
        "style-src 'self'",
        "script-src 'self'",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "upgrade-insecure-requests",
      ].join("; "),
    );

    assert.match(html, /href="\/reposcope\/favicon\.svg"/u);
    assert.match(html, /src="\/reposcope\/assets\/index-[^"]+\.js"/u);
    assert.match(html, /href="\/reposcope\/assets\/index-[^"]+\.css"/u);
    assert.ok(readFileSync(join(output, "favicon.svg")).byteLength > 0);
    assert.ok(readFileSync(join(output, "robots.txt")).byteLength > 0);

    const manifest = JSON.parse(
      String(readFileSync(join(output, ".vite", "manifest.json"))),
    );
    const records = Object.values(manifest);
    assert.deepEqual(
      records
        .map((record) => record.name)
        .filter((name) => ["analysis.worker", "js-ts", "python"].includes(name))
        .sort(),
      ["analysis.worker", "js-ts", "python"],
    );
    for (const record of records) {
      assert.match(record.url, /^\/reposcope\/assets\//u);
      for (const url of record.cssUrls ?? []) {
        assert.match(url, /^\/reposcope\/assets\//u);
      }
    }

    const worker = records.find((record) => record.name === "analysis.worker");
    const jsTs = records.find((record) => record.name === "js-ts");
    const python = records.find((record) => record.name === "python");
    const main = records.find((record) => record.isEntry === true);
    const mainSource = String(readFileSync(join(output, main.file)));
    const workerSource = String(readFileSync(join(output, worker.file)));
    assert.ok(mainSource.includes(worker.url));
    for (const analyzer of [jsTs, python]) {
      const relativeAnalyzerUrl = `./${analyzer.file.split("/").at(-1)}`;
      assert.ok(workerSource.includes(relativeAnalyzerUrl));
      assert.equal(
        new URL(relativeAnalyzerUrl, `https://example.test${worker.url}`)
          .pathname,
        analyzer.url,
      );
    }

    const applicationSources = [
      resolve("index.html"),
      resolve("vite.config.ts"),
    ]
      .concat(filesUnder(resolve("src")))
      .filter((path) => !/\.test\.[cm]?[jt]sx?$/u.test(path))
      .filter((path) =>
        [".css", ".html", ".ts", ".tsx"].includes(extname(path)),
      );
    const applicationText = applicationSources
      .map((path) => String(readFileSync(path)))
      .join("\n");
    const releaseText = filesUnder(output)
      .filter((path) => [".css", ".html", ".js"].includes(extname(path)))
      .map((path) => String(readFileSync(path)))
      .join("\n");
    assert.doesNotMatch(applicationText, /\bstyle\s*=/u);
    assert.doesNotMatch(`${sourceHtml}\n${html}`, /<[^>]+\sstyle=/iu);
    assert.doesNotMatch(
      `${sourceHtml}\n${html}`,
      /<(?:img|script)\b[^>]+src=["']https?:|<link\b[^>]+href=["']https?:/iu,
    );
    assert.doesNotMatch(applicationText, /@import\s+(?:url\()?['"]?https?:/iu);
    assert.doesNotMatch(applicationText, /url\(\s*['"]?https?:/iu);
    assert.doesNotMatch(
      releaseText,
      /unsafe-inline|unsafe-eval|WebAssembly|\.wasm\b/iu,
    );
    assert.equal(
      filesUnder(output).some(
        (path) => extname(path).toLowerCase() === ".wasm",
      ),
      false,
    );
  } finally {
    if (previousBase === undefined) delete process.env.REPOSCOPE_BASE_PATH;
    else process.env.REPOSCOPE_BASE_PATH = previousBase;
    rmSync(output, { recursive: true, force: true });
  }
});

function assertOrdered(text, tokens) {
  let cursor = -1;
  for (const token of tokens) {
    const next = text.indexOf(token, cursor + 1);
    assert.ok(next > cursor, `${token} must appear in the required order`);
    cursor = next;
  }
}

test("release automation is pinned, least-privileged, and ordered", async () => {
  const ci = String(readFileSync(resolve(".github/workflows/ci.yml")));
  const pages = String(readFileSync(resolve(".github/workflows/pages.yml")));
  const dependabot = String(readFileSync(resolve(".github/dependabot.yml")));
  const lighthouse = (await import(resolve("lighthouserc.cjs"))).default;

  assert.match(ci, /permissions:\n {2}contents: read\n/u);
  assert.doesNotMatch(ci, /(?:contents|actions|checks|packages): write/u);
  for (const pin of [
    "actions/checkout@v7.0.1",
    "pnpm/action-setup@v6.0.10",
    "actions/setup-node@v7.0.0",
  ]) {
    assert.ok(ci.includes(pin));
    assert.ok(pages.includes(pin));
  }
  assertOrdered(ci, [
    "pnpm install --frozen-lockfile",
    "pnpm lint",
    "pnpm format:check",
    "pnpm exec tsc -b",
    "pnpm test:coverage",
    "pnpm build",
    "pnpm check:bundle",
    "pnpm exec playwright install --with-deps chromium",
    "pnpm exec playwright test --project=desktop-chromium",
    "pnpm check:lighthouse",
  ]);
  assert.match(ci, /version: 11\.16\.0/u);
  assert.match(ci, /node-version: 24/u);

  assert.match(
    pages,
    /permissions:\n {2}contents: read\n {2}pages: write\n {2}id-token: write\n/u,
  );
  assertOrdered(pages, [
    "pnpm install --frozen-lockfile",
    "pnpm lint",
    "pnpm format:check",
    "pnpm exec tsc -b",
    "pnpm test:coverage",
    "pnpm build",
    "pnpm check:bundle",
    "pnpm exec playwright install --with-deps chromium",
    "pnpm exec playwright test --project=desktop-chromium",
    "pnpm check:lighthouse",
    "name: Build Pages artifact",
    "REPOSCOPE_BASE_PATH: /${{ github.event.repository.name }}/",
    "actions/configure-pages@v6.0.0",
    "actions/upload-pages-artifact@v5.0.0",
    "path: dist",
    "actions/deploy-pages@v5.0.0",
  ]);

  assert.equal((dependabot.match(/interval: weekly/gu) ?? []).length, 2);
  assert.equal(
    (dependabot.match(/open-pull-requests-limit: 5/gu) ?? []).length,
    2,
  );
  assert.match(dependabot, /package-ecosystem: npm/u);
  assert.match(dependabot, /package-ecosystem: github-actions/u);

  assert.equal(lighthouse.ci.collect.numberOfRuns, 3);
  assert.deepEqual(lighthouse.ci.collect.url, ["http://127.0.0.1:4173/"]);
  for (const category of [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
  ]) {
    assert.deepEqual(
      lighthouse.ci.assert.assertions[`categories:${category}`],
      ["error", { minScore: 0.95 }],
    );
  }

  const previousBase = process.env.REPOSCOPE_BASE_PATH;
  delete process.env.REPOSCOPE_BASE_PATH;
  try {
    const configFactory = (await import(resolve("vite.config.ts"))).default;
    assert.equal(
      configFactory({ command: "build", mode: "production" }).base,
      "/",
    );
    assert.equal(
      configFactory({ command: "serve", mode: "development" }).base,
      "/",
    );
  } finally {
    if (previousBase !== undefined) {
      process.env.REPOSCOPE_BASE_PATH = previousBase;
    }
  }
});
