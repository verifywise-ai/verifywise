/**
 * Phase 2 — Custom Rules Loader
 *
 * Loads tenant-specific rules from the ai_approval_rules table
 * and merges them with default rules.
 */

import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { defaultRules, type RuleDefinition } from "./defaultRules";
import { logStructured } from "../../../utils/logger/fileLogger";

const fileName = "customRules.ts";

interface DbRule {
  id: number;
  organization_id: number;
  name: string;
  description: string;
  conditions: Record<string, unknown>;
  event_type: string;
  event_params: Record<string, unknown>;
  priority: number;
  is_active: boolean;
  is_default: boolean;
}

/**
 * Load custom rules for a tenant from the database.
 */
async function loadCustomRules(organizationId: number): Promise<RuleDefinition[]> {
  try {
    const rows = (await sequelize.query(
      `SELECT * FROM ai_approval_rules
       WHERE organization_id = :organizationId AND is_active = true
       ORDER BY priority DESC`,
      { replacements: { organizationId }, type: QueryTypes.SELECT },
    )) as DbRule[];

    return rows.map((row) => ({
      name: row.name,
      description: row.description || "",
      priority: row.priority,
      conditions: typeof row.conditions === "string" ? JSON.parse(row.conditions) : row.conditions,
      eventType: row.event_type as RuleDefinition["eventType"],
      eventParams:
        typeof row.event_params === "string" ? JSON.parse(row.event_params) : row.event_params,
    }));
  } catch (error) {
    logStructured("error", `failed to load custom rules: ${error}`, "loadCustomRules", fileName);
    return [];
  }
}

/**
 * Get merged rules for a tenant: custom rules + default rules,
 * sorted by priority (highest first). Custom rules with the same
 * name as a default rule override it.
 */
export async function getMergedRules(organizationId: number): Promise<RuleDefinition[]> {
  const custom = await loadCustomRules(organizationId);

  // Build a set of custom rule names for override detection
  const customNames = new Set(custom.map((r) => r.name));

  // Start with custom rules, then add defaults that aren't overridden
  const merged = [...custom, ...defaultRules.filter((d) => !customNames.has(d.name))];

  // Sort by priority descending (highest first = evaluated first)
  merged.sort((a, b) => b.priority - a.priority);

  return merged;
}

/**
 * Validate rule conditions structure.
 * Returns null if valid, error message if invalid.
 */
export function validateRuleConditions(conditions: Record<string, unknown>): string | null {
  if (!conditions || typeof conditions !== "object") {
    return "Conditions must be a non-empty object";
  }

  const hasAll = "all" in conditions;
  const hasAny = "any" in conditions;

  if (!hasAll && !hasAny) {
    return "Conditions must have an 'all' or 'any' key";
  }

  const conditionArray = (hasAll ? conditions.all : conditions.any) as unknown[];
  if (!Array.isArray(conditionArray) || conditionArray.length === 0) {
    return "Conditions array must be non-empty";
  }

  const validFacts = [
    "operation_type",
    "entity_type",
    "entity_count",
    "risk_level",
    "tool_category",
    "user_role",
    "is_bulk",
    "affected_fields",
    "tool_name",
  ];

  const validOperators = [
    "equal",
    "notEqual",
    "greaterThan",
    "greaterThanInclusive",
    "lessThan",
    "lessThanInclusive",
    "in",
    "notIn",
    "contains",
  ];

  for (const cond of conditionArray) {
    const c = cond as Record<string, unknown>;
    if (!c.fact || !c.operator) {
      return "Each condition must have 'fact' and 'operator' fields";
    }
    if (!validFacts.includes(c.fact as string)) {
      return `Invalid fact: '${c.fact}'. Valid facts: ${validFacts.join(", ")}`;
    }
    if (!validOperators.includes(c.operator as string)) {
      return `Invalid operator: '${c.operator}'. Valid operators: ${validOperators.join(", ")}`;
    }
    if (!("value" in c)) {
      return "Each condition must have a 'value' field";
    }
  }

  return null;
}
