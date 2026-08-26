import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

export const LIGHTHOUSE_RUNS = 3;
export const LIGHTHOUSE_MIN_SCORE = 0.95;
export const LIGHTHOUSE_CATEGORIES = Object.freeze([
  "performance",
  "accessibility",
  "best-practices",
  "seo",
]);

const READY_TIMEOUT_MS = 120_000;

export function assertLighthouseScores(runs) {
  if (runs.length !== LIGHTHOUSE_RUNS) {
    throw new Error(
      `expected ${LIGHTHOUSE_RUNS} Lighthouse runs, received ${runs.length}`,
    );
  }

  for (const [runIndex, scores] of runs.entries()) {
    for (const category of LIGHTHOUSE_CATEGORIES) {
      const score = scores[category];
      if (!Number.isFinite(score)) {
        throw new Error(
          `Lighthouse run ${runIndex + 1} is missing ${category} score`,
        );
      }
      if (score < LIGHTHOUSE_MIN_SCORE) {
        throw new Error(
          `${category} score ${score.toFixed(2)} is below ${LIGHTHOUSE_MIN_SCORE.toFixed(2)} in Lighthouse run ${runIndex + 1}`,
        );
      }
    }
  }
}

async function reservePort() {
  const server = createServer();
  server.unref();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("could not reserve a local Lighthouse port");
  }
  await new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
  return address.port;
}

async function runCommand(command, args) {
  const child = spawn(command, args, {
    env: process.env,
    stdio: "inherit",
  });
  const [code, signal] = await once(child, "exit");
  if (code !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${signal ?? `exit ${code}`}`,
    );
  }
}

async function waitForPreview(url, child, output) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`preview exited before it was ready\n${output()}`);
    }
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch {
      // The preview server has not started listening yet.
    }
    await delay(250);
  }
  throw new Error(`preview did not become ready within ${READY_TIMEOUT_MS}ms`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(5_000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

async function collectScores(url) {
  const chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const runs = [];
    for (let index = 0; index < LIGHTHOUSE_RUNS; index += 1) {
      const result = await lighthouse(url, {
        logLevel: "error",
        onlyCategories: [...LIGHTHOUSE_CATEGORIES],
        output: "json",
        port: chrome.port,
      });
      if (result === undefined) {
        throw new Error(`Lighthouse run ${index + 1} did not return a report`);
      }
      runs.push(
        Object.fromEntries(
          LIGHTHOUSE_CATEGORIES.map((category) => [
            category,
            result.lhr.categories[category]?.score,
          ]),
        ),
      );
    }
    return runs;
  } finally {
    await chrome.kill();
  }
}

async function main() {
  await runCommand(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
    "build",
  ]);

  const port = await reservePort();
  const url = `http://127.0.0.1:${port}/`;
  const outputChunks = [];
  const preview = spawn(
    process.execPath,
    [
      resolve("node_modules/vite/bin/vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  const rememberOutput = (chunk) => {
    outputChunks.push(String(chunk));
    if (outputChunks.length > 40) outputChunks.shift();
  };
  preview.stdout.on("data", rememberOutput);
  preview.stderr.on("data", rememberOutput);

  try {
    await waitForPreview(url, preview, () => outputChunks.join(""));
    const runs = await collectScores(url);
    assertLighthouseScores(runs);
    for (const [index, scores] of runs.entries()) {
      console.log(
        `Lighthouse run ${index + 1}: ${LIGHTHOUSE_CATEGORIES.map(
          (category) => `${category}=${scores[category].toFixed(2)}`,
        ).join(" ")}`,
      );
    }
  } finally {
    await stopChild(preview);
  }
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  await main();
}
