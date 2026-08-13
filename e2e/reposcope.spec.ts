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
const FIXTURE_DESCRIPTION = "A deterministic fixture repository for RepoScope.";
const TYPESCRIPT_PURPOSE =
  "This small application demonstrates deterministic, browser-side inspection of a public repository.";
const PYTHON_PURPOSE =
  "This small command-line tool demonstrates deterministic inspection of a Python repository.";
const GO_PURPOSE =
  "This small Go program demonstrates general-only inspection of a recognized but unsupported language.";
const HOSTILE_DESCRIPTION_PURPOSE =
  "Safe description text stays visible without its destination or image.";
const HOSTILE_README_PURPOSE =
  "Safe README text stays visible without its destination or image.";
const EXPECTED_TYPESCRIPT_MARKDOWN = [
  "# RepoScope improvement checklist",
  "",
  "- Repository: owner/repo",
  `- Commit: ${COMMIT_SHA}`,
  "- Ruleset: 1.0.0",
  "- Confidence: 100% (High confidence)",
  "- Scope: complete dimensions, not preliminary; 8 selected · 8 fetched · 6 parsed",
  "",
  "## Ordered improvements",
  "",
  "1. **High priority** `maintenance.lockfile`",
  "   - Evidence: Recognized dependency lockfile present: No.",
  "   - Action: Commit the standard dependency lockfile when the project ecosystem uses one.",
  "2. **High priority** `maintenance.code-of-conduct`",
  "   - Evidence: Code of conduct present: No.",
  "   - Action: Add a code of conduct for community participation.",
  "3. **High priority** `maintenance.dependency-updates`",
  "   - Evidence: Automated dependency-update configuration present: No.",
  "   - Action: Configure Dependabot or Renovate for routine dependency updates.",
  "4. **High priority** `maintenance.security`",
  "   - Evidence: Security policy present: No.",
  "   - Action: Add a SECURITY policy with a private vulnerability-reporting path.",
  "5. **High priority** `maintenance.templates`",
  "   - Evidence: Issue or pull-request templates present: No.",
  "   - Action: Add issue or pull-request templates that request actionable context.",
  "6. **High priority** `maintenance.version-history`",
  "   - Evidence: Versioned changelog or release-notes file present: No.",
  "   - Action: Record user-visible changes in a versioned history file.",
  "7. **Medium priority** `testing.ci`",
  "   - Evidence: Recognized continuous-integration configuration present: No.",
  "   - Action: Add a CI workflow that runs repository checks automatically.",
  "8. **Medium priority** `documentation.architecture`",
  "   - Evidence: Explicit architecture evidence: No; named source areas: 1.",
  "   - Action: Explain the architecture, code map, or at least three top-level source areas.",
  "9. **Medium priority** `documentation.contributing`",
  "   - Evidence: Contribution guide present: No.",
  "   - Action: Add a CONTRIBUTING guide with a practical contributor path.",
  "10. **Medium priority** `documentation.usage`",
  "   - Evidence: Usage heading: Yes; command or concrete example: No.",
  "   - Action: Add a usage section with a command or concrete example.",
  "11. **Medium priority** `operability.entry-point`",
  "   - Evidence: Structured entry point: No; conventional entry path: Yes.",
  "   - Action: Declare an application, CLI, or library entry point in the manifest.",
  "12. **Medium priority** `operability.example`",
  "   - Evidence: Concrete example: No; prose usage description: Yes.",
  "   - Action: Add a demo, sample, or concrete API usage example.",
  "13. **Medium priority** `testing.test-source-ratio`",
  "   - Evidence: Test files: 1; supported non-test source files: 5.",
  "   - Action: Grow the test-file ratio toward at least one test file per four supported source files.",
  "14. **Medium priority** `operability.configuration`",
  "   - Evidence: Configuration example or section present: No.",
  "   - Action: Document configuration and provide a safe example file where useful.",
  "15. **Medium priority** `testing.coverage`",
  "   - Evidence: Coverage configuration or command present: No.",
  "   - Action: Add coverage-tool configuration or a coverage command.",
  "16. **Low priority** `documentation.license`",
  "   - Evidence: License file: No; API license metadata: Yes.",
  "   - Action: Add a recognized license file that states the project terms.",
  "17. **Low priority** `operability.version-history`",
  "   - Evidence: Versioned history file: No; manifest version only: Yes.",
  "   - Action: Maintain a changelog or release-notes file with version headings.",
  "",
].join("\n");

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

function projectBrief(page: Page, name = "Project brief") {
  return page.getByRole("region", { name });
}

async function expectEnglishBriefStructure(page: Page): Promise<void> {
  const brief = projectBrief(page);

  for (const heading of [
    "What it does",
    "Likely fit",
    "What it is",
    "Before you use it",
  ]) {
    await expect(brief.getByRole("heading", { name: heading })).toBeVisible();
  }
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

function expectAnalyzerChunks(
  ledger: RequestLedger,
  expected: { jsTs: boolean; python: boolean },
): void {
  const chunks = ledger.analyzerChunks();
  const jsTsChunks = chunks.filter((path) => /\/js-ts-[^/]+\.js$/u.test(path));
  const pythonChunks = chunks.filter((path) =>
    /\/python-[^/]+\.js$/u.test(path),
  );
  const unexpectedChunks = chunks.filter(
    (path) =>
      !/\/js-ts-[^/]+\.js$/u.test(path) && !/\/python-[^/]+\.js$/u.test(path),
  );

  expect(jsTsChunks.length > 0, `JS/TS chunks: ${JSON.stringify(chunks)}`).toBe(
    expected.jsTs,
  );
  expect(
    pythonChunks.length > 0,
    `Python chunks: ${JSON.stringify(chunks)}`,
  ).toBe(expected.python);
  expect(unexpectedChunks).toEqual([]);
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
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
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
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
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
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
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
  const chineseBrief = projectBrief(page, "项目速览");
  for (const heading of ["项目用途", "可能适用", "项目类型", "使用前注意"]) {
    await expect(
      chineseBrief.getByRole("heading", { name: heading }),
    ).toBeVisible();
  }
  await expect(
    chineseBrief.getByText(FIXTURE_DESCRIPTION, { exact: true }),
  ).toBeVisible();
  await expect(
    chineseBrief.getByText(TYPESCRIPT_PURPOSE, { exact: true }),
  ).toBeVisible();
  await expect(
    chineseBrief.getByText("应用程序", { exact: true }),
  ).toBeVisible();
  await expect(
    chineseBrief.getByRole("link", { name: "README.md（检查的提交）" }),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/blob/${COMMIT_SHA}/README.md`,
  );
  await expect(page.getByText(COMMIT_SHA, { exact: true })).toBeVisible();
  await expect(page.locator(".report-summary__score strong")).toHaveText(
    "74 / 100",
  );
  const counts = {
    rest: ledger.restGets().length,
    raw: ledger.rawGets().length,
  };
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByText("Dimension scores")).toBeVisible();
  await expectEnglishBriefStructure(page);
  await expect(
    projectBrief(page).getByText(FIXTURE_DESCRIPTION, { exact: true }),
  ).toBeVisible();
  await expect(
    projectBrief(page).getByText(TYPESCRIPT_PURPOSE, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(COMMIT_SHA, { exact: true })).toBeVisible();
  await expect(page.locator(".report-summary__score strong")).toHaveText(
    "74 / 100",
  );
  await expect(
    page.getByRole("heading", { name: "Repository scan in progress" }),
  ).toHaveCount(0);
  expect(ledger.restGets()).toHaveLength(counts.rest);
  expect(ledger.rawGets()).toHaveLength(counts.raw);
  expectAnalyzerChunks(ledger, { jsTs: true, python: false });
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
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
  await submitRepository(page);
  await expectReport(page);
  await expectBoundedRequests(ledger, 8);
  await expectEnglishBriefStructure(page);
  const brief = projectBrief(page);
  await expect(
    brief.getByText(FIXTURE_DESCRIPTION, { exact: true }),
  ).toBeVisible();
  await expect(
    brief.getByText(TYPESCRIPT_PURPOSE, { exact: true }),
  ).toBeVisible();
  await expect(brief.getByText("Application", { exact: true })).toBeVisible();
  await expect(
    brief.getByText(
      "Worth considering if you need a Application for the stated purpose above.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    brief.getByText("No additional cautions are included in this brief.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    brief.getByText("GitHub repository description", { exact: true }),
  ).toBeVisible();
  await expect(
    brief.getByRole("link", { name: "README.md at inspected commit" }),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/blob/${COMMIT_SHA}/README.md`,
  );
  await expect(
    brief.getByRole("link", { name: "package.json at inspected commit" }),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/blob/${COMMIT_SHA}/package.json`,
  );
  await expect(page.locator(".report-summary__score strong")).toHaveText(
    "74 / 100",
  );
  await expect(
    page.locator(".report-summary__metadata > div").first(),
  ).toContainText("100% · High confidence");
  expect(await dimensionScores(page)).toEqual(TYPESCRIPT_SCORES);
  await expect(page.locator("time")).toHaveAttribute("datetime", FIXED_NOW);
  expectAnalyzerChunks(ledger, { jsTs: true, python: false });
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
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(EXPECTED_TYPESCRIPT_MARKDOWN);
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
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
  await submitRepository(page);
  await expectReport(page);
  await expectBoundedRequests(ledger, 8);
  await expectEnglishBriefStructure(page);
  const brief = projectBrief(page);
  await expect(
    brief.getByText(FIXTURE_DESCRIPTION, { exact: true }),
  ).toBeVisible();
  await expect(brief.getByText(PYTHON_PURPOSE, { exact: true })).toBeVisible();
  await expect(
    brief.getByText("Command-line tool", { exact: true }),
  ).toBeVisible();
  await expect(
    brief.getByText(
      "Worth considering if you need a Command-line tool for the stated purpose above.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    brief.getByText("No additional cautions are included in this brief.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    brief.getByRole("link", { name: "README.md at inspected commit" }),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/blob/${COMMIT_SHA}/README.md`,
  );
  await expect(
    brief.getByRole("link", { name: "pyproject.toml at inspected commit" }),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/blob/${COMMIT_SHA}/pyproject.toml`,
  );
  await expect(page.locator(".report-summary__score strong")).toHaveText(
    "66 / 100",
  );
  expect(await dimensionScores(page)).toEqual(PYTHON_SCORES);
  await expect(page.locator("time")).toHaveAttribute("datetime", FIXED_NOW);
  expectAnalyzerChunks(ledger, { jsTs: false, python: true });
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
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
  await submitRepository(page);
  await expectReport(page);
  await expectBoundedRequests(ledger, 2);
  await expectEnglishBriefStructure(page);
  const brief = projectBrief(page);
  await expect(
    brief.getByText(FIXTURE_DESCRIPTION, { exact: true }),
  ).toBeVisible();
  await expect(brief.getByText(GO_PURPOSE, { exact: true })).toBeVisible();
  await expect(
    brief.getByText("Unknown from public evidence.", { exact: true }),
  ).toBeVisible();
  await expect(
    brief.getByText(
      "Compare the stated purpose with your needs; the repository type could not be established reliably.",
      { exact: true },
    ),
  ).toBeVisible();
  const entryPointCaution = brief.getByRole("listitem").filter({
    hasText: "No structured or conventional entry point was detected.",
  });
  await expect(entryPointCaution).toContainText(
    "Repository inspection evidence",
  );
  await expect(
    brief.getByRole("link", { name: "README.md at inspected commit" }),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/blob/${COMMIT_SHA}/README.md`,
  );
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
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
  await runtime.assertClean();
});

test("minimal evidence completes with an honest project-brief fallback", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, { kind: "minimal" });
  await gotoLanding(page);
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
  await submitRepository(page);
  await expectReport(page);
  await expectBoundedRequests(ledger, 1);
  await expectEnglishBriefStructure(page);

  const brief = projectBrief(page);
  await expect(
    brief.getByText(
      "Public repository evidence is insufficient to explain this project reliably.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    brief.getByText("Public evidence is insufficient to judge fit.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    brief.getByText("Unknown from public evidence.", { exact: true }),
  ).toBeVisible();
  await expect(
    brief.getByText(
      "The public description and README do not explain the project clearly enough.",
      { exact: true },
    ),
  ).toBeVisible();
  const explanationCaution = brief.getByRole("listitem").filter({
    hasText:
      "The public description and README do not explain the project clearly enough.",
  });
  await expect(explanationCaution).toContainText(
    "Repository inspection evidence",
  );
  await expect(
    brief.getByText("No structured or conventional entry point was detected.", {
      exact: true,
    }),
  ).toBeVisible();
  const entryPointCaution = brief.getByRole("listitem").filter({
    hasText: "No structured or conventional entry point was detected.",
  });
  await expect(entryPointCaution).toContainText(
    "Repository inspection evidence",
  );
  await expect(
    brief.getByRole("link", { name: /README.*inspected commit/u }),
  ).toHaveCount(0);
  await expect(
    brief.getByText("GitHub repository description", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("General-only", { exact: true })).toBeVisible();
  await expect(page.getByText("Preliminary", { exact: true })).toBeVisible();
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
  await runtime.assertClean();
});

test("truncated trees expose partial scope below high confidence", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, { kind: "partial" });
  await gotoLanding(page);
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
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
  expectAnalyzerChunks(ledger, { jsTs: true, python: false });
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
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
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
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
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
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
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
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
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
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
  await submitRepository(page);
  await expectReport(page);
  await expectEnglishBriefStructure(page);
  const brief = projectBrief(page);
  await expect(
    brief.getByText(HOSTILE_DESCRIPTION_PURPOSE, { exact: true }),
  ).toBeVisible();
  await expect(
    brief.getByText(HOSTILE_README_PURPOSE, { exact: true }),
  ).toBeVisible();
  await expect(brief).not.toContainText(/evil\.example|onerror|<script/iu);
  await expect(
    page.locator("script[src*='evil.example'], img[src^='http']"),
  ).toHaveCount(0);
  await expect(page.locator("[onerror]")).toHaveCount(0);
  await expect(
    brief.getByRole("link", { name: "README.md at inspected commit" }),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/blob/${COMMIT_SHA}/README.md`,
  );
  await expect(brief.getByText("Application", { exact: true })).toBeVisible();
  await expect(
    brief.getByRole("link", { name: "package.json at inspected commit" }),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/blob/${COMMIT_SHA}/package.json`,
  );
  await expect(
    brief.getByText("No additional cautions are included in this brief.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(ledger.restGets()).toHaveLength(3);
  expectAnalyzerChunks(ledger, { jsTs: true, python: false });
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
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
  await submitRepository(page);
  await expect(
    page.getByRole("button", { name: "Cancel analysis" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
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
  expectAnalyzerChunks(ledger, { jsTs: true, python: false });
  await ledger.assertComplete({ rest: 5, raw: 8 });
  await runtime.assertClean();
});
