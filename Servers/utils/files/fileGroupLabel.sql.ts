/**
 * Single source of truth for translating a (framework_type, entity_type)
 * tuple from `file_entity_links` into the File Manager "Source" group label.
 *
 * Must stay in sync with the labels the upload paths write into `files.source`
 * (see controllers/iso27001, iso42001, eu, nist_ai_rmf, frameworkImpl).
 *
 * The fragment is a bare SQL CASE expression that resolves to TEXT or NULL.
 * Inject it into a query that has `fel` aliased to `file_entity_links`.
 *
 * Built-in framework branches (EU AI Act / ISO 42001 / ISO 27001 / NIST AI
 * RMF) are hardcoded because their upload paths write those exact strings.
 * Generic framework branches are generated at import time from
 * `FRAMEWORK_STRUCTURES` so adding a new framework only requires updating
 * its structure file.
 */
import { FRAMEWORK_STRUCTURES } from "../../structures";

const BUILTIN_BRANCHES = `
        WHEN fel.framework_type = 'eu_ai_act'   AND fel.entity_type = 'assessment'     THEN 'Assessment tracker group'
        WHEN fel.framework_type = 'eu_ai_act'   AND fel.entity_type = 'subcontrol'     THEN 'Compliance tracker group'
        WHEN fel.framework_type = 'eu_ai_act'   AND fel.entity_type = 'control'        THEN 'Reference controls group'
        WHEN fel.framework_type = 'iso_42001'   AND fel.entity_type = 'subclause'      THEN 'Management system clauses group'
        WHEN fel.framework_type = 'iso_42001'   AND fel.entity_type = 'annex_category' THEN 'Reference controls group'
        WHEN fel.framework_type = 'iso_27001'   AND fel.entity_type = 'subclause'      THEN 'Main clauses group'
        WHEN fel.framework_type = 'iso_27001'   AND fel.entity_type = 'annex_control'  THEN 'Annex controls group'
        WHEN fel.framework_type = 'nist_ai_rmf' AND fel.entity_type = 'subcategory'    THEN 'Main clauses group'`;

function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function buildGenericBranches(): string {
  const lines: string[] = [];
  for (const fw of FRAMEWORK_STRUCTURES) {
    for (const [entityType, label] of Object.entries(fw.source_labels)) {
      lines.push(
        `        WHEN fel.framework_type = '${sqlEscape(fw.framework_type)}' AND fel.entity_type = '${sqlEscape(entityType)}' THEN '${sqlEscape(label)}'`,
      );
    }
  }
  return lines.join("\n");
}

export const FILE_GROUP_LABEL_CASE_SQL = `
      CASE${BUILTIN_BRANCHES}
${buildGenericBranches()}
        ELSE NULL
      END`;
