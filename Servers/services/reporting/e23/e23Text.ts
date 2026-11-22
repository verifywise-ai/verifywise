/**
 * @fileoverview Fixed text for the OSFI E-23 report and fix-it list.
 *
 * @module services/reporting/e23/e23Text
 */

import type { ReportParameters } from "../../../domain.layer/interfaces/i.reportTemplate";
import { E23_RULES, REVIEW_CADENCE_TEXT, type E23RuleId } from "./contradictionRules";
import { METRIC_STALE_DAYS } from "./mrmFleet";

/**
 * "Closes when" phrase per fix-it item type. Source 1 is keyed by rule id (the
 * negation of the rule's data condition); sources 2 to 7 by source number.
 */
export const FIX_IT_CLOSES_WHEN: Record<E23RuleId | "2" | "3" | "4" | "5" | "6" | "7", string> = {
  C1: "The model inventory holds the organization's models",
  C2: "Every model has an MRM tier",
  C3: "Every tiered model's rating is affirmed within its review cadence and no model awaits revalidation without an open validation",
  C4: "Every model has an owner role",
  C5: "No model's latest validator also holds the developer role on it",
  C6: "No model has an overdue validation",
  C7: "Every signed-off validation report has all six sections completed",
  C8: "Every model has an approver role or an inventory approver",
  C9: "Every approved model's open critical or high finding has a remediation plan",
  C10: "Every tier 1 and tier 2 model has an active threshold",
  C11: `Every model with active thresholds has received a metric in the last ${METRIC_STALE_DAYS} days`,
  C12: "No critical or high finding is open past its due date",
  C13: "No approved model's latest validation outcome is not validated",
  "2": "The requirement has an active owner",
  "3": "The requirement is implemented or audited",
  "4": "The rework is finished and the requirement is implemented or audited",
  "5": "Evidence is attached to the requirement",
  "6": "The requirement is implemented or audited",
  "7": "Every listed gap on the model is resolved",
};

export const E23_REPORT_TITLE = "OSFI E-23 model risk management: completeness report";

export const AUDIENCE_LINES = {
  osfi: "Prepared for OSFI supervisory review",
  board: "Prepared for the Board of directors",
} as const;

export const DRAFT_WATERMARK = "Draft: not for distribution";

export const SIGN_OFF_STATEMENT =
  "This report is a self-assessment prepared from VerifyWise records. It is not an OSFI assessment.";

/** Printed in place of the signature lines while the report is a draft. */
export const SIGN_OFF_DRAFT = "Draft";
export const SIGN_OFF_DRAFT_NOTE =
  "Lines for signature and date are added when the report is generated as the final version.";

/** Field labels of a signatory block on the final sign-off page. */
export const SIGN_OFF_FIELDS = {
  name: "Name",
  title: "Title",
  signature: "Signature",
  date: "Date",
} as const;

/** How the e23Gap analysis states each group's position (spec 8.5). */
export const POSITION_LABELS = {
  consistent: "Data consistent with self-assessment",
  "partly consistent": "Data partly consistent with self-assessment",
  inconsistent: "Data inconsistent with self-assessment",
  "not assessable": "Not assessable from VerifyWise data",
} as const;

export const COVERAGE_LABELS = {
  checked: "Checked against MRM data",
  selfAssessmentOnly: "Self-assessment only",
} as const;

export const NO_CONTRADICTIONS = "No contradictions found by the rules in this report";

export const E23_NOT_ON_FILE =
  "OSFI E-23 is not on file for this organization, so the program completeness and contradiction checks were not run.";

/** The E-23 checklist exists but could not be read, so no rule ran. */
export const E23_CHECKS_NOT_READ =
  "The contradiction checks were not run because the OSFI E-23 checklist could not be read. The section is listed under the sections that could not be completed.";

export const NO_MODELS = "No models in the inventory";

/** A selected section whose data could not be read; the notices block names what failed. */
export const SECTION_NOT_COMPLETED =
  'This section could not be completed. See "Sections that could not be completed" at the end of the report.';

// ---------------------------------------------------------------------------
// The internal fix-it list (spec 8.6): a second file of the run
// ---------------------------------------------------------------------------

export const FIX_IT_TITLE = "OSFI E-23 fix-it list";

/** On the fix-it list's cover and in every page footer. */
export const INTERNAL_MARKING = "Internal: not for external distribution";

export const FIX_IT_HEADING = "Fix-it items";

export const FIX_IT_HEADERS = ["Severity", "What", "Where", "Owner", "Due date", "Closes when"];

export const FIX_IT_SEVERITY_LABELS = { high: "High", medium: "Medium", low: "Low" } as const;

/** Under the due date of an item that is past it. */
export const FIX_IT_OVERDUE = "Overdue";

export const NO_FIX_IT_ITEMS =
  "No fix-it items. Every requirement and model check in this list is clear.";

/** Lead line when part of the list's data could not be read; the failed parts follow. */
export const FIX_IT_NOT_COMPLETED =
  "This list could not be completed. Items that depend on the data below are missing:";

/** Appended to the formal report's base name for the fix-it file. */
export const FIX_IT_FILENAME_SUFFIX = "_fix-it-list";

/** A glance figure whose source could not be measured in this run. */
export const NOT_CHECKED = "Not checked";

export const E23_HEADINGS = {
  scope: "Scope and method",
  limitations: "Limitations",
  glance: "At a glance",
  completeness: "E-23 program completeness",
  mrm: "Model risk management status",
  contradictions: "Where the checklist and the data disagree",
  appendix: "Model inventory appendix",
  signOff: "Sign-off",
} as const;

/** Labels for E-23 section keys in the "sections with no data" block. */
export const E23_NOTICE_LABELS: Record<string, string> = {
  mrmFleet: E23_HEADINGS.mrm,
  e23Contradictions: E23_HEADINGS.contradictions,
  e23FixItList: "Fix-it list",
  mrmInventoryAppendix: E23_HEADINGS.appendix,
};

const RULE_COUNT = E23_RULES.length;

/**
 * The fixed scope and method text (spec 8.3 item 2). The board version keeps
 * the limitations and shortens the method to one paragraph.
 */
export function scopeAndMethod(
  params: ReportParameters,
  opts: { board: boolean; generatedAt: string; periodStart: string; periodEnd: string },
): { paragraphs: string[]; limitations: string[] } {
  const institution = textParam(params.institutionName) || "the institution";
  const scopeNote = textParam(params.scopeNote);
  const period = `Position as at ${opts.generatedAt}. Activity counts cover ${opts.periodStart} to ${opts.periodEnd}.`;
  const scope = scopeNote ? [`Scope note: ${scopeNote}`] : [];
  const limitations = [
    "VerifyWise does not compute model performance metrics; the institution supplies them.",
    "These E-23 Appendix 1 fields are not tracked in VerifyWise: production deployment date, data sources, approved uses and exceptions, dependencies, third-party designation.",
    "Requirement statuses are self-assessed.",
    `"Overdue" and "stale rating" are measured against VerifyWise's standard review intervals (${REVIEW_CADENCE_TEXT}), which may differ from the institution's own policy.`,
  ];

  if (opts.board) {
    return {
      paragraphs: [
        `This report is a self-assessment by ${institution}, prepared from its records in VerifyWise; it is not an OSFI assessment. It compares the self-assessed E-23 checklist with the model risk management records (inventory, tiers, validations, findings and monitoring) through ${RULE_COUNT} fixed rules. ${period} Sections written by AI are labelled as such; every other figure is computed from the records.`,
        ...scope,
      ],
      limitations,
    };
  }

  return {
    paragraphs: [
      `This report is a self-assessment by ${institution}, prepared from its records in VerifyWise. It is not an assessment by OSFI and does not state OSFI's view.`,
      "It draws on two sources. The E-23 checklist holds the status, owner, due date and evidence of each requirement as recorded by the institution's staff, so every status is the institution's own assessment. The model risk management records hold the model inventory, tiers, validations, findings, monitoring thresholds and the metrics the institution supplies; they are read from VerifyWise when the report is generated.",
      ...scope,
      `${period} Every other figure describes the records as they stood when the report was generated.`,
      `Where the checklist marks a requirement implemented or audited, ${RULE_COUNT} fixed rules compare that status with the model risk management records and list each disagreement. A requirement group with at least one rule is marked "${COVERAGE_LABELS.checked}"; the others are marked "${COVERAGE_LABELS.selfAssessmentOnly}".`,
      `Rating reviews and validations are measured against review intervals of ${REVIEW_CADENCE_TEXT}. The check for models flagged for revalidation covers tiered models; untiered models are reported under requirement 2.2.3. A model counts as receiving monitoring data when a metric was received in the ${METRIC_STALE_DAYS} days before generation.`,
      `Sections written by AI are labelled "AI-Generated Analysis" and draw only on the data in this report. Every other figure and table is computed from the records without AI.`,
    ],
    limitations,
  };
}

/** A string parameter, trimmed; "" when absent or not a string. */
export const textParam = (value: string | boolean | undefined): string =>
  typeof value === "string" ? value.trim() : "";
