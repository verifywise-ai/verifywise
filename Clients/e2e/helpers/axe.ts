import type { Page } from "@playwright/test";
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
