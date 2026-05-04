"use strict";

/**
 * ISO 42001 Clause 6.3 "Planning of changes" — missing from the VW seed.
 *
 * Adds one new subclause under clause 6. For every organization that has an
 * ISO 42001 project, inserts an empty tenant row so the new subclause shows up
 * unfilled in the tracker.
 *
 * Idempotent: struct INSERT is skipped if a row with the same clause_id +
 * subclause_id already exists; tenant INSERTs skip pairs that already exist.
 */

const NEW_SUBCLAUSE = {
  subclause_id: "6.3",
  order_no: 6,
  title: "Planning of changes",
  summary:
    "When the organization determines the need for changes to the AIMS, the changes shall be carried out in a planned manner.",
  questions: [
    "Is there a defined process for planning changes to the AIMS?",
    "Are changes assessed for their impact on AIMS integrity, AI risk assessments, and the Statement of Applicability before implementation?",
    "Are responsibilities, timelines, and resources for changes documented?",
  ],
  evidence_examples: [
    "Change management procedure for the AIMS",
    "Change request and impact assessment records",
    "Approval records for AIMS changes",
    "Post-change review records",
  ],
};

const toPgArray = (arr) => {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return "{}";
  const escaped = arr.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `{${escaped.join(",")}}`;
};

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const [[framework]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.frameworks
         WHERE name ILIKE 'ISO 42001%' OR name ILIKE 'ISO/IEC 42001%'
         LIMIT 1;`,
        { transaction: t },
      );
      if (!framework) {
        console.warn("[iso42001-6.3] ISO 42001 framework not found — skipping");
        await t.commit();
        return;
      }
      const frameworkId = framework.id;

      const [[clause6]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.clauses_struct_iso
         WHERE framework_id = :frameworkId AND clause_no = 6 LIMIT 1;`,
        { transaction: t, replacements: { frameworkId } },
      );
      if (!clause6) {
        console.warn("[iso42001-6.3] Clause 6 not found — skipping");
        await t.commit();
        return;
      }
      const clauseId = clause6.id;

      // Upsert struct row
      const [[existing]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.subclauses_struct_iso
         WHERE clause_id = :clauseId AND subclause_id = :subclause_id LIMIT 1;`,
        { transaction: t, replacements: { clauseId, subclause_id: NEW_SUBCLAUSE.subclause_id } },
      );
      let structId = existing?.id;
      if (!structId) {
        const [[inserted]] = await queryInterface.sequelize.query(
          `INSERT INTO verifywise.subclauses_struct_iso
             (clause_id, subclause_id, title, summary, questions, evidence_examples, order_no, is_demo)
           VALUES (:clauseId, :subclause_id, :title, :summary, :questions, :evidence_examples, :order_no, false)
           RETURNING id;`,
          {
            transaction: t,
            replacements: {
              clauseId,
              subclause_id: NEW_SUBCLAUSE.subclause_id,
              title: NEW_SUBCLAUSE.title,
              summary: NEW_SUBCLAUSE.summary,
              questions: toPgArray(NEW_SUBCLAUSE.questions),
              evidence_examples: toPgArray(NEW_SUBCLAUSE.evidence_examples),
              order_no: NEW_SUBCLAUSE.order_no,
            },
          },
        );
        structId = inserted.id;
      }

      // Empty tenant row per ISO 42001 projects_frameworks
      await queryInterface.sequelize.query(
        `INSERT INTO verifywise.subclauses_iso
           (organization_id, projects_frameworks_id, subclause_meta_id, status)
         SELECT pf.organization_id, pf.id, :structId, 'Not started'
         FROM verifywise.projects_frameworks pf
         WHERE pf.framework_id = :frameworkId
           AND NOT EXISTS (
             SELECT 1 FROM verifywise.subclauses_iso si
             WHERE si.projects_frameworks_id = pf.id AND si.subclause_meta_id = :structId
           );`,
        { transaction: t, replacements: { structId, frameworkId } },
      );

      await t.commit();
      console.log("[iso42001-6.3] added Planning of changes subclause + empty tenant rows");
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.subclauses_struct_iso
      WHERE subclause_id = '6.3'
        AND clause_id IN (
          SELECT id FROM verifywise.clauses_struct_iso
          WHERE clause_no = 6
            AND framework_id IN (
              SELECT id FROM verifywise.frameworks
              WHERE name ILIKE 'ISO 42001%' OR name ILIKE 'ISO/IEC 42001%'
            )
        );
    `);
  },
};
