/**
 * @fileoverview AI Detection Suppression Matcher
 *
 * Pure function that flags `ICreateFindingInput`s matching active suppression
 * rules. Stamps `suppressed=true` and `suppression_rule_id` on the input.
 * Findings are not dropped — preserving the row keeps an audit trail.
 *
 * @module services/aiDetection/suppressionMatcher
 */

import logger from "../../utils/logger/fileLogger";
import {
  ICreateFindingInput,
  ISuppression,
  SuppressionField,
} from "../../domain.layer/interfaces/i.aiDetection";

function getFieldValue(finding: ICreateFindingInput, field: SuppressionField): string | undefined {
  switch (field) {
    case "name":
      return finding.name;
    case "finding_type":
      return finding.finding_type;
    case "category":
      return finding.category;
    case "provider":
      return finding.provider;
  }
}

function ruleMatches(rule: ISuppression, finding: ICreateFindingInput): boolean {
  const value = getFieldValue(finding, rule.field);
  if (value === undefined || value === null) return false;

  if (rule.match_type === "exact") {
    return value === rule.value;
  }

  // pattern
  try {
    return new RegExp(rule.value).test(value);
  } catch (err) {
    logger.warn(
      `[suppressionMatcher] Skipping rule ${rule.id} with invalid regex "${rule.value}": ${(err as Error).message}`,
    );
    return false;
  }
}

/**
 * Stamp `suppressed=true` and `suppression_rule_id` on findings that match any
 * active rule. Returns the same array (mutated in place) for call-site clarity.
 *
 * The first matching rule wins.
 */
export function applySuppressions(
  findings: ICreateFindingInput[],
  rules: ISuppression[],
): ICreateFindingInput[] {
  if (findings.length === 0 || rules.length === 0) return findings;

  for (const finding of findings) {
    for (const rule of rules) {
      if (ruleMatches(rule, finding)) {
        finding.suppressed = true;
        finding.suppression_rule_id = rule.id ?? null;
        break;
      }
    }
  }

  return findings;
}
