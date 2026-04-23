'use strict';

/**
 * ISO 42001 Annex A.12 (Interested parties) and A.13 (Use of AI systems) —
 * both annex groups were missing from VW. Each ships with three sub-controls.
 *
 * Per user approach: add new struct rows; for every organization with an ISO
 * 42001 project, insert empty tenant rows so the groups surface unfilled in
 * the tracker.
 *
 * Idempotent via EXISTS guards.
 */

const A12_INTERESTED_PARTIES = [
  {
    sub_id: 1.1,
    order_no: 1,
    title: 'Notification to interested parties',
    description: 'Notifying affected individuals and relevant parties about AI system use and its potential impacts.',
    guidance: 'The organization should establish processes for notifying interested parties about AI system deployment, its purpose, and potential impacts on them, in accordance with applicable legal, regulatory, and contractual requirements.',
  },
  {
    sub_id: 2.1,
    order_no: 2,
    title: 'Communication with interested parties',
    description: 'Establishing effective communication channels with interested parties regarding AI systems.',
    guidance: 'The organization should establish and maintain communication channels that allow interested parties to raise questions, provide feedback, and receive information about the organization\'s AI systems and their governance.',
  },
  {
    sub_id: 3.1,
    order_no: 3,
    title: "Addressing interested parties' concerns",
    description: 'Processes for receiving, evaluating, and responding to concerns raised by interested parties about AI systems.',
    guidance: 'The organization should establish processes for receiving, recording, evaluating, and responding to concerns raised by interested parties regarding the development, deployment, or operation of AI systems, including mechanisms for escalation and resolution.',
  },
];

const A13_USE_OF_AI_SYSTEMS = [
  {
    sub_id: 1.1,
    order_no: 1,
    title: 'Responsible use of AI',
    description: 'Ensuring AI systems are used responsibly and in accordance with organizational policies and ethical principles.',
    guidance: 'The organization should establish policies and procedures to ensure AI systems are used responsibly, including appropriate human oversight, monitoring of outcomes, and adherence to ethical principles and organizational AI policy throughout operation.',
  },
  {
    sub_id: 2.1,
    order_no: 2,
    title: 'Intended use documentation',
    description: 'Documenting the intended purpose, conditions of use, and known limitations of AI systems.',
    guidance: 'The intended purpose, operational conditions, known limitations, and boundaries of each AI system should be clearly documented and communicated to users and operators to prevent misuse and ensure appropriate application.',
  },
  {
    sub_id: 3.1,
    order_no: 3,
    title: 'Transparency for users of AI systems',
    description: 'Providing users with clear information about AI system behavior, capabilities, and limitations.',
    guidance: 'Users of AI systems should be provided with clear, accessible information about how the AI system works, what it can and cannot do, the basis for its outputs, and how to interpret results, appropriate to the user\'s role and context.',
  },
];

async function upsertAnnexGroup(queryInterface, t, { frameworkId, annex_no, title, items }) {
  // Upsert annex group
  const [[existing]] = await queryInterface.sequelize.query(
    `SELECT id FROM verifywise.annex_struct_iso
     WHERE framework_id = :frameworkId AND annex_no = :annex_no LIMIT 1;`,
    { transaction: t, replacements: { frameworkId, annex_no } }
  );
  let annexId = existing?.id;
  if (!annexId) {
    const [[inserted]] = await queryInterface.sequelize.query(
      `INSERT INTO verifywise.annex_struct_iso (framework_id, title, annex_no, order_no, is_demo)
       VALUES (:frameworkId, :title, :annex_no, :annex_no, false)
       RETURNING id;`,
      { transaction: t, replacements: { frameworkId, title, annex_no } }
    );
    annexId = inserted.id;
  }

  // Upsert sub-controls
  const structIds = [];
  for (const item of items) {
    const [[existingSub]] = await queryInterface.sequelize.query(
      `SELECT id FROM verifywise.annexcategories_struct_iso
       WHERE annex_id = :annexId AND order_no = :order_no LIMIT 1;`,
      { transaction: t, replacements: { annexId, order_no: item.order_no } }
    );
    let structId = existingSub?.id;
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
            sub_id: item.sub_id,
            title: item.title,
            description: item.description,
            guidance: item.guidance,
            order_no: item.order_no,
          },
        }
      );
      structId = inserted.id;
    }
    structIds.push(structId);
  }

  // Empty tenant rows for every ISO 42001 projects_frameworks row
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
      { transaction: t, replacements: { structId, frameworkId } }
    );
  }
}

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const [[framework]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.frameworks
         WHERE name ILIKE 'ISO 42001%' OR name ILIKE 'ISO/IEC 42001%' LIMIT 1;`,
        { transaction: t }
      );
      if (!framework) {
        console.warn('[iso42001-a12-a13] ISO 42001 framework not found — skipping');
        await t.commit();
        return;
      }

      await upsertAnnexGroup(queryInterface, t, {
        frameworkId: framework.id,
        annex_no: 12,
        title: 'A.12 Interested parties',
        items: A12_INTERESTED_PARTIES,
      });

      await upsertAnnexGroup(queryInterface, t, {
        frameworkId: framework.id,
        annex_no: 13,
        title: 'A.13 Use of AI systems',
        items: A13_USE_OF_AI_SYSTEMS,
      });

      await t.commit();
      console.log('[iso42001-a12-a13] annex groups A.12 and A.13 added + empty tenant rows');
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.annex_struct_iso
      WHERE annex_no IN (12, 13)
        AND framework_id IN (
          SELECT id FROM verifywise.frameworks
          WHERE name ILIKE 'ISO 42001%' OR name ILIKE 'ISO/IEC 42001%'
        );
    `);
  },
};
