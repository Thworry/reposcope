import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  COMMIT_SHA,
  FIXED_NOW,
  installExternalRequestGuard,
  installGitHubRoutes,
  type RequestLedger,
} from "./fixtures";

const APP_PATH = "/";
const GITHUB_RATE_LIMIT_DOCS =
  "https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api";
const TYPESCRIPT_SCORES = [53, 70, 100, 100, 60, 30] as const;
const PYTHON_SCORES = [53, 50, 100, 100, 33, 30] as const;

interface RuntimeMonitor {
  assertClean(): Promise<void>;
}

async function monitorRuntime(
  context: Parameters<typeof installExternalRequestGuard>[0],
  page: Page,
): Promise<RuntimeMonitor> {
  const failures: string[] = [];
  const assertExternalRequests = await installExternalRequestGuard(context);

  page.on("pageerror", (error) => {
    failures.push(`page error: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      failures.push(`console ${message.type()}: ${message.text()}`);
    }
  });

  return {
    assertClean: async () => {
      await assertExternalRequests();
      expect(failures, failures.join("\n")).toEqual([]);
    },
  };
}

async function installFixedClock(page: Page): Promise<void> {
  await page.addInitScript(
    ({ fixedNow }) => {
      const NativeDate = Date;
      const timestamp = NativeDate.parse(fixedNow);

      class FixedDate extends NativeDate {
        constructor(value?: string | number | Date) {
          if (value === undefined) {
            super(timestamp);
          } else {
            super(value);
          }
        }

        static override now(): number {
          return timestamp;
        }
      }

      Object.defineProperty(globalThis, "Date", {
        configurable: true,
        writable: true,
        value: FixedDate,
      });
    },
    { fixedNow: FIXED_NOW },
  );
}

async function gotoLanding(page: Page): Promise<void> {
  await page.goto(APP_PATH);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function submitRepository(
  page: Page,
  url = "https://github.com/owner/repo",
): Promise<void> {
  await page.getByLabel("Public GitHub repository URL").fill(url);
  await page.getByRole("button", { name: "Analyze repository" }).click();
}

async function expectReport(page: Page, name = "owner/repo"): Promise<void> {
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible({
    timeout: 30_000,
  });
}

async function dimensionScores(page: Page): Promise<number[]> {
  const values = await page
    .locator(".dimension-score__header strong")
    .allTextContents();

  return values.map((value) => {
    const score = /(?<score>\d+)\s*\/\s*100/u.exec(value)?.groups?.score;
    if (score === undefined)
      throw new Error(`Missing dimension score: ${value}`);
    return Number(score);
  });
}

async function expectBoundedRequests(
  ledger: RequestLedger,
  expectedRaw: number,
): Promise<void> {
  expect(ledger.restGets()).toHaveLength(3);
  expect(ledger.rawGets()).toHaveLength(expectedRaw);
  expect(ledger.rawGets().length).toBeLessThanOrEqual(200);
  await ledger.assertComplete({ rest: 3, raw: expectedRaw });
}

async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = result.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious).toEqual([]);
}

async function measureViewport(page: Page, width: number): Promise<number> {
  await page.setViewportSize({ width, height: width <= 375 ? 812 : 900 });
  return page.evaluate(() =>
    Math.max(
      0,
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  );
}

async function expectResponsiveTargets(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  const widths = [375, 900, 1366] as const;
  const measurements: Array<{
    width: number;
    overflow: number;
    smallestTarget: number;
  }> = [];

  for (const width of widths) {
    const overflow = await measureViewport(page, width);
    expect(overflow, `horizontal overflow at ${String(width)}px`).toBe(0);
    const targets = page.locator("a, button, input, select, summary");
    let smallestTarget = Number.POSITIVE_INFINITY;

    for (let index = 0; index < (await targets.count()); index += 1) {
      const target = targets.nth(index);
      if (!(await target.isVisible())) continue;
      const box = await target.boundingBox();
      expect(box, `missing target box at ${String(width)}px`).not.toBeNull();
      if (box === null) continue;
      smallestTarget = Math.min(smallestTarget, box.width, box.height);
      expect(
        box.width,
        `${await target.evaluate((node) => node.outerHTML)} width at ${String(width)}px`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        box.height,
        `${await target.evaluate((node) => node.outerHTML)} height at ${String(width)}px`,
      ).toBeGreaterThanOrEqual(44);
    }
    measurements.push({ width, overflow, smallestTarget });
  }

  const zoomEquivalentOverflow = await measureViewport(page, 188);
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter(
        (element) =>
          element.getBoundingClientRect().right >
          document.documentElement.clientWidth + 0.5,
      )
      .slice(0, 12)
      .map((element) => ({
        selector: `${element.tagName.toLowerCase()}.${element.className}`,
        right: element.getBoundingClientRect().right,
        width: element.getBoundingClientRect().width,
      })),
  );
  expect(
    zoomEquivalentOverflow,
    `200% zoom-equivalent narrow reflow: ${JSON.stringify(overflowing)}`,
  ).toBe(0);
  await testInfo.attach("responsive-measurements", {
    body: JSON.stringify(
      { measurements, zoomEquivalentWidth: 188, zoomEquivalentOverflow },
      null,
      2,
    ),
    contentType: "application/json",
  });
}

async function expectKeyboardFocus(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1366, height: 900 });
  const expected = page.locator(
    "a[href]:visible, button:not([disabled]):visible, input:not([disabled]):visible, select:not([disabled]):visible, summary:visible",
  );
  const expectedCount = await expected.count();
  await expected.evaluateAll((elements) => {
    elements.forEach((element, index) => {
      element.setAttribute("data-e2e-focus-id", String(index));
    });
  });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  });

  const visited = new Set<string>();
  for (let index = 0; index < expectedCount + 3; index += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) return null;
      const focusId = element.getAttribute("data-e2e-focus-id");
      if (focusId === null) return null;
      const style = getComputedStyle(element);
      return {
        identity: `${focusId}:${element.tagName}:${element.textContent.trim().slice(0, 80)}`,
        width: Number.parseFloat(style.outlineWidth),
        style: style.outlineStyle,
        color: style.outlineColor,
      };
    });
    if (focused === null) continue;
    visited.add(focused.identity);
    expect(
      focused.width,
      `focus width for ${focused.identity}`,
    ).toBeGreaterThanOrEqual(3);
    expect(focused.style, `focus style for ${focused.identity}`).not.toBe(
      "none",
    );
    expect(focused.color, `focus color for ${focused.identity}`).not.toMatch(
      /rgba\([^)]*,\s*0\)/u,
    );
  }
  expect(visited.size).toBeGreaterThanOrEqual(expectedCount);
}

function maximumDuration(value: string): number {
  return Math.max(
    ...value.split(",").map((duration) => {
      const normalized = duration.trim();
      const numeric = Number.parseFloat(normalized);
      return normalized.endsWith("ms") ? numeric / 1000 : numeric;
    }),
  );
}

async function expectReducedMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const durations = await page.locator("*").evaluateAll((elements) =>
    elements
      .filter(
        (element) =>
          element instanceof HTMLElement && element.getClientRects().length > 0,
      )
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          transition: style.transitionDuration,
          animation: style.animationDuration,
        };
      }),
  );
  for (const duration of durations) {
    expect(maximumDuration(duration.transition)).toBeLessThanOrEqual(0.001);
    expect(maximumDuration(duration.animation)).toBeLessThanOrEqual(0.001);
  }
}

test.beforeEach(async ({ context, page }) => {
  await context.clearCookies();
  await installFixedClock(page);
});

test("English landing submits by keyboard, announces progress, and cancels", async ({
  context,
  page,
}, testInfo) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, {
    blockFirstRest: true,
  });
  await gotoLanding(page);
  await expectNoSeriousAxeViolations(page);
  await page
    .getByLabel("Public GitHub repository URL")
    .fill("https://github.com/owner/repo");
  await page.getByLabel("Public GitHub repository URL").press("Enter");
  await expect(
    page.getByRole("heading", { name: "Repository scan in progress" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    /Fetch repository structure|Starting repository analysis/u,
  );
  await page.screenshot({
    path: testInfo.outputPath("landing-progress.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  await expect(
    page.getByRole("heading", { name: "Repository scan in progress" }),
  ).toBeHidden();
  expect(ledger.rawGets()).toHaveLength(0);
  ledger.releaseFirstRest();
  await ledger.assertComplete({ rest: 1, raw: 0 });
  await runtime.assertClean();
});

test("Chinese language persists and switching a report does not refetch", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page);
  await gotoLanding(page);
  await page.getByRole("button", { name: "简体中文" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "公开项目",
  );
  await page.reload();
  await expect(page.getByLabel("公开 GitHub 项目网址")).toBeVisible();
  await page
    .getByLabel("公开 GitHub 项目网址")
    .fill("https://github.com/owner/repo");
  await page.getByRole("button", { name: "分析项目" }).click();
  await expectReport(page);
  const counts = {
    rest: ledger.restGets().length,
    raw: ledger.rawGets().length,
  };
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByText("Dimension scores")).toBeVisible();
  expect(ledger.restGets()).toHaveLength(counts.rest);
  expect(ledger.rawGets()).toHaveLength(counts.raw);
  await ledger.assertComplete({ rest: 3, raw: 8 });
  await runtime.assertClean();
});

test("complete TypeScript report is bounded, shareable, responsive, and accessible", async ({
  context,
  page,
}, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4173",
  });
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page);
  await gotoLanding(page);
  await submitRepository(page);
  await expectReport(page);
  await expectBoundedRequests(ledger, 8);
  await expect(page.locator(".report-summary__score strong")).toHaveText(
    "74 / 100",
  );
  await expect(
    page.locator(".report-summary__metadata > div").first(),
  ).toContainText("100% · High confidence");
  expect(await dimensionScores(page)).toEqual(TYPESCRIPT_SCORES);
  await expect(page.locator("time")).toHaveAttribute("datetime", FIXED_NOW);
  expect(
    ledger.analyzerChunks().some((path) => /\/js-ts-[^/]+\.js$/u.test(path)),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Dimension scores" }),
  ).toBeVisible();
  await expect(
    page.locator(".dimension-score__header strong", {
      hasText: "Unavailable",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "src/index.ts, lines 4–7" }).first(),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/blob/${COMMIT_SHA}/src/index.ts#L4-L7`,
  );
  await page
    .getByRole("button", { name: "Copy improvement checklist" })
    .click();
  await expect(page.getByText("Copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    `# RepoScope improvement checklist\n\n- Repository: owner/repo\n- Commit: ${COMMIT_SHA}\n- Ruleset: 1.0.0\n- Confidence: 100% (High confidence)\n- Scope: complete dimensions, not preliminary; 8 selected · 8 fetched · 6 parsed`,
  );
  await expect(page).toHaveURL("http://127.0.0.1:4173/?repo=owner%2Frepo");
  await expectNoSeriousAxeViolations(page);
  await expectResponsiveTargets(page, testInfo);
  await expectKeyboardFocus(page);
  await expectReducedMotion(page);
  await page.setViewportSize({
    width: testInfo.project.name.startsWith("mobile") ? 375 : 1366,
    height: testInfo.project.name.startsWith("mobile") ? 812 : 900,
  });
  await page.screenshot({
    path: testInfo.outputPath("complete-report.png"),
    fullPage: true,
  });
  await runtime.assertClean();
});

test("complete Python report loads only the Python deep analyzer", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, { kind: "python" });
  await gotoLanding(page);
  await submitRepository(page);
  await expectReport(page);
  await expectBoundedRequests(ledger, 8);
  await expect(page.locator(".report-summary__score strong")).toHaveText(
    "66 / 100",
  );
  expect(await dimensionScores(page)).toEqual(PYTHON_SCORES);
  await expect(page.locator("time")).toHaveAttribute("datetime", FIXED_NOW);
  expect(ledger.analyzerChunks().some((path) => /\/python-/u.test(path))).toBe(
    true,
  );
  expect(ledger.analyzerChunks().some((path) => /\/js-ts-/u.test(path))).toBe(
    false,
  );
  await expect(
    page.locator(".dimension-score__header strong", {
      hasText: "Unavailable",
    }),
  ).toHaveCount(0);
  await runtime.assertClean();
});

test("unsupported Go remains a preliminary general-only report", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, { kind: "go" });
  await gotoLanding(page);
  await submitRepository(page);
  await expectReport(page);
  await expectBoundedRequests(ledger, 2);
  await expect(page.getByText("General-only", { exact: true })).toBeVisible();
  await expect(page.getByText("Preliminary", { exact: true })).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(2);
  const confidence = await page
    .locator(".report-summary__metadata > div")
    .first()
    .textContent();
  const confidencePercent = /(?<percent>\d+)%/u.exec(confidence ?? "")?.groups
    ?.percent;
  expect(Number(confidencePercent ?? 101)).toBeLessThanOrEqual(60);
  await runtime.assertClean();
});

test("truncated trees expose partial scope below high confidence", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, { kind: "partial" });
  await gotoLanding(page);
  await submitRepository(page);
  await expectReport(page);
  await expectBoundedRequests(ledger, 8);
  await expect(
    page.getByText("Partial GitHub tree", { exact: true }),
  ).toBeVisible();
  const confidence = await page
    .locator(".report-summary__metadata > div")
    .first()
    .textContent();
  const confidencePercent = /(?<percent>\d+)%/u.exec(confidence ?? "")?.groups
    ?.percent;
  expect(Number(confidencePercent ?? 101)).toBeLessThan(80);
  await expect(page.locator(".report-summary__scope")).toContainText(
    /selected.*fetched.*parsed/u,
  );
  await runtime.assertClean();
});

test("invalid input and not-found errors are specific without speculation", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, {
    kind: "not-found",
  });
  await gotoLanding(page);
  await page
    .getByLabel("Public GitHub repository URL")
    .fill("https://gitlab.com/owner/repo");
  await page.getByRole("button", { name: "Analyze repository" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Enter a public GitHub repository URL",
  );
  await submitRepository(page);
  const error = page
    .getByRole("heading", { name: "Analysis could not be completed" })
    .locator("..");
  await expect(error).toContainText("not found or is not public");
  await expect(error).not.toContainText(/private|deleted/u);
  expect(ledger.restGets()).toHaveLength(1);
  await ledger.assertComplete({ rest: 1, raw: 0 });
  await runtime.assertClean();
});

test("rate limits show a fixed localized reset and safe official link", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, {
    kind: "rate-limit",
  });
  await gotoLanding(page);
  await submitRepository(page);
  const error = page.getByRole("alert");
  await expect(error).toContainText(
    "GitHub's public API rate limit has been reached",
  );
  await expect(error).toContainText(/2026/u);
  await expect(
    error.getByRole("link", { name: "GitHub rate-limit documentation" }),
  ).toHaveAttribute("href", GITHUB_RATE_LIMIT_DOCS);
  await expect(error).toContainText(
    "GitHub rate limit resets at Aug 11, 2026, 01:00:00 PM UTC.",
  );
  expect(ledger.restGets()).toHaveLength(1);
  await ledger.assertComplete({ rest: 1, raw: 0 });
  await runtime.assertClean();
});

test("hostile repository strings stay inert text", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, { kind: "hostile" });
  await gotoLanding(page);
  await submitRepository(page);
  await expectReport(page);
  await expect(
    page.getByText(/<img src="https:\/\/evil\.example\/pixel"/u),
  ).toBeVisible();
  await expect(
    page.locator("script[src*='evil.example'], img[src^='http']"),
  ).toHaveCount(0);
  await expect(
    page.getByText(/<img src=x onerror=alert\(1\)>\.ts/u).first(),
  ).toBeVisible();
  expect(ledger.restGets()).toHaveLength(3);
  await ledger.assertComplete({ rest: 3, raw: 9 });
  await runtime.assertClean();
});

test("cancellation yields to a newer run and failed refresh preserves its report", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, {
    blockFirstRest: true,
    failRestAttempt: 5,
  });
  await gotoLanding(page);
  await submitRepository(page);
  await expect(
    page.getByRole("button", { name: "Cancel analysis" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  ledger.releaseFirstRest();
  await submitRepository(page);
  await expectReport(page);
  await page.getByRole("button", { name: "Refresh public data" }).click();
  await expect(
    page.getByRole("heading", { name: "Analysis could not be completed" }),
  ).toBeVisible();
  await expectReport(page);
  await expect(
    page.getByText(/Refresh failed\. Showing the report from/u),
  ).toBeVisible();
  expect(ledger.restGets()).toHaveLength(5);
  await ledger.assertComplete({ rest: 5, raw: 8 });
  await runtime.assertClean();
});
