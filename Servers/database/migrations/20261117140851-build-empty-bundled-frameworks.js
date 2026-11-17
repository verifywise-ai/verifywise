"use strict";

/**
 * Build the bundled frameworks (ids 5-25: SOC 2, GDPR, HIPAA, ...) that were
 * attached to a use case or organizational project without being set up.
 *
 * Until this release, creating a use case (or approving one) built only the
 * four core frameworks. A bundled framework picked at that moment got its
 * projects_frameworks row and nothing else: its tree listed the controls but
 * none could be edited, and "add framework" refused it as already attached.
 *
 * A link with no level-2 implementation rows was never built: the builder
 * writes one row per level-2 control in a single statement, and nothing in
 * the app deletes those rows on their own. So for exactly those links this
 * writes the rows createFrameworkForProject (utils/frameworkRegistry.utils.ts)
 * writes for a real project: status "Not started", no owner, reviewer,
 * approver or due date, is_demo taken from the project. Each row carries the
 * link's own organization_id.
 *
 * Idempotent: a link that already has level-2 rows is never touched, so a
 * second run writes nothing. Down is a no-op, because the rows may hold user
 * work by the time anyone rolls back.
 */

const { FRAMEWORK_STRUCTURES } = require("../../dist/structures");

async function statusType(sequelize, table, transaction) {
  const [rows] = await sequelize.query(
    `SELECT atttypid::regtype::text AS status_type FROM pg_attribute
      WHERE attrelid = :table::regclass AND attname = 'status' AND NOT attisdropped;`,
    { replacements: { table: `verifywise.${table}` }, transaction },
  );
  if (!rows[0]?.status_type) throw new Error(`verifywise.${table} has no status column`);
  return rows[0].status_type;
}

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    await sequelize.transaction(async (transaction) => {
      for (const { id: frameworkId, key, tables, cols } of FRAMEWORK_STRUCTURES) {
        const [emptyLinks] = await sequelize.query(
          `SELECT pf.id FROM verifywise.projects_frameworks pf
            WHERE pf.framework_id = :frameworkId
              AND NOT EXISTS (
                SELECT 1 FROM verifywise.${tables.l2_impl} l2i
                 WHERE l2i.projects_frameworks_id = pf.id
              );`,
          { replacements: { frameworkId }, transaction },
        );
        const pfIds = emptyLinks.map((row) => row.id);
        if (pfIds.length === 0) continue;

        const l2Status = await statusType(sequelize, tables.l2_impl, transaction);
        await sequelize.query(
          `INSERT INTO verifywise.${tables.l2_impl}
             (organization_id, ${cols.l2_impl_meta}, projects_frameworks_id, status,
              owner, reviewer, approver, due_date, is_demo)
           SELECT pf.organization_id, l2.id, pf.id, 'Not started'::${l2Status},
                  NULL, NULL, NULL, NULL, p.is_demo
             FROM verifywise.projects_frameworks pf
             JOIN verifywise.projects p
               ON p.id = pf.project_id AND p.organization_id = pf.organization_id
             JOIN verifywise.${tables.l1_struct} l1 ON l1.framework_id = :frameworkId
             JOIN verifywise.${tables.l2_struct} l2 ON l2.${cols.l2_struct_parent} = l1.id
            WHERE pf.id IN (:pfIds)
            ORDER BY pf.id, l2.id;`,
          { replacements: { frameworkId, pfIds }, transaction },
        );

        if (tables.l3_impl && tables.l3_struct && cols.l3_impl_meta && cols.l3_impl_parent) {
          const l3Status = await statusType(sequelize, tables.l3_impl, transaction);
          await sequelize.query(
            `INSERT INTO verifywise.${tables.l3_impl}
               (organization_id, ${cols.l3_impl_meta}, ${cols.l3_impl_parent},
                projects_frameworks_id, status, owner, reviewer, approver, due_date, is_demo)
             SELECT l2i.organization_id, l3.id, l2i.id, l2i.projects_frameworks_id,
                    'Not started'::${l3Status}, NULL, NULL, NULL, NULL, l2i.is_demo
               FROM verifywise.${tables.l2_impl} l2i
               JOIN verifywise.${tables.l3_struct} l3
                 ON l3.${cols.l3_struct_parent} = l2i.${cols.l2_impl_meta}
              WHERE l2i.projects_frameworks_id IN (:pfIds)
              ORDER BY l2i.projects_frameworks_id, l3.id;`,
            { replacements: { pfIds }, transaction },
          );
        }

        console.log(`[build-empty-bundled-frameworks] ${key}: built ${pfIds.length} link(s)`);
      }
    });
  },

  async down() {
    // No-op: the rows written by up() may hold user work by now.
  },
};
