/**
 * @fileoverview SQL for the bundled-framework requirements collector.
 *
 * Table and column names come from the trusted FrameworkStructure registry
 * (never from user input); every value is a bound replacement.
 *
 * @module services/reporting/collectors/frameworkRequirements.queries
 */

import type { FrameworkStructure } from "../../../structures/types";

/** L2 requirements with their L1 group, ordered group then requirement. */
export const l2RequirementsSql = ({
  tables,
  cols,
  adoption_levels,
}: FrameworkStructure): string => `
  SELECT i.id AS impl_id, s2.id AS struct_id, s1.id AS group_id,
         s1.title AS group_title, s1.order_no AS group_order,
         s2.title, s2.order_no,
         i.status, i.owner, i.reviewer, i.approver, i.due_date,
         ${adoption_levels ? "i.adoption_level" : "NULL::smallint AS adoption_level"}
    FROM ${tables.l1_struct} s1
    JOIN ${tables.l2_struct} s2 ON s2.${cols.l2_struct_parent} = s1.id
    JOIN ${tables.l2_impl} i ON i.${cols.l2_impl_meta} = s2.id
   WHERE i.organization_id = :organizationId
     AND i.projects_frameworks_id = :pfId
   ORDER BY s1.order_no, s2.order_no, i.id`;

/** L3 requirements; null when the framework has no third level. */
export const l3RequirementsSql = ({ tables, cols }: FrameworkStructure): string | null => {
  if (!tables.l3_struct || !tables.l3_impl || !cols.l3_struct_parent || !cols.l3_impl_meta) {
    return null;
  }
  const parentImpl = cols.l3_impl_parent ? `i.${cols.l3_impl_parent}` : "NULL";
  return `
  SELECT i.id AS impl_id, ${parentImpl} AS parent_impl_id,
         s3.${cols.l3_struct_parent} AS parent_struct_id,
         s3.title, s3.order_no,
         i.status, i.owner, i.reviewer, i.approver, i.due_date
    FROM ${tables.l1_struct} s1
    JOIN ${tables.l2_struct} s2 ON s2.${cols.l2_struct_parent} = s1.id
    JOIN ${tables.l3_struct} s3 ON s3.${cols.l3_struct_parent} = s2.id
    JOIN ${tables.l3_impl} i ON i.${cols.l3_impl_meta} = s3.id
   WHERE i.organization_id = :organizationId
     AND i.projects_frameworks_id = :pfId
   ORDER BY s1.order_no, s2.order_no, s3.order_no, i.id`;
};

export const EVIDENCE_SQL = `
  SELECT DISTINCT fel.entity_type, fel.entity_id, f.id AS file_id, f.filename
    FROM file_entity_links fel
    JOIN files f ON f.id = fel.file_id AND f.organization_id = fel.organization_id
   WHERE fel.organization_id = :organizationId
     AND fel.framework_type = :frameworkType
     AND fel.link_type = 'evidence'
     AND fel.entity_id IN (:implIds)`;

/** Live risks linked per impl row, from a framework's risk link table. */
export const riskCountsSql = (riskTable: string, implCol: string): string => `
  SELECT r.${implCol} AS impl_id, COUNT(*)::int AS count
    FROM ${riskTable} r
    JOIN risks pr ON pr.id = r.projects_risks_id AND pr.is_deleted = false
       AND pr.organization_id = r.organization_id
   WHERE r.organization_id = :organizationId
     AND r.${implCol} IN (:implIds)
   GROUP BY 1`;
