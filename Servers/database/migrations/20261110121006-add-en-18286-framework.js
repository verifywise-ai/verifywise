"use strict";

/**
 * Adds EN 18286:2026 (AI quality management system for EU AI Act regulatory
 * purposes) as registry framework id 26 on existing databases.
 *
 * Same steps as 20260805125946-create-framework-struct-tables.js and
 * 20260805130326-create-framework-impl-tables.js, for the `en-18286` entry
 * only:
 *   1. frameworks row
 *   2. struct tables, seeded from seed.structure
 *   3. impl status enum, impl table and __risks table
 *
 * On a fresh database the 20260805* migrations loop over the whole registry
 * and create this framework themselves, so up() returns early when the
 * frameworks row already exists.
 */

const { requireStructureByKey } = require("../../dist/structures");

const fw = requireStructureByKey("en-18286");

function pgTextArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "{}";
  const escaped = arr.map((v) => {
    const s = String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${s}"`;
  });
  return `{${escaped.join(",")}}`;
}

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();

    try {
      const { id: frameworkId, tables, cols, seed } = fw;

      const [existing] = await sequelize.query(
        `SELECT 1 FROM verifywise.frameworks WHERE id = :id;`,
        { replacements: { id: frameworkId }, transaction },
      );
      if (existing.length > 0) {
        console.log(`[fw:${fw.key}] framework id=${frameworkId} already exists — skipping.`);
        await transaction.commit();
        return;
      }

      // ---- frameworks row ----
      await sequelize.query(
        `INSERT INTO verifywise.frameworks
           (id, name, description, version, is_organizational, is_active, is_demo)
         VALUES (:id, :name, :description, :version, :is_organizational, TRUE, FALSE);`,
        {
          replacements: {
            id: frameworkId,
            name: seed.name || fw.displayName,
            description: seed.description || null,
            version: seed.version || "1.0.0",
            is_organizational: !!seed.is_organizational,
          },
          transaction,
        },
      );
      await sequelize.query(
        `SELECT setval('verifywise.frameworks_id_seq',
                       (SELECT MAX(id) FROM verifywise.frameworks));`,
        { transaction },
      );

      // ---- struct tables ----
      await sequelize.query(
        `CREATE TABLE verifywise.${tables.l1_struct} (
           id SERIAL PRIMARY KEY,
           framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
           title TEXT NOT NULL,
           description TEXT,
           order_no INTEGER,
           is_demo BOOLEAN DEFAULT FALSE
         );`,
        { transaction },
      );
      await sequelize.query(
        `CREATE TABLE verifywise.${tables.l2_struct} (
           id SERIAL PRIMARY KEY,
           ${cols.l2_struct_parent} INTEGER REFERENCES verifywise.${tables.l1_struct}(id) ON DELETE CASCADE,
           title TEXT NOT NULL,
           description TEXT,
           summary TEXT,
           questions TEXT[],
           evidence_examples TEXT[],
           order_no INTEGER,
           is_demo BOOLEAN DEFAULT FALSE
         );`,
        { transaction },
      );

      // ---- seed struct rows ----
      let l1Idx = 0;
      for (const l1 of seed.structure) {
        const [l1Res] = await sequelize.query(
          `INSERT INTO verifywise.${tables.l1_struct}
             (framework_id, title, description, order_no)
           VALUES (:framework_id, :title, :description, :order_no)
           RETURNING id;`,
          {
            replacements: {
              framework_id: frameworkId,
              title: l1.title,
              description: l1.description || null,
              order_no: l1.order_no || l1Idx + 1,
            },
            transaction,
          },
        );
        const l1Id = l1Res[0].id;

        let l2Idx = 0;
        for (const l2 of l1.items || []) {
          await sequelize.query(
            `INSERT INTO verifywise.${tables.l2_struct}
               (${cols.l2_struct_parent}, title, description, summary,
                questions, evidence_examples, order_no)
             VALUES (:parent, :title, :description, :summary,
                     :questions, :evidence_examples, :order_no);`,
            {
              replacements: {
                parent: l1Id,
                title: l2.title,
                description: l2.description || null,
                summary: l2.summary || null,
                questions: pgTextArray(l2.questions),
                evidence_examples: pgTextArray(l2.evidence_examples),
                order_no: l2.order_no || l2Idx + 1,
              },
              transaction,
            },
          );
          l2Idx++;
        }
        l1Idx++;
      }

      // ---- impl status enum + table ----
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

      // ---- risks junction ----
      await sequelize.query(
        `CREATE TABLE verifywise.${tables.l2_risks} (
           organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
           ${cols.l2_risks_impl} INTEGER REFERENCES verifywise.${tables.l2_impl}(id) ON DELETE CASCADE,
           projects_risks_id INTEGER REFERENCES verifywise.risks(id) ON DELETE CASCADE,
           PRIMARY KEY (${cols.l2_risks_impl}, projects_risks_id)
         );`,
        { transaction },
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();

    try {
      const { id: frameworkId, tables } = fw;
      await sequelize.query(`DROP TABLE IF EXISTS verifywise.${tables.l2_risks} CASCADE;`, {
        transaction,
      });
      await sequelize.query(`DROP TABLE IF EXISTS verifywise.${tables.l2_impl} CASCADE;`, {
        transaction,
      });
      await sequelize.query(`DROP TYPE IF EXISTS verifywise.enum_${tables.l2_impl}_status;`, {
        transaction,
      });
      await sequelize.query(`DROP TABLE IF EXISTS verifywise.${tables.l2_struct} CASCADE;`, {
        transaction,
      });
      await sequelize.query(`DROP TABLE IF EXISTS verifywise.${tables.l1_struct} CASCADE;`, {
        transaction,
      });
      await sequelize.query(`DELETE FROM verifywise.frameworks WHERE id = :id;`, {
        replacements: { id: frameworkId },
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
