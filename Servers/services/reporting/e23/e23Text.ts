/**
 * @fileoverview Fixed text for the OSFI E-23 report and fix-it list.
 *
 * @module services/reporting/e23/e23Text
 */

import type { E23RuleId } from "./contradictionRules";
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
