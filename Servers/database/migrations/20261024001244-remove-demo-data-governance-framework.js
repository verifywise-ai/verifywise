"use strict";

/**
 * Remove the Data Governance framework (id 16) that the demo seed attached,
 * in every organization.
 *
 * The demo seed used to attach it to the demo organization project, which put
 * a "Data Governance" card on the framework dashboard that people did not
 * understand. The seed no longer adds it; this clears it from demo data that
 * was created before.
 *
 * Only the seeded link is removed. A row qualifies when:
 * - it is flagged is_demo on a demo project, and
 * - its practices were created in the same transaction as the project, which
 *   is how the seed creates them (a framework added later through the app,
 *   even to the demo project, has later timestamps), and
 * - nothing was attached to its practices since: no risk links, no files.
 * Anything else is left alone with its practices and evidence.
 *
 * For each removed row, also deletes the project's coverage cache and model
 * links for framework 16; neither has a foreign key to projects_frameworks.
 * Deleting the projects_frameworks row cascades to data_governance_practices
 * (and from there to data_governance_practices__risks, empty here), as when
 * the framework is removed in the app.
 *
 * One statement, so every delete uses the same set of rows. Safe to re-run.
 * Down is a no-op: the removed demo rows are not recorded, apart from the log
 * line below.
 */
module.exports = {
  async up(queryInterface) {
    const [removed] = await queryInterface.sequelize.query(`
      WITH seeded AS (
        SELECT pf.id, pf.project_id, p.organization_id
          FROM verifywise.projects_frameworks pf
          JOIN verifywise.projects p ON p.id = pf.project_id
         WHERE pf.framework_id = 16
           AND pf.is_demo IS TRUE
           AND p.is_demo IS TRUE
           AND EXISTS (
             SELECT 1 FROM verifywise.data_governance_practices dp
              WHERE dp.projects_frameworks_id = pf.id)
           AND NOT EXISTS (
             SELECT 1 FROM verifywise.data_governance_practices dp
              WHERE dp.projects_frameworks_id = pf.id
                AND dp.created_at IS DISTINCT FROM p.created_at)
           AND NOT EXISTS (
             SELECT 1 FROM verifywise.data_governance_practices dp
               JOIN verifywise.data_governance_practices__risks r ON r.practice_id = dp.id
              WHERE dp.projects_frameworks_id = pf.id)
           AND NOT EXISTS (
             SELECT 1 FROM verifywise.data_governance_practices dp
               JOIN verifywise.file_entity_links fel
                 ON fel.entity_id = dp.id
                AND fel.framework_type = 'data_governance'
                AND fel.entity_type = 'practice'
              WHERE dp.projects_frameworks_id = pf.id)
      ),
      coverage AS (
        DELETE FROM verifywise.governance_coverage_cache c
         USING seeded
         WHERE c.framework_id = 16 AND c.project_id = seeded.project_id
      ),
      model_links AS (
        DELETE FROM verifywise.model_inventories_projects_frameworks m
         USING seeded
         WHERE m.framework_id = 16 AND m.project_id = seeded.project_id
      )
      DELETE FROM verifywise.projects_frameworks pf
       USING seeded
       WHERE pf.id = seeded.id
      RETURNING pf.id AS projects_frameworks_id, seeded.organization_id, seeded.project_id;
    `);
    console.log(
      `[20261024001244] removed the seeded Data Governance framework from ${removed.length} demo project(s)` +
        (removed.length ? `: ${JSON.stringify(removed)}` : ""),
    );
  },

  async down() {
    // Nothing to restore; see the header.
  },
};
