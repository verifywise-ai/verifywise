"use strict";

/**
 * Step 2 — Impl + risks tables for the new frameworks.
 *
 * For every framework:
 *   - impl table(s) that hold per-org, per-project rows (status, owner,
 *     reviewer, approver, due date, implementation description, auditor
 *     feedback). Shape mirrors subclauses_iso / subcontrols_eu etc.
 *   - <impl>__risks junction table that links impl rows to risks. Shape
 *     mirrors subcontrols_eu__risks (FK CASCADE on both sides).
 *   - Per-table typed status enum, values identical to
 *     enum_subclauses_iso_status.
 */

const { FRAMEWORK_STRUCTURES } = require("../../dist/structures");

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();

    try {
      console.log(
        `[fw:migrate-impl] creating impl tables for ${FRAMEWORK_STRUCTURES.length} frameworks`,
      );
      for (const fw of FRAMEWORK_STRUCTURES) {
        const { tables, cols } = fw;
        const isThreeLevel = !!tables.l3_struct;
        console.log(
          `[fw:migrate-impl] ${fw.key}: ${tables.l2_impl}${isThreeLevel ? " + " + tables.l3_impl : ""}`,
        );

        // ---- L2 impl status enum + table ----
        const l2Enum = `enum_${tables.l2_impl}_status`;
        await sequelize.query(
          `DO $$ BEGIN
             CREATE TYPE verifywise.${l2Enum} AS ENUM (
               'Not started', 'Draft', 'In progress', 'Awaiting review',
               'Awaiting approval', 'Implemented', 'Audited', 'Needs rework'
             );
           EXCEPTION WHEN duplicate_object THEN NULL;
           END $$;`,
          { transaction },
        );
        await sequelize.query(
          `CREATE TABLE verifywise.${tables.l2_impl} (
             id SERIAL PRIMARY KEY,
             organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
             implementation_description TEXT,
             status verifywise.${l2Enum} DEFAULT 'Not started',
             owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
             reviewer INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
             approver INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
             due_date DATE,
             auditor_feedback TEXT,
             ${cols.l2_impl_meta} INTEGER REFERENCES verifywise.${tables.l2_struct}(id) ON DELETE CASCADE,
             projects_frameworks_id INTEGER REFERENCES verifywise.projects_frameworks(id) ON DELETE CASCADE,
             created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
             is_demo BOOLEAN DEFAULT FALSE
           );`,
          { transaction },
        );
        await sequelize.query(
          `CREATE INDEX idx_${tables.l2_impl}_org
             ON verifywise.${tables.l2_impl}(organization_id);`,
          { transaction },
        );
        await sequelize.query(
          `CREATE INDEX idx_${tables.l2_impl}_pf
             ON verifywise.${tables.l2_impl}(projects_frameworks_id);`,
          { transaction },
        );

        // ---- L2 risks junction ----
        await sequelize.query(
          `CREATE TABLE verifywise.${tables.l2_risks} (
             organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
             ${cols.l2_risks_impl} INTEGER REFERENCES verifywise.${tables.l2_impl}(id) ON DELETE CASCADE,
             projects_risks_id INTEGER REFERENCES verifywise.risks(id) ON DELETE CASCADE,
             PRIMARY KEY (${cols.l2_risks_impl}, projects_risks_id)
           );`,
          { transaction },
        );

        // ---- L3 impl status enum + table + risks (three-level only) ----
        if (isThreeLevel) {
          const l3Enum = `enum_${tables.l3_impl}_status`;
          await sequelize.query(
            `DO $$ BEGIN
               CREATE TYPE verifywise.${l3Enum} AS ENUM (
                 'Not started', 'Draft', 'In progress', 'Awaiting review',
                 'Awaiting approval', 'Implemented', 'Audited', 'Needs rework'
               );
             EXCEPTION WHEN duplicate_object THEN NULL;
             END $$;`,
            { transaction },
          );
          await sequelize.query(
            `CREATE TABLE verifywise.${tables.l3_impl} (
               id SERIAL PRIMARY KEY,
               organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
               implementation_description TEXT,
               status verifywise.${l3Enum} DEFAULT 'Not started',
               owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
               reviewer INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
               approver INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
               due_date DATE,
               auditor_feedback TEXT,
               ${cols.l3_impl_meta} INTEGER REFERENCES verifywise.${tables.l3_struct}(id) ON DELETE CASCADE,
               ${cols.l3_impl_parent} INTEGER REFERENCES verifywise.${tables.l2_impl}(id) ON DELETE CASCADE,
               projects_frameworks_id INTEGER REFERENCES verifywise.projects_frameworks(id) ON DELETE CASCADE,
               created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
               is_demo BOOLEAN DEFAULT FALSE
             );`,
            { transaction },
          );
          await sequelize.query(
            `CREATE INDEX idx_${tables.l3_impl}_org
               ON verifywise.${tables.l3_impl}(organization_id);`,
            { transaction },
          );
          await sequelize.query(
            `CREATE INDEX idx_${tables.l3_impl}_pf
               ON verifywise.${tables.l3_impl}(projects_frameworks_id);`,
            { transaction },
          );

          await sequelize.query(
            `CREATE TABLE verifywise.${tables.l3_risks} (
               organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
               ${cols.l3_risks_impl} INTEGER REFERENCES verifywise.${tables.l3_impl}(id) ON DELETE CASCADE,
               projects_risks_id INTEGER REFERENCES verifywise.risks(id) ON DELETE CASCADE,
               PRIMARY KEY (${cols.l3_risks_impl}, projects_risks_id)
             );`,
            { transaction },
          );
        }
      }

      console.log(`[fw:migrate-impl] done.`);
      await transaction.commit();
    } catch (err) {
      console.error(`[fw:migrate-impl] failed`, err);
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();

    try {
      for (const fw of FRAMEWORK_STRUCTURES) {
        const { tables } = fw;
        if (tables.l3_risks) {
          await sequelize.query(`DROP TABLE IF EXISTS verifywise.${tables.l3_risks} CASCADE;`, {
            transaction,
          });
        }
        await sequelize.query(`DROP TABLE IF EXISTS verifywise.${tables.l2_risks} CASCADE;`, {
          transaction,
        });
        if (tables.l3_impl) {
          await sequelize.query(`DROP TABLE IF EXISTS verifywise.${tables.l3_impl} CASCADE;`, {
            transaction,
          });
          await sequelize.query(`DROP TYPE IF EXISTS verifywise.enum_${tables.l3_impl}_status;`, {
            transaction,
          });
        }
        await sequelize.query(`DROP TABLE IF EXISTS verifywise.${tables.l2_impl} CASCADE;`, {
          transaction,
        });
        await sequelize.query(`DROP TYPE IF EXISTS verifywise.enum_${tables.l2_impl}_status;`, {
          transaction,
        });
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
