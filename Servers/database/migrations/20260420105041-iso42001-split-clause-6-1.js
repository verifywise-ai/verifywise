"use strict";

/**
 * ISO 42001 Clause 6.1 restructure to match the 2023 standard's 3-level shape.
 *
 * The original VW seed had one merged 2-level row "6.1 Actions to address
 * risks and opportunities (Includes Risk Assessment, Treatment, Impact
 * Assessment)". The standard actually has 6.1.1, 6.1.2, 6.1.3, 6.1.4 as the
 * real requirements; 6.1 itself is a heading. This migration:
 *
 *   1. Deletes the old merged '6.1' struct row. FK ON DELETE CASCADE drops
 *      every tenant row under it. If any tenant row has real content
 *      (implementation_description, owner, reviewer, approver, auditor_feedback),
 *      a warning is logged with the count so anyone running this on non-empty
 *      data is aware the content was removed by the restructure.
 *   2. Inserts 4 new struct rows — 6.1.1, 6.1.2, 6.1.3, 6.1.4 — at order_no
 *      1, 2, 3, 4 (slotting into the space vacated by the deleted 6.1).
 *   3. Updates 6.2 from order_no 2 → 5.
 *   4. For every EU AI Act — sorry, ISO 42001 — projects_frameworks row,
 *      inserts an empty tenant subclause row for each of 6.1.1–6.1.4.
 *
 * Clause 6.3 is added by the next migration (20260420105042) at order_no 6.
 *
 * Idempotent: SELECTs existing struct rows by (clause_id, subclause_id) before
 * inserting; renumber runs unconditionally and matches by subclause_id, so
 * reruns are safe.
 */

const NEW_SUBCLAUSES = [
  {
    subclause_id: "6.1.1",
    order_no: 1,
    title: "General — actions to address risks and opportunities",
    summary:
      "When planning for the AIMS, consider the issues from 4.1, requirements from 4.2, and determine risks and opportunities that need to be addressed to ensure the AIMS can achieve its intended outcomes, prevent or reduce undesired effects, and achieve continual improvement.",
    questions: [
      "Have we identified risks and opportunities considering the context (4.1) and interested parties (4.2)?",
      "Do our planned actions integrate into AIMS processes?",
      "How do we evaluate the effectiveness of these actions?",
    ],
    evidence_examples: [
      "Risk and opportunity register linked to context analysis",
      "Planning records showing integration into AIMS processes",
      "Effectiveness evaluation records",
    ],
  },
  {
    subclause_id: "6.1.2",
    order_no: 2,
    title: "AI risk assessment",
    summary:
      "Define and apply an AI risk assessment process that establishes risk criteria, identifies risks to individuals, groups, and societies from AI systems, analyzes and evaluates those risks, and selects treatment options.",
    questions: [
      "Is there a documented AI risk assessment methodology with defined risk criteria?",
      "Are risks to individuals, groups, and societies from AI systems systematically identified?",
      "How are identified risks analyzed (likelihood, severity, affected parties)?",
      "How are risks evaluated against acceptance criteria?",
    ],
    evidence_examples: [
      "AI risk assessment methodology document",
      "Risk criteria definitions (likelihood scales, impact scales, acceptance thresholds)",
      "AI risk assessment reports per system",
      "Risk register with analysis and evaluation results",
    ],
  },
  {
    subclause_id: "6.1.3",
    order_no: 3,
    title: "AI risk treatment",
    summary:
      "Define and apply an AI risk treatment process to select appropriate treatment options, determine controls (referencing Annex A), produce a Statement of Applicability, and formulate a risk treatment plan.",
    questions: [
      "How are risk treatment options selected for each identified AI risk?",
      "Is there a Statement of Applicability (SoA) documenting which Annex A controls apply and which are excluded with justification?",
      "Is there a documented risk treatment plan with owners, timelines, and resources?",
      "Have risk owners approved the risk treatment plan and accepted residual risks?",
    ],
    evidence_examples: [
      "AI risk treatment plan",
      "Statement of Applicability (SoA)",
      "Risk owner approval records",
      "Residual risk acceptance documentation",
    ],
  },
  {
    subclause_id: "6.1.4",
    order_no: 4,
    title: "AI system impact assessment",
    summary:
      "Define and apply an AI system impact assessment process to assess potential consequences — positive and negative — of AI systems on individuals, groups, and societies, considering the AI system lifecycle.",
    questions: [
      "Is there a documented impact assessment methodology for AI systems?",
      "Are both positive and negative impacts on individuals, groups, and societies assessed?",
      "At which lifecycle stages are impact assessments conducted or updated?",
      "How are impact assessment results fed into risk treatment and system design decisions?",
    ],
    evidence_examples: [
      "AI impact assessment methodology",
      "Completed impact assessment reports per AI system",
      "Records linking impact findings to design or treatment decisions",
    ],
  },
];

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
        console.warn("[iso42001-split-6.1] ISO 42001 framework not found — skipping");
        await t.commit();
        return;
      }
      const frameworkId = framework.id;

      const [[clause6]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.clauses_struct_iso
         WHERE framework_id = :frameworkId AND clause_no = 6
         LIMIT 1;`,
        { transaction: t, replacements: { frameworkId } },
      );
      if (!clause6) {
        console.warn("[iso42001-split-6.1] Clause 6 not found — skipping");
        await t.commit();
        return;
      }
      const clauseId = clause6.id;

      // 1) Delete the old merged 6.1 row if still present. FK ON DELETE CASCADE
      //    drops every tenant row under it. If any tenant row has real content,
      //    log a warning with the count — this restructure removes that content
      //    on purpose because old 6.1 is being replaced by 6.1.1–6.1.4.
      const [[oldSixOne]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.subclauses_struct_iso
         WHERE clause_id = :clauseId AND subclause_id = '6.1' LIMIT 1;`,
        { transaction: t, replacements: { clauseId } },
      );

      if (oldSixOne?.id) {
        const [[conflict]] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) AS n
           FROM verifywise.subclauses_iso
           WHERE subclause_meta_id = :structId
             AND (implementation_description IS NOT NULL
                  OR owner IS NOT NULL
                  OR reviewer IS NOT NULL
                  OR approver IS NOT NULL
                  OR auditor_feedback IS NOT NULL);`,
          { transaction: t, replacements: { structId: oldSixOne.id } },
        );

        if (Number(conflict.n) > 0) {
          console.warn(
            `[iso42001-split-6.1] old merged '6.1' has ${conflict.n} tenant row(s) with content — these will be removed by CASCADE (replaced by 6.1.1–6.1.4)`,
          );
        }

        await queryInterface.sequelize.query(
          `DELETE FROM verifywise.subclauses_struct_iso WHERE id = :id;`,
          { transaction: t, replacements: { id: oldSixOne.id } },
        );
        console.log("[iso42001-split-6.1] deleted old merged 6.1 struct row");
      }

      // 2) Update 6.2 from order_no 2 → 5 before inserting the new children,
      //    so there's no ambiguity on order_no lookups.
      await queryInterface.sequelize.query(
        `UPDATE verifywise.subclauses_struct_iso
           SET order_no = 5
         WHERE clause_id = :clauseId AND subclause_id = '6.2';`,
        { transaction: t, replacements: { clauseId } },
      );

      // 3) Insert the 4 new struct rows, idempotent by (clause_id, subclause_id)
      const newStructIds = [];
      for (const sub of NEW_SUBCLAUSES) {
        const [[existing]] = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.subclauses_struct_iso
           WHERE clause_id = :clauseId AND subclause_id = :subclause_id
           LIMIT 1;`,
          { transaction: t, replacements: { clauseId, subclause_id: sub.subclause_id } },
        );
        let structId = existing?.id;
        if (structId) {
          // Rerun: ensure order_no is the final canonical value
          await queryInterface.sequelize.query(
            `UPDATE verifywise.subclauses_struct_iso
               SET order_no = :order_no
             WHERE id = :id;`,
            { transaction: t, replacements: { id: structId, order_no: sub.order_no } },
          );
        } else {
          const [[inserted]] = await queryInterface.sequelize.query(
            `INSERT INTO verifywise.subclauses_struct_iso
               (clause_id, subclause_id, title, summary, questions, evidence_examples, order_no, is_demo)
             VALUES
               (:clauseId, :subclause_id, :title, :summary, :questions, :evidence_examples, :order_no, false)
             RETURNING id;`,
            {
              transaction: t,
              replacements: {
                clauseId,
                subclause_id: sub.subclause_id,
                title: sub.title,
                summary: sub.summary,
                questions: toPgArray(sub.questions),
                evidence_examples: toPgArray(sub.evidence_examples),
                order_no: sub.order_no,
              },
            },
          );
          structId = inserted.id;
        }
        newStructIds.push(structId);
      }

      // 4) For every projects_frameworks row tied to this ISO 42001 framework,
      //    insert 4 empty tenant rows — one per new struct row. Idempotent via
      //    NOT EXISTS.
      for (const structId of newStructIds) {
        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.subclauses_iso
             (organization_id, projects_frameworks_id, subclause_meta_id, status)
           SELECT pf.organization_id, pf.id, :structId, 'Not started'
           FROM verifywise.projects_frameworks pf
           WHERE pf.framework_id = :frameworkId
             AND NOT EXISTS (
               SELECT 1 FROM verifywise.subclauses_iso si
               WHERE si.projects_frameworks_id = pf.id
                 AND si.subclause_meta_id = :structId
             );`,
          { transaction: t, replacements: { structId, frameworkId } },
        );
      }

      await t.commit();
      console.log("[iso42001-split-6.1] clause 6 restructured to 6.1.1-6.1.4 + renumbered 6.2 → 5");
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    // Remove the 4 new struct rows; FK ON DELETE CASCADE cleans up tenant rows.
    // Does NOT recreate the old merged 6.1 — that was the deliberate fix.
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.subclauses_struct_iso
      WHERE subclause_id IN ('6.1.1', '6.1.2', '6.1.3', '6.1.4')
        AND clause_id IN (
          SELECT id FROM verifywise.clauses_struct_iso
          WHERE clause_no = 6
            AND framework_id IN (
              SELECT id FROM verifywise.frameworks
              WHERE name ILIKE 'ISO 42001%' OR name ILIKE 'ISO/IEC 42001%'
            )
        );

      UPDATE verifywise.subclauses_struct_iso
         SET order_no = 2
       WHERE subclause_id = '6.2'
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
