import { test, expect, Page } from "@playwright/test";

/**
 * Real-browser verification of the two read-only reports on /risk-inheritance:
 * duplicate candidates (F7) and control coverage (F8).
 *
 * These assert what jsdom cannot: that the chips pick up a real variant colour
 * from the theme, that the similarity bar is drawn to the score, that the
 * wrapping columns wrap instead of pushing the page sideways, and that the
 * summary tiles reflow on a phone.
 *
 * Figures are not hardcoded — each one is read from the same API response the
 * page renders, so the spec keeps working as the seeded data changes.
 */

const CHIP_DEFAULT_BG = "rgb(243, 244, 246)"; // background.hover — the "no variant matched" fill
const CHIP_DEFAULT_TEXT = "rgb(107, 114, 128)"; // status.default.text

interface DuplicateReport {
  scanned: number;
  compared: number;
  candidates: {
    risk_a: { risk_name: string };
    risk_b: { risk_name: string };
    similarity: number;
    shared_tokens: string[];
    also_shares: string[];
  }[];
}

interface CoverageReport {
  summary: { total_active_risks: number; covered: number; gap: number; no_framework: number };
  gaps: {
    id: number;
    risk_name: string;
    risk_level: string | null;
    projects: { name: string; has_framework: boolean }[];
  }[];
  no_framework: { id: number }[];
}

async function openReports(page: Page) {
  const duplicates = page.waitForResponse((r) => r.url().includes("/riskLinks/duplicates"));
  const coverage = page.waitForResponse((r) => r.url().includes("/riskLinks/coverage"));

  await page.goto("/risk-inheritance");

  const duplicatesResponse = await duplicates;
  const coverageResponse = await coverage;
  expect(duplicatesResponse.status()).toBe(200);
  expect(coverageResponse.status()).toBe(200);

  // Exact: the sections' empty states and hints mention both phrases too.
  await page.getByText("Duplicate candidates", { exact: true }).click();
  await page.getByText("Control coverage", { exact: true }).click();

  return {
    duplicates: (await duplicatesResponse.json()).data as DuplicateReport,
    coverage: (await coverageResponse.json()).data as CoverageReport,
  };
}

/**
 * Rows of the coverage section only. A gap risk that is also half of a
 * duplicate pair has its name in the duplicate table too, which comes first.
 */
function coverageRows(page: Page) {
  return page
    .locator(".MuiAccordion-root")
    .filter({ has: page.getByText("Control coverage", { exact: true }) })
    .getByRole("row");
}

test("the duplicate report renders the real scan, score and evidence", async ({ page }) => {
  const { duplicates } = await openReports(page);
  test.skip(duplicates.candidates.length === 0, "No duplicate candidates in the seeded data");

  await expect(
    page.getByText(
      `${duplicates.scanned.toLocaleString()} risks scanned, ${duplicates.compared.toLocaleString()} pairs compared`,
      { exact: false },
    ),
  ).toBeVisible();

  const candidate = duplicates.candidates[0];
  const row = page.getByRole("row").filter({ hasText: candidate.risk_a.risk_name }).first();
  await expect(row).toContainText(candidate.risk_b.risk_name);

  // Owner ids are resolved to a name — a bare id would be unreadable, and
  // "undefined undefined" is the failure this guards.
  await expect(row).not.toContainText("undefined");
  await expect(row).not.toContainText("[object Object]");

  const percent = Math.round(candidate.similarity * 100);
  await expect(row).toContainText(`${percent}%`);

  // The bar is drawn to the score, not to the 0-1 ratio. A ratio would make a
  // 47% bar 0.47% wide, which no assertion on the text would ever catch.
  // The cell holds Box(row) > Box(track) > Box(fill), in that document order.
  const similarityCell = row.getByRole("cell").nth(2);
  const trackBox = await similarityCell.locator("div").nth(1).boundingBox();
  const fillBox = await similarityCell.locator("div").nth(2).boundingBox();
  expect(trackBox).not.toBeNull();
  expect(fillBox).not.toBeNull();
  expect(trackBox!.width).toBeGreaterThan(0);
  const drawn = (fillBox!.width / trackBox!.width) * 100;
  expect(Math.abs(drawn - percent)).toBeLessThan(2);

  // Long token lists are capped and counted rather than run off the page.
  if (candidate.shared_tokens.length > 6) {
    await expect(row).toContainText(`+${candidate.shared_tokens.length - 6} more`);
  }
  for (const shared of candidate.also_shares) {
    await expect(row).toContainText(shared);
  }
});

test("the coverage report separates gaps from unmappable risks and counts them honestly", async ({
  page,
}) => {
  const { coverage } = await openReports(page);
  const { summary } = coverage;

  for (const [label, value] of [
    ["Active risks", summary.total_active_risks],
    ["Covered by a control", summary.covered],
    ["Coverage gaps", summary.gap],
    ["No framework yet", summary.no_framework],
  ] as const) {
    const tile = page
      .locator("div")
      .filter({ hasText: new RegExp(`^${label}${value}$`) })
      .last();
    await expect(tile).toBeVisible();
  }

  if (summary.gap > 0) {
    await expect(page.getByText(`Coverage gaps (${summary.gap.toLocaleString()})`)).toBeVisible();
    await expect(page.getByText(/Assessment links are shown for context/)).toBeVisible();
  }
  if (summary.no_framework > 0) {
    await expect(
      page.getByText(`No framework yet (${summary.no_framework.toLocaleString()})`),
    ).toBeVisible();
    await expect(page.getByText(/Not a finding/)).toBeVisible();
  }

  // A risk sitting in both a framework project and a bare one must say which
  // is which — that difference is the reason it is a finding at all.
  const mixed = coverage.gaps.find(
    (g) => g.projects.some((p) => p.has_framework) && g.projects.some((p) => !p.has_framework),
  );
  if (mixed) {
    const row = coverageRows(page).filter({ hasText: mixed.risk_name }).first();
    const bare = mixed.projects.find((p) => !p.has_framework)!;
    await expect(row).toContainText(`${bare.name} (no framework)`);
  }
});

test("risk level chips pick up a real variant colour instead of falling through to grey", async ({
  page,
}) => {
  const { coverage } = await openReports(page);
  const levelled = coverage.gaps.find((g) => g.risk_level);
  test.skip(!levelled, "No gap row carries a risk level");

  const row = coverageRows(page).filter({ hasText: levelled!.risk_name }).first();
  const chip = row.getByText(levelled!.risk_level!, { exact: true }).first();
  await expect(chip).toBeVisible();

  const painted = await chip.evaluate((el) => {
    const style = getComputedStyle(el);
    return { image: style.backgroundImage, color: style.color };
  });

  // Chip paints a linear-gradient, so backgroundColor is transparent by design.
  expect(painted.image).toContain("gradient");
  // An unmatched label falls through to the "default" variant, whose grey
  // would leave the level column carrying no signal at all.
  expect(painted.image).not.toContain(CHIP_DEFAULT_BG);
  expect(painted.color).not.toBe(CHIP_DEFAULT_TEXT);
});

test("the reports narrow without ever pushing the page sideways", async ({ page }) => {
  await openReports(page);

  const coverageSection = page
    .locator(".MuiAccordion-root")
    .filter({ hasText: "Control coverage" });
  const duplicatesSection = page.locator(".MuiAccordion-root").filter({
    hasText: "Duplicate candidates",
  });

  const measure = async () =>
    page.evaluate(() => {
      const sections = [...document.querySelectorAll(".MuiAccordion-root")].filter((el) =>
        /Duplicate candidates|Control coverage/.test(el.textContent || ""),
      );
      const grid = [...sections.flatMap((s) => [...s.querySelectorAll("div")])].find(
        (el) =>
          getComputedStyle(el).display === "grid" &&
          (el.textContent || "").includes("Active risks"),
      );
      return {
        // A TableContainer scrolling on its own is the intended behaviour for a
        // wide table; the section and the page bleeding is not.
        sectionBleed: Math.max(...sections.map((el) => el.scrollWidth - el.clientWidth)),
        docBleed: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tileColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : -1,
      };
    });

  const wide = await measure();
  expect(wide.sectionBleed).toBeLessThanOrEqual(1);
  expect(wide.docBleed).toBeLessThanOrEqual(1);
  expect(wide.tileColumns).toBeGreaterThan(1);

  await duplicatesSection.screenshot({ path: "e2e/.artifacts/duplicates-desktop.png" });
  await coverageSection.screenshot({ path: "e2e/.artifacts/coverage-desktop.png" });

  // Narrowed to a small laptop. Not a phone: the app's own shell keeps a
  // fixed-width sidebar at every width, so below roughly 600px the content
  // column is a sliver on every page in the product, not just this one. That
  // is pre-existing and outside these sections.
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.waitForTimeout(400); // let the tile grid reflow settle

  const narrow = await measure();
  expect(narrow.sectionBleed).toBeLessThanOrEqual(1);
  expect(narrow.docBleed).toBeLessThanOrEqual(1);
  // The tiles reflow to fewer columns rather than squeezing four into the width.
  expect(narrow.tileColumns).toBeLessThan(wide.tileColumns);

  await coverageSection.screenshot({ path: "e2e/.artifacts/coverage-narrow.png" });
});
