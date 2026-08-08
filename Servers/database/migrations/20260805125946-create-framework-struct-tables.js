"use strict";

/**
 * Step 1 — Struct tables for the 21 migrated frameworks (SOC2, GDPR, ...).
 *
 * Iterates FRAMEWORK_STRUCTURES from Servers/structures/ (compiled to
 * dist/structures) and, for each entry:
 *   1. Inserts a `frameworks` row at the fixed id declared in the
 *      structure file (5-25).
 *   2. Creates per-framework struct tables (l1 / l2 / optional l3) whose
 *      shape matches the built-in struct tables (topics_struct_eu,
 *      clauses_struct_iso, ...).
 *   3. Seeds struct rows from the structure's `seed.structure` array.
 */

const { FRAMEWORK_STRUCTURES } = require("../../dist/structures");

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
      console.log(`[fw:migrate-struct] starting for ${FRAMEWORK_STRUCTURES.length} frameworks`);
      let l1Total = 0, l2Total = 0, l3Total = 0;
      for (const fw of FRAMEWORK_STRUCTURES) {
        const { id: frameworkId, tables, cols, seed } = fw;
        const isThreeLevel = !!tables.l3_struct;
        const seedIsThreeLevel = seed.hierarchy?.type === "three_level";
        if (isThreeLevel !== seedIsThreeLevel) {
          throw new Error(
            `Hierarchy mismatch for '${fw.key}': seed says ` +
            `'${seed.hierarchy?.type}' but tables ${isThreeLevel ? "have" : "lack"} l3_struct`
          );
        }
        console.log(`[fw:migrate-struct] ${fw.key} (id=${frameworkId}) — ${isThreeLevel ? "3-level" : "2-level"}`);

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
          }
        );

        // ---- L1 struct ----
        await sequelize.query(
          `CREATE TABLE verifywise.${tables.l1_struct} (
             id SERIAL PRIMARY KEY,
             framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
             title TEXT NOT NULL,
             description TEXT,
             order_no INTEGER,
             is_demo BOOLEAN DEFAULT FALSE
           );`,
          { transaction }
        );

        // ---- L2 struct ----
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
          { transaction }
        );

        // ---- L3 struct (three-level only) ----
        if (isThreeLevel) {
          await sequelize.query(
            `CREATE TABLE verifywise.${tables.l3_struct} (
               id SERIAL PRIMARY KEY,
               ${cols.l3_struct_parent} INTEGER REFERENCES verifywise.${tables.l2_struct}(id) ON DELETE CASCADE,
               title TEXT NOT NULL,
               description TEXT,
               summary TEXT,
               questions TEXT[],
               evidence_examples TEXT[],
               order_no INTEGER,
               is_demo BOOLEAN DEFAULT FALSE
             );`,
            { transaction }
          );
        }

        // ---- Seed struct rows from structure ----
        let l1Count = 0, l2Count = 0, l3Count = 0;
        let l1Idx = 0;
        for (const l1 of seed.structure || []) {
          l1Count++;
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
            }
          );
          const l1Id = l1Res[0].id;

          let l2Idx = 0;
          for (const l2 of l1.items || []) {
            l2Count++;
            const [l2Res] = await sequelize.query(
              `INSERT INTO verifywise.${tables.l2_struct}
                 (${cols.l2_struct_parent}, title, description, summary,
                  questions, evidence_examples, order_no)
               VALUES (:parent, :title, :description, :summary,
                       :questions, :evidence_examples, :order_no)
               RETURNING id;`,
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
              }
            );
            const l2Id = l2Res[0].id;

            if (isThreeLevel && Array.isArray(l2.items)) {
              let l3Idx = 0;
              for (const l3 of l2.items) {
                l3Count++;
                await sequelize.query(
                  `INSERT INTO verifywise.${tables.l3_struct}
                     (${cols.l3_struct_parent}, title, description, summary,
                      questions, evidence_examples, order_no)
                   VALUES (:parent, :title, :description, :summary,
                           :questions, :evidence_examples, :order_no);`,
                  {
                    replacements: {
                      parent: l2Id,
                      title: l3.title,
                      description: l3.description || null,
                      summary: l3.summary || null,
                      questions: pgTextArray(l3.questions),
                      evidence_examples: pgTextArray(l3.evidence_examples),
                      order_no: l3.order_no || l3Idx + 1,
                    },
                    transaction,
                  }
                );
                l3Idx++;
              }
            }
            l2Idx++;
          }
          l1Idx++;
        }
        console.log(`[fw:migrate-struct] ${fw.key} seeded: L1=${l1Count} L2=${l2Count} L3=${l3Count}`);
        l1Total += l1Count; l2Total += l2Count; l3Total += l3Count;
      }
      console.log(`[fw:migrate-struct] done. Totals: L1=${l1Total} L2=${l2Total} L3=${l3Total}`);

      // Advance the frameworks SERIAL past the fixed ids we just inserted.
      await sequelize.query(
        `SELECT setval('verifywise.frameworks_id_seq',
                       (SELECT MAX(id) FROM verifywise.frameworks));`,
        { transaction }
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
      for (const fw of FRAMEWORK_STRUCTURES) {
        const { tables } = fw;
        if (tables.l3_struct) {
          await sequelize.query(
            `DROP TABLE IF EXISTS verifywise.${tables.l3_struct} CASCADE;`,
            { transaction }
          );
        }
        await sequelize.query(
          `DROP TABLE IF EXISTS verifywise.${tables.l2_struct} CASCADE;`,
          { transaction }
        );
        await sequelize.query(
          `DROP TABLE IF EXISTS verifywise.${tables.l1_struct} CASCADE;`,
          { transaction }
        );
      }

      const ids = FRAMEWORK_STRUCTURES.map((fw) => fw.id);
      if (ids.length > 0) {
        await sequelize.query(
          `DELETE FROM verifywise.frameworks WHERE id IN (:ids);`,
          { replacements: { ids }, transaction }
        );
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
