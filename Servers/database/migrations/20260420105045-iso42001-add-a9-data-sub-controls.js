"use strict";

/**
 * Adds 5 missing sub-controls to ISO 42001 Annex A.9 "Data for AI systems"
 * (VW A.9 / ISO A.6): labeling, bias assessment, retention, deletion, transfer.
 *
 * For every organization with an ISO 42001 project, inserts an empty tenant row
 * per new sub-control so the controls surface unfilled in the tracker.
 * Idempotent via EXISTS guards.
 */

const NEW_SUB_CONTROLS = [
  {
    sub_id: 7.1,
    order_no: 7,
    title: "Data labeling and annotation",
    description: "Managing data labeling and annotation processes for AI systems.",
    guidance:
      "Data labeling and annotation processes should be defined, documented, and quality-controlled to ensure labels are accurate, consistent, and appropriate for the intended AI system purpose. Labeler qualifications and inter-annotator agreement should be monitored.",
  },
  {
    sub_id: 8.1,
    order_no: 8,
    title: "Data bias assessment",
    description: "Assessing and mitigating bias in data used for AI systems.",
    guidance:
      "Data used for AI systems should be assessed for potential biases that could lead to unfair, discriminatory, or harmful outcomes. Identified biases should be documented and mitigated through appropriate techniques.",
  },
  {
    sub_id: 9.1,
    order_no: 9,
    title: "Data retention",
    description: "Defining and implementing data retention policies for AI-related data.",
    guidance:
      "Retention periods for data used in AI systems — including training data, validation data, model outputs, and logs — should be defined based on legal, regulatory, and operational requirements, and enforced through documented procedures.",
  },
  {
    sub_id: 10.1,
    order_no: 10,
    title: "Data deletion and disposal",
    description: "Secure deletion and disposal of AI-related data.",
    guidance:
      "Data used in AI systems should be securely deleted or disposed of when no longer needed or when retention periods expire, ensuring that deletion is complete and verifiable, particularly for personal or sensitive data.",
  },
  {
    sub_id: 11.1,
    order_no: 11,
    title: "Data transfer",
    description: "Managing the transfer of data used in AI systems.",
    guidance:
      "Transfer of data used in AI systems — whether internal or to third parties — should be governed by documented procedures addressing authorization, encryption, contractual safeguards, and compliance with data protection regulations including cross-border transfer restrictions.",
  },
];

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const [[framework]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.frameworks
         WHERE name ILIKE 'ISO 42001%' OR name ILIKE 'ISO/IEC 42001%' LIMIT 1;`,
        { transaction: t },
      );
      if (!framework) {
        console.warn("[iso42001-a9-subcontrols] ISO 42001 framework not found — skipping");
        await t.commit();
        return;
      }
      const frameworkId = framework.id;

      const [[annex]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.annex_struct_iso
         WHERE framework_id = :frameworkId AND annex_no = 9 LIMIT 1;`,
        { transaction: t, replacements: { frameworkId } },
      );
      if (!annex) {
        console.warn("[iso42001-a9-subcontrols] A.9 annex group not found — skipping");
        await t.commit();
        return;
      }
      const annexId = annex.id;

      const structIds = [];
      for (const sub of NEW_SUB_CONTROLS) {
        const [[existing]] = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.annexcategories_struct_iso
           WHERE annex_id = :annexId AND order_no = :order_no LIMIT 1;`,
          { transaction: t, replacements: { annexId, order_no: sub.order_no } },
        );
        let structId = existing?.id;
        if (!structId) {
          const [[inserted]] = await queryInterface.sequelize.query(
            `INSERT INTO verifywise.annexcategories_struct_iso
               (annex_id, sub_id, title, description, guidance, order_no, is_demo)
             VALUES (:annexId, :sub_id, :title, :description, :guidance, :order_no, false)
             RETURNING id;`,
            {
              transaction: t,
              replacements: {
                annexId,
                sub_id: sub.sub_id,
                title: sub.title,
                description: sub.description,
                guidance: sub.guidance,
                order_no: sub.order_no,
              },
            },
          );
          structId = inserted.id;
        }
        structIds.push(structId);
      }

      for (const structId of structIds) {
        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.annexcategories_iso
             (organization_id, projects_frameworks_id, annexcategory_meta_id, status, is_applicable)
           SELECT pf.organization_id, pf.id, :structId, 'Not started', true
           FROM verifywise.projects_frameworks pf
           WHERE pf.framework_id = :frameworkId
             AND NOT EXISTS (
               SELECT 1 FROM verifywise.annexcategories_iso ai
               WHERE ai.projects_frameworks_id = pf.id
                 AND ai.annexcategory_meta_id = :structId
             );`,
          { transaction: t, replacements: { structId, frameworkId } },
        );
      }

      await t.commit();
      console.log("[iso42001-a9-subcontrols] added 5 A.9 sub-controls + empty tenant rows");
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.annexcategories_struct_iso
      WHERE order_no IN (7, 8, 9, 10, 11)
        AND annex_id IN (
          SELECT id FROM verifywise.annex_struct_iso
          WHERE annex_no = 9
            AND framework_id IN (
              SELECT id FROM verifywise.frameworks
              WHERE name ILIKE 'ISO 42001%' OR name ILIKE 'ISO/IEC 42001%'
            )
        );
    `);
  },
};
