/**
 * Single source of truth for translating a (framework_type, entity_type)
 * tuple from `file_entity_links` into the File Manager "Source" group label.
 *
 * Must stay in sync with the labels the upload paths write into `files.source`
 * (see controllers/iso27001, iso42001, eu, nist_ai_rmf). Any new
 * framework/entity combo needs a row here.
 *
 * The fragment is a bare SQL CASE expression that resolves to TEXT or NULL.
 * Inject it into a query that has `fel` aliased to `file_entity_links`.
 */
export const FILE_GROUP_LABEL_CASE_SQL = `
      CASE
        WHEN fel.framework_type = 'eu_ai_act'   AND fel.entity_type = 'assessment'     THEN 'Assessment tracker group'
        WHEN fel.framework_type = 'eu_ai_act'   AND fel.entity_type = 'subcontrol'     THEN 'Compliance tracker group'
        WHEN fel.framework_type = 'eu_ai_act'   AND fel.entity_type = 'control'        THEN 'Reference controls group'
        WHEN fel.framework_type = 'iso_42001'   AND fel.entity_type = 'subclause'      THEN 'Management system clauses group'
        WHEN fel.framework_type = 'iso_42001'   AND fel.entity_type = 'annex_category' THEN 'Reference controls group'
        WHEN fel.framework_type = 'iso_27001'   AND fel.entity_type = 'subclause'      THEN 'Main clauses group'
        WHEN fel.framework_type = 'iso_27001'   AND fel.entity_type = 'annex_control'  THEN 'Annex controls group'
        WHEN fel.framework_type = 'nist_ai_rmf' AND fel.entity_type = 'subcategory'    THEN 'Main clauses group'
        ELSE NULL
      END`;
