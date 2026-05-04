"use strict";

/**
 * Reduces the `type_of_high_risk_role` enum on `projects` to two values:
 * `Provider` and `Deployer`. Existing rows are remapped:
 *
 *   Provider, Product manufacturer, Authorized representative,
 *   Importer, Distributor                  → Provider
 *   Deployer, not_applicable               → Deployer
 *
 * Postgres enums can't have values dropped in place, so we:
 *   1) cast the column to text,
 *   2) UPDATE values that need remapping,
 *   3) drop the old enum type,
 *   4) create the new 2-value enum,
 *   5) cast the column back.
 */
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // 0) Null out dangling `approval_workflow_id` values whose parent
      // row no longer exists in `approval_workflows`. The FK declares
      // ON DELETE SET NULL, so under normal operation these would
      // already be NULL — but some environments carry orphans created
      // by a historical path that bypassed the cascade (ad-hoc SQL with
      // triggers disabled, partial data restore, or an older migration
      // that dropped+re-added the FK). Step 1 below performs an
      // ENUM→TEXT column type change which forces a full heap rewrite,
      // and under that rewrite Postgres re-fires FK triggers against
      // every row — surfacing the orphan as "Key (approval_workflow_id)
      // =(N) is not present in table approval_workflows". Nulling first
      // completes what the SET NULL cascade was supposed to do at the
      // moment the parent was removed.
      await queryInterface.sequelize.query(
        `UPDATE verifywise.projects p
           SET approval_workflow_id = NULL
         WHERE approval_workflow_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM verifywise.approval_workflows aw
             WHERE aw.id = p.approval_workflow_id
           );`,
        { transaction: t },
      );

      // Same defensive cleanup for `files`, which has the twin FK
      // (fk_files_approval_workflow) with identical ON DELETE SET NULL
      // semantics. If the original orphan-creating event also touched
      // file references, the same migration should repair both.
      await queryInterface.sequelize.query(
        `UPDATE verifywise.files f
           SET approval_workflow_id = NULL
         WHERE approval_workflow_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM verifywise.approval_workflows aw
             WHERE aw.id = f.approval_workflow_id
           );`,
        { transaction: t },
      );

      // 1) Drop the column's enum binding so we can rewrite values freely.
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects
           ALTER COLUMN type_of_high_risk_role TYPE TEXT
           USING type_of_high_risk_role::text;`,
        { transaction: t },
      );

      // 2) Remap to-be-removed values onto the surviving two.
      await queryInterface.sequelize.query(
        `UPDATE verifywise.projects
           SET type_of_high_risk_role = CASE type_of_high_risk_role
             WHEN 'Provider' THEN 'Provider'
             WHEN 'Product manufacturer' THEN 'Provider'
             WHEN 'Authorized representative' THEN 'Provider'
             WHEN 'Importer' THEN 'Provider'
             WHEN 'Distributor' THEN 'Provider'
             WHEN 'Deployer' THEN 'Deployer'
             WHEN 'not_applicable' THEN 'Deployer'
             ELSE type_of_high_risk_role
           END
         WHERE type_of_high_risk_role IS NOT NULL;`,
        { transaction: t },
      );

      // 3) Drop the old enum type. Safe now because no column references it.
      await queryInterface.sequelize.query(
        `DROP TYPE IF EXISTS verifywise.enum_projects_type_of_high_risk_role;`,
        { transaction: t },
      );

      // 4) Recreate the enum with only the two surviving values.
      await queryInterface.sequelize.query(
        `CREATE TYPE verifywise.enum_projects_type_of_high_risk_role
         AS ENUM ('Deployer', 'Provider');`,
        { transaction: t },
      );

      // 5) Restore the column type to the new enum.
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects
           ALTER COLUMN type_of_high_risk_role TYPE
             verifywise.enum_projects_type_of_high_risk_role
           USING type_of_high_risk_role::verifywise.enum_projects_type_of_high_risk_role;`,
        { transaction: t },
      );

      await t.commit();
      console.log(
        "[reduce-high-risk-role] enum collapsed to Provider/Deployer; existing rows remapped",
      );
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    // Restore the original 7-value enum. Existing rows stay as Provider/Deployer
    // — the original wider categorisation can't be reconstructed from the
    // collapsed values, so this is a one-way data migration in practice.
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects
           ALTER COLUMN type_of_high_risk_role TYPE TEXT
           USING type_of_high_risk_role::text;`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `DROP TYPE IF EXISTS verifywise.enum_projects_type_of_high_risk_role;`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `CREATE TYPE verifywise.enum_projects_type_of_high_risk_role AS ENUM (
           'Deployer',
           'Provider',
           'Distributor',
           'Importer',
           'Product manufacturer',
           'Authorized representative',
           'not_applicable'
         );`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.projects
           ALTER COLUMN type_of_high_risk_role TYPE
             verifywise.enum_projects_type_of_high_risk_role
           USING type_of_high_risk_role::verifywise.enum_projects_type_of_high_risk_role;`,
        { transaction: t },
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
