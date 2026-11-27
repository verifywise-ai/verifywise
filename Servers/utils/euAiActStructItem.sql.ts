import { EU_AI_ACT_FRAMEWORK_ID } from "./validations/projectValidation.utils";

/**
 * Which framework an EU AI Act struct item belongs to. Controls
 * (controls_struct_eu) and assessment questions (questions_struct_eu) listed in
 * structures/EU-AI-Act-Organization moved to EU AI Act (organization)
 * (moved_to_framework_id = 29); every other one is still in the EU AI Act.
 * Every query that tells them apart uses these, so the rule lives here only.
 */

/**
 * SQL: the item (a table alias) belongs to the framework given as an SQL
 * expression, such as "pf.framework_id" or ":framework_id".
 */
export const structItemInFrameworkSql = (item: string, frameworkId: string) =>
  `COALESCE(${item}.moved_to_framework_id, ${EU_AI_ACT_FRAMEWORK_ID}) = ${frameworkId}`;

/** SQL: the item (a table alias) is still in the EU AI Act. */
export const structItemInEuAiActSql = (item: string) =>
  structItemInFrameworkSql(item, String(EU_AI_ACT_FRAMEWORK_ID));
