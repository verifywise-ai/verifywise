import type { Page, TestInfo } from "@playwright/test";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import AxeBuilder from "@axe-core/playwright";

/**
 * Rules deferred to follow-up work (e.g. color-contrast needs design-token review).
 * Interactive-component fixes should not disable button-name, label, or select-name.
 */
const DEFERRED_AXE_RULES = [
  "color-contrast",
  "scrollable-region-focusable",
  "aria-progressbar-name",
  "aria-prohibited-attr",
  "aria-valid-attr-value",
];

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

export async function analyzeCriticalAndSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags([...WCAG_TAGS])
    .disableRules(DEFERRED_AXE_RULES)
    .analyze();

  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateA11yHtmlReport(
  violations: Awaited<ReturnType<typeof analyzeCriticalAndSeriousViolations>>,
  pageUrl: string,
): string {
  const rows = violations
    .map((v) => {
      const targets = v.nodes
        .map((n) => `<code>${escapeHtml(n.target.join(" "))}</code>`)
        .join("<br>");
      return `
        <tr>
          <td>${escapeHtml(v.impact ?? "unknown")}</td>
          <td><code>${escapeHtml(v.id)}</code></td>
          <td>${escapeHtml(v.description)}</td>
          <td>${escapeHtml(v.help ?? "")}</td>
          <td>${targets}</td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Accessibility Report — ${escapeHtml(pageUrl)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; }
    h1 { font-size: 1.25rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; font-size: 0.875rem; }
    th { background: #f5f5f5; }
    td:nth-child(5) { max-width: 400px; word-break: break-all; }
  </style>
</head>
<body>
  <h1>Accessibility Violations — Critical &amp; Serious</h1>
  <p>Page: <a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a></p>
  <p>Deferred rules: ${DEFERRED_AXE_RULES.map((r) => `<code>${escapeHtml(r)}</code>`).join(", ")}</p>
  <table>
    <thead>
      <tr><th>Impact</th><th>Rule</th><th>Description</th><th>Help</th><th>Elements</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

/**
 * Run axe-core analysis, attach an HTML report when violations are found,
 * and return the violations array for the caller to assert on.
 *
 * Usage in a spec:
 *   const violations = await runA11yCheck(page, test.info());
 *   expect(violations).toEqual([]);
 */
export async function runA11yCheck(page: Page, testInfo: TestInfo) {
  const violations = await analyzeCriticalAndSeriousViolations(page);

  if (violations.length > 0) {
    const html = generateA11yHtmlReport(violations, page.url());
    await testInfo.attach("accessibility-report", {
      contentType: "text/html",
      body: html,
    });

    const reportDir = join(process.cwd(), "test-results");
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, "accessibility-report.html"), html);
  }

  return violations;
}
