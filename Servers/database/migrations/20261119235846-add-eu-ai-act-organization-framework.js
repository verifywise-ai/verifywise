"use strict";

/**
 * Splits the organization-wide EU AI Act obligations out of the use-case
 * EU AI Act (framework 1) into EU AI Act (organization), framework 29.
 *
 * Framework 29 is not a separate structure. It holds the EU AI Act controls
 * and assessment questions listed in EU_AI_ACT_ORGANIZATION_CONTROLS and
 * EU_AI_ACT_ORGANIZATION_QUESTIONS (structures/EU-AI-Act-Organization), in the
 * EU AI Act's own tables, so they keep the EU AI Act's text, numbers and
 * screens. An organizational project's framework 29 has controls_eu /
 * subcontrols_eu rows and an assessment for those items only; a use case's
 * EU AI Act has them for every other item.
 *
 *   1. Inserts the frameworks row 29 (organizational) when it is missing.
 *   2. Adds controls_struct_eu.moved_to_framework_id and
 *      questions_struct_eu.moved_to_framework_id and sets them to 29 on the
 *      listed controls and questions. Framework 1 no longer creates or shows
 *      them. A use case's existing rows for them are not touched; they stay in
 *      the database, hidden.
 *   3. Attaches framework 29 to every organization that already has EU AI Act
 *      on a use case, as the app does when EU AI Act is enabled on one:
 *      - only non-demo use cases count;
 *      - it goes on the organization's organizational project, the one the
 *        Frameworks page shows (newest first: created_at DESC, id ASC), demo
 *        ones skipped since deleting the demo data removes them;
 *      - an organization with no such project gets one, named after the
 *        organization and owned by its first Admin (earliest joined), else by
 *        the owner of its first EU AI Act use case (lowest id; NULL when that
 *        use case has an external owner);
 *      - its rows are the ones createEUAIActOrganizationFrameworkQuery
 *        (utils/eu.utils.ts) creates: a "Waiting" controls_eu row per moved
 *        control and subcontrols_eu row per subcontrol of it, and an
 *        assessment with a "Not started" answers_eu row per moved question.
 *      No notification is sent.
 *
 * Idempotent: the row is inserted once, the columns are set to the same value
 * again, and an organization whose organizational project already has
 * framework 29 is skipped, so a re-run changes nothing.
 *
 * down() is a no-op: by then organizations may have worked on framework 29,
 * and removing frameworks row 29 would cascade through projects_frameworks
 * and delete that work.
 */

const {
  EU_AI_ACT_ORGANIZATION_CONTROLS,
  EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID,
  EU_AI_ACT_ORGANIZATION_QUESTIONS,
} = require("../../dist/structures");

const EU_AI_ACT_FRAMEWORK_ID = 1;
/** organization_members.role_id of an Admin. */
const ADMIN_ROLE_ID = 1;

/** Marks the listed rows of an EU AI Act struct table as moved; throws unless all matched. */
async function markMoved(sequelize, { table, keys, fromJoins, keyColumns }, transaction) {
  await sequelize.query(
    `ALTER TABLE verifywise.${table}
       ADD COLUMN IF NOT EXISTS moved_to_framework_id INTEGER
       REFERENCES verifywise.frameworks(id) ON DELETE SET NULL;`,
    { transaction },
  );
  const [updated] = await sequelize.query(
    `UPDATE verifywise.${table} item
        SET moved_to_framework_id = :frameworkId
       ${fromJoins}
        AND (${keyColumns}) IN (${keys.join(", ")})
      RETURNING item.id;`,
    {
      replacements: {
        frameworkId: EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID,
        euFrameworkId: EU_AI_ACT_FRAMEWORK_ID,
      },
      transaction,
    },
  );
  // Struct order numbers carry no unique constraint, so a duplicated or
  // missing row would move the wrong set.
  if (updated.length !== keys.length) {
    throw new Error(
      `[fw:add-eu-ai-act-organization] expected ${keys.length} ${table} rows to move, matched ${updated.length}`,
    );
  }
  return updated.length;
}

/**
 * Attaches framework 29 to every organization that already has EU AI Act on a
 * use case, as the app does from now on when EU AI Act is enabled on a use case
 * (ensureEuAiActOrganizationFrameworkQuery, utils/euAiActOrganization.utils.ts).
 * Returns the organizations attached and the organizational projects created.
 */
async function attachToOrganizations(sequelize, transaction) {
  const frameworkId = EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID;
  const [organizations] = await sequelize.query(
    `SELECT DISTINCT p.organization_id
       FROM verifywise.projects_frameworks pf
       JOIN verifywise.projects p
         ON p.id = pf.project_id AND p.organization_id = pf.organization_id
      WHERE pf.framework_id = :euFrameworkId
        AND p.is_organizational = false
        AND p.is_demo = false
        AND NOT EXISTS (
          SELECT 1 FROM verifywise.projects_frameworks opf
            JOIN verifywise.projects op
              ON op.id = opf.project_id AND op.organization_id = opf.organization_id
           WHERE opf.organization_id = p.organization_id
             AND opf.framework_id = :frameworkId
             AND op.is_organizational = true
             AND op.is_demo = false
        )
      ORDER BY p.organization_id;`,
    { replacements: { euFrameworkId: EU_AI_ACT_FRAMEWORK_ID, frameworkId }, transaction },
  );

  let createdProjects = 0;
  for (const { organization_id: organizationId } of organizations) {
    const [existing] = await sequelize.query(
      `SELECT id FROM verifywise.projects
        WHERE organization_id = :organizationId AND is_organizational = true
          AND is_demo = false
        ORDER BY created_at DESC, id ASC
        LIMIT 1;`,
      { replacements: { organizationId }, transaction },
    );

    let projectId = existing[0]?.id;
    if (!projectId) {
      const [created] = await sequelize.query(
        `INSERT INTO verifywise.projects
           (organization_id, uc_id, project_title, owner, start_date, geography,
            is_organizational, last_updated)
         SELECT o.id, 'UC-' || nextval('verifywise.project_uc_id_seq'), o.name,
                COALESCE(
                  (SELECT m.user_id FROM verifywise.organization_members m
                    WHERE m.organization_id = o.id AND m.role_id = :adminRoleId
                    ORDER BY m.joined_at, m.user_id
                    LIMIT 1),
                  (SELECT p.owner FROM verifywise.projects p
                     JOIN verifywise.projects_frameworks pf
                       ON pf.project_id = p.id AND pf.organization_id = p.organization_id
                    WHERE p.organization_id = o.id
                      AND pf.framework_id = :euFrameworkId
                      AND p.is_organizational = false
                      AND p.is_demo = false
                    ORDER BY p.id
                    LIMIT 1)),
                NOW(), 1, true, NOW()
           FROM verifywise.organizations o
          WHERE o.id = :organizationId
         RETURNING id;`,
        {
          replacements: {
            organizationId,
            euFrameworkId: EU_AI_ACT_FRAMEWORK_ID,
            adminRoleId: ADMIN_ROLE_ID,
          },
          transaction,
        },
      );
      projectId = created[0].id;
      createdProjects++;
    }

    const [projectFramework] = await sequelize.query(
      `INSERT INTO verifywise.projects_frameworks
         (organization_id, project_id, framework_id, is_demo)
       VALUES (:organizationId, :projectId, :frameworkId, false)
       RETURNING id;`,
      { replacements: { organizationId, projectId, frameworkId }, transaction },
    );
    const pfId = projectFramework[0].id;

    const [controls] = await sequelize.query(
      `INSERT INTO verifywise.controls_eu
         (organization_id, control_meta_id, status, projects_frameworks_id, is_demo)
       SELECT :organizationId, cs.id, 'Waiting', :pfId, false
         FROM verifywise.controls_struct_eu cs
        WHERE cs.moved_to_framework_id = :frameworkId
        ORDER BY cs.id
       RETURNING id;`,
      { replacements: { organizationId, pfId, frameworkId }, transaction },
    );
    await sequelize.query(
      `INSERT INTO verifywise.subcontrols_eu
         (organization_id, control_id, subcontrol_meta_id, status, is_demo)
       SELECT :organizationId, c.id, ss.id, 'Waiting', false
         FROM verifywise.controls_eu c
         JOIN verifywise.subcontrols_struct_eu ss ON ss.control_id = c.control_meta_id
        WHERE c.id IN (:controlIds)
        ORDER BY c.id, ss.id;`,
      {
        replacements: { organizationId, controlIds: controls.map((row) => row.id) },
        transaction,
      },
    );
    const [[assessment]] = await sequelize.query(
      `INSERT INTO verifywise.assessments (organization_id, projects_frameworks_id, is_demo)
       VALUES (:organizationId, :pfId, false)
       RETURNING id;`,
      { replacements: { organizationId, pfId }, transaction },
    );
    await sequelize.query(
      `INSERT INTO verifywise.answers_eu
         (organization_id, assessment_id, question_id, status, is_demo)
       SELECT :organizationId, :assessmentId, q.id, 'Not started', false
         FROM verifywise.questions_struct_eu q
        WHERE q.moved_to_framework_id = :frameworkId
        ORDER BY q.id;`,
      {
        replacements: { organizationId, assessmentId: assessment.id, frameworkId },
        transaction,
      },
    );
  }
  return { organizations: organizations.length, createdProjects };
}

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();

    try {
      await sequelize.query(
        `INSERT INTO verifywise.frameworks
           (id, name, description, version, is_organizational, is_active, is_demo)
         VALUES (:id, 'EU AI Act (organization)',
                 'Organization-wide obligations of the EU AI Act: prohibited practices, AI literacy, quality management system and the company-level policies and processes',
                 '1.0', TRUE, TRUE, FALSE)
         ON CONFLICT (id) DO NOTHING;`,
        { replacements: { id: EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID }, transaction },
      );
      await sequelize.query(
        `SELECT setval('verifywise.frameworks_id_seq',
                       (SELECT MAX(id) FROM verifywise.frameworks));`,
        { transaction },
      );

      const controls = await markMoved(
        sequelize,
        {
          table: "controls_struct_eu",
          keys: Object.entries(EU_AI_ACT_ORGANIZATION_CONTROLS).flatMap(
            ([categoryOrderNo, controlOrderNos]) =>
              controlOrderNos.map(
                (controlOrderNo) => `(${Number(categoryOrderNo)}, ${Number(controlOrderNo)})`,
              ),
          ),
          fromJoins: `FROM verifywise.controlcategories_struct_eu cc
            WHERE cc.id = item.control_category_id
              AND cc.framework_id = :euFrameworkId`,
          keyColumns: "cc.order_no, item.order_no",
        },
        transaction,
      );
      const questions = await markMoved(
        sequelize,
        {
          table: "questions_struct_eu",
          keys: Object.entries(EU_AI_ACT_ORGANIZATION_QUESTIONS).flatMap(
            ([topicOrderNo, subtopics]) =>
              Object.entries(subtopics).flatMap(([subtopicOrderNo, questionOrderNos]) =>
                questionOrderNos.map(
                  (questionOrderNo) =>
                    `(${Number(topicOrderNo)}, ${Number(subtopicOrderNo)}, ${Number(questionOrderNo)})`,
                ),
              ),
          ),
          fromJoins: `FROM verifywise.subtopics_struct_eu st
            JOIN verifywise.topics_struct_eu t ON t.id = st.topic_id
            WHERE st.id = item.subtopic_id
              AND t.framework_id = :euFrameworkId`,
          keyColumns: "t.order_no, st.order_no, item.order_no",
        },
        transaction,
      );

      const attached = await attachToOrganizations(sequelize, transaction);

      console.log(
        `[fw:add-eu-ai-act-organization] moved ${controls} EU AI Act controls and ${questions} questions to framework ${EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID}; attached it to ${attached.organizations} organizations (${attached.createdProjects} organizational projects created)`,
      );
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down() {},
};
