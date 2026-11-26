"use strict";

/**
 * Copies the work organizations did on the EU AI Act items that moved to EU AI
 * Act (organization), framework 29 (migration 20261119235846), from their use
 * cases to the organizational project, and tells each Admin once.
 *
 * Before the move every use case had its own rows for those controls and
 * questions. They stay in the database, hidden (a use case's EU AI Act no
 * longer lists them), and the organizational project's framework-29 rows
 * started empty. For each organization whose non-demo organizational project
 * has framework 29:
 *
 *   1. Each framework-29 row (controls_eu by control_meta_id, subcontrols_eu by
 *      subcontrol_meta_id, answers_eu by question_id) that nobody has worked on
 *      yet (default status, every user field empty, not copied before) takes
 *      the work of the best hidden row of the same item among the
 *      organization's non-demo use cases: the most advanced status (Done, then
 *      In progress, then Waiting / Not started), then a row with any work over
 *      one without, then the latest change in its change history (answers have
 *      none), then the highest id. Nothing is copied when no hidden row has
 *      any work. "Work" is a non-default status, a filled user field, or an
 *      evidence or risk link.
 *      - controls_eu: owner, reviewer, approver, risk_review, due_date,
 *        implementation_details; its status is derived from its subcontrols as
 *        saveControls does, so the control and its subcontrols agree.
 *      - subcontrols_eu: status, owner, reviewer, approver, risk_review,
 *        due_date, implementation_details, evidence_description,
 *        feedback_description.
 *      - answers_eu: answer, status.
 *      A user who is no longer a member of the organization is not copied
 *      into owner, reviewer or approver (left empty).
 *      copied_from_project_id is set to the source use case; the trackers show
 *      "copied, review it" until a user saves the row, which clears it. A
 *      control whose own row had no work is still marked when one of its
 *      subcontrols was copied, with that subcontrol's use case.
 *   2. Each copied subcontrol and answer gets the union of the evidence and
 *      feedback files (file_entity_links) of every hidden row of that item in
 *      the organization, not only the chosen one; each copied control,
 *      subcontrol and answer gets the union of their risk links.
 *   3. Each copied control and subcontrol gets a change-history entry
 *      "Copied from use case" = "<use case title> (<UC id>)", by the system.
 *   4. Every Admin of each such organization gets one in-app notification,
 *      in their language (user_preferences.language, English when it is not
 *      one the server translates, as getUserLanguage does).
 *
 * Hidden rows are not changed or deleted, and task links (task_entity_links)
 * stay on them: moving a link would take the use case away from the task's
 * assignees.
 *
 * Idempotent: a copied row has copied_from_project_id set (or is no longer
 * untouched), so a re-run copies nothing; links are inserted ON CONFLICT DO
 * NOTHING; a notification is not sent twice to an Admin of an organization
 * (metadata.notice marks it).
 *
 * down() is a no-op: the copied values may have been edited since, and the
 * hidden rows still hold the originals.
 */

const {
  EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID,
  EU_AI_ACT_ORGANIZATION_MOVED_NOTICE,
} = require("../../dist/structures");
const { translate } = require("../../dist/utils/i18n.utils");

const EU_AI_ACT_FRAMEWORK_ID = 1;
const ADMIN_ROLE_ID = 1;
const NOTICE = "eu_ai_act_organization_moved";
const LOG = "[fw:eu-ai-act-organization-copy-forward]";

const STATUS_RANK = { Done: 3, "In progress": 2 };
const statusRank = (status) => STATUS_RANK[status] ?? 1;

const isEmpty = (value) =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "");

const CONTROL_FIELDS = [
  "owner",
  "reviewer",
  "approver",
  "risk_review",
  "due_date",
  "implementation_details",
];
const SUBCONTROL_FIELDS = [...CONTROL_FIELDS, "evidence_description", "feedback_description"];
const ANSWER_FIELDS = ["answer"];
const USER_FIELDS = new Set(["owner", "reviewer", "approver"]);

/** No status beyond the default and no user field filled. */
const hasNoFields = (row, fields, defaultStatus) =>
  (row.status === null || row.status === defaultStatus) && fields.every((f) => isEmpty(row[f]));

/** A framework-29 row nobody has worked on and nothing was copied into. */
const isUntouchedTarget = (row, fields, defaultStatus) =>
  row.copied_from_project_id === null && hasNoFields(row, fields, defaultStatus);

/** A hidden row someone worked on: a field, a status or a link. */
const hasWork = (row, fields, defaultStatus) =>
  row.has_links || !hasNoFields(row, fields, defaultStatus);

/** The hidden row to copy for one item, or null when none has any work. */
function bestSource(sources, fields, defaultStatus) {
  const ranked = sources
    .map((row) => ({ row, work: hasWork(row, fields, defaultStatus) }))
    .sort(
      (a, b) =>
        statusRank(b.row.status) - statusRank(a.row.status) ||
        Number(b.work) - Number(a.work) ||
        (b.row.last_changed_at ? new Date(b.row.last_changed_at).getTime() : 0) -
          (a.row.last_changed_at ? new Date(a.row.last_changed_at).getTime() : 0) ||
        b.row.id - a.row.id,
    );
  return ranked[0]?.work ? ranked[0].row : null;
}

/** The control status saveControls derives from its subcontrols (deriveControlStatus). */
function deriveControlStatus(statuses) {
  if (statuses.length === 0) return "Waiting";
  if (statuses.every((s) => s === "Done")) return "Done";
  if (statuses.every((s) => s === "Waiting" || s === null)) return "Waiting";
  return "In progress";
}

const groupBy = (rows, key) => {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  }
  return groups;
};

const sourceLabel = (row) =>
  row.uc_id ? `${row.project_title} (${row.uc_id})` : row.project_title;

/** The user fields to copy; a user no longer in the organization is left out. */
function copiedValues(source, fields, members) {
  const values = {};
  for (const field of fields) {
    const value = source[field];
    values[field] = USER_FIELDS.has(field) && value !== null && !members.has(value) ? null : value;
  }
  return values;
}

async function addColumns(sequelize, transaction) {
  for (const table of ["controls_eu", "subcontrols_eu", "answers_eu"]) {
    await sequelize.query(
      `ALTER TABLE verifywise.${table}
         ADD COLUMN IF NOT EXISTS copied_from_project_id INTEGER
         REFERENCES verifywise.projects(id) ON DELETE SET NULL;`,
      { transaction },
    );
  }
}

/**
 * Narrows to the organization's non-demo use cases' EU AI Act, given the alias
 * of the row (controls_eu or assessments) that holds projects_frameworks_id.
 */
const hiddenScope = (holder) => `
  JOIN verifywise.projects_frameworks pf
    ON pf.id = ${holder}.projects_frameworks_id AND pf.organization_id = ${holder}.organization_id
  JOIN verifywise.projects p
    ON p.id = pf.project_id AND p.organization_id = pf.organization_id
  WHERE ${holder}.organization_id = :organizationId
    AND pf.framework_id = :euFrameworkId
    AND p.is_organizational = false
    AND p.is_demo = false`;

async function loadRows(sequelize, organizationId, pfId, transaction) {
  const replacements = {
    organizationId,
    pfId,
    euFrameworkId: EU_AI_ACT_FRAMEWORK_ID,
    frameworkId: EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID,
  };
  const select = (sql) =>
    sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT, transaction });

  const targetControls = await select(
    `SELECT c.id, c.control_meta_id, c.status, c.copied_from_project_id, ${CONTROL_FIELDS.map(
      (f) => `c.${f}`,
    ).join(", ")}
       FROM verifywise.controls_eu c
      WHERE c.organization_id = :organizationId AND c.projects_frameworks_id = :pfId
      ORDER BY c.id;`,
  );
  const targetSubcontrols = await select(
    `SELECT s.id, s.control_id, s.subcontrol_meta_id, s.status, s.copied_from_project_id,
            ${SUBCONTROL_FIELDS.map((f) => `s.${f}`).join(", ")}
       FROM verifywise.subcontrols_eu s
       JOIN verifywise.controls_eu c ON c.id = s.control_id AND c.organization_id = s.organization_id
      WHERE s.organization_id = :organizationId AND c.projects_frameworks_id = :pfId
      ORDER BY s.id;`,
  );
  const targetAnswers = await select(
    `SELECT a.id, a.question_id, a.status, a.answer, a.copied_from_project_id
       FROM verifywise.answers_eu a
       JOIN verifywise.assessments asmt
         ON asmt.id = a.assessment_id AND asmt.organization_id = a.organization_id
      WHERE a.organization_id = :organizationId AND asmt.projects_frameworks_id = :pfId
      ORDER BY a.id;`,
  );

  const sourceControls = await select(
    `SELECT c.id, c.control_meta_id, c.status, ${CONTROL_FIELDS.map((f) => `c.${f}`).join(", ")},
            p.id AS project_id, p.project_title, p.uc_id,
            (SELECT MAX(h.changed_at) FROM verifywise.control_eu_change_history h
              WHERE h.control_eu_id = c.id) AS last_changed_at,
            EXISTS (SELECT 1 FROM verifywise.controls_eu__risks r
                     WHERE r.control_id = c.id AND r.organization_id = c.organization_id) AS has_links
       FROM verifywise.controls_eu c
       JOIN verifywise.controls_struct_eu cs ON cs.id = c.control_meta_id
       ${hiddenScope("c")}
        AND cs.moved_to_framework_id = :frameworkId;`,
  );
  const sourceSubcontrols = await select(
    `SELECT s.id, s.subcontrol_meta_id, s.status, ${SUBCONTROL_FIELDS.map((f) => `s.${f}`).join(", ")},
            p.id AS project_id, p.project_title, p.uc_id,
            (SELECT MAX(h.changed_at) FROM verifywise.subcontrol_eu_change_history h
              WHERE h.subcontrol_eu_id = s.id) AS last_changed_at,
            (EXISTS (SELECT 1 FROM verifywise.subcontrols_eu__risks r
                      WHERE r.subcontrol_id = s.id AND r.organization_id = s.organization_id)
             OR EXISTS (SELECT 1 FROM verifywise.file_entity_links fel
                         WHERE fel.organization_id = s.organization_id
                           AND fel.framework_type = 'eu_ai_act' AND fel.entity_type = 'subcontrol'
                           AND fel.entity_id = s.id)) AS has_links
       FROM verifywise.subcontrols_eu s
       JOIN verifywise.controls_eu c ON c.id = s.control_id AND c.organization_id = s.organization_id
       JOIN verifywise.controls_struct_eu cs ON cs.id = c.control_meta_id
       ${hiddenScope("c")}
        AND cs.moved_to_framework_id = :frameworkId;`,
  );
  const sourceAnswers = await select(
    `SELECT a.id, a.question_id, a.status, a.answer,
            p.id AS project_id, p.project_title, p.uc_id,
            NULL AS last_changed_at,
            (EXISTS (SELECT 1 FROM verifywise.answers_eu__risks r
                      WHERE r.answer_id = a.id AND r.organization_id = a.organization_id)
             OR EXISTS (SELECT 1 FROM verifywise.file_entity_links fel
                         WHERE fel.organization_id = a.organization_id
                           AND fel.framework_type = 'eu_ai_act' AND fel.entity_type = 'assessment'
                           AND fel.entity_id = a.id)) AS has_links
       FROM verifywise.answers_eu a
       JOIN verifywise.questions_struct_eu q ON q.id = a.question_id
       JOIN verifywise.assessments asmt
         ON asmt.id = a.assessment_id AND asmt.organization_id = a.organization_id
       ${hiddenScope("asmt")}
        AND q.moved_to_framework_id = :frameworkId;`,
  );

  return {
    targetControls,
    targetSubcontrols,
    targetAnswers,
    sourceControls: groupBy(sourceControls, "control_meta_id"),
    sourceSubcontrols: groupBy(sourceSubcontrols, "subcontrol_meta_id"),
    sourceAnswers: groupBy(sourceAnswers, "question_id"),
  };
}

/** Sets the copied values and the marker on one framework-29 row, if still unmarked. */
async function writeCopy(sequelize, table, id, values, projectId, transaction) {
  const fields = Object.keys(values);
  await sequelize.query(
    `UPDATE verifywise.${table}
        SET ${fields.map((f) => `${f} = :${f}`).join(", ")},
            copied_from_project_id = :projectId
      WHERE id = :id AND copied_from_project_id IS NULL;`,
    { replacements: { ...values, id, projectId }, transaction },
  );
}

async function recordHistory(sequelize, table, foreignKey, organizationId, id, label, transaction) {
  await sequelize.query(
    `INSERT INTO verifywise.${table}
       (organization_id, ${foreignKey}, action, field_name, old_value, new_value,
        changed_by_user_id, changed_by_system, changed_at)
     VALUES (:organizationId, :id, 'updated', 'Copied from use case', NULL, :label,
             NULL, TRUE, NOW());`,
    { replacements: { organizationId, id, label }, transaction },
  );
}

/** The union of the hidden rows' evidence and feedback files, onto one copied row. */
async function copyFileLinks(
  sequelize,
  entityType,
  organizationId,
  targetId,
  sourceIds,
  transaction,
) {
  await sequelize.query(
    `INSERT INTO verifywise.file_entity_links
       (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_by, created_at)
     SELECT DISTINCT ON (fel.file_id)
            :organizationId, fel.file_id, 'eu_ai_act', :entityType, :targetId,
            fel.link_type, fel.created_by, NOW()
       FROM verifywise.file_entity_links fel
      WHERE fel.organization_id = :organizationId
        AND fel.framework_type = 'eu_ai_act'
        AND fel.entity_type = :entityType
        AND fel.entity_id IN (:sourceIds)
      ORDER BY fel.file_id, fel.id
     ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING;`,
    { replacements: { organizationId, entityType, targetId, sourceIds }, transaction },
  );
}

/** The union of the hidden rows' risk links, onto one copied row. */
async function copyRiskLinks(
  sequelize,
  table,
  column,
  organizationId,
  targetId,
  sourceIds,
  transaction,
) {
  await sequelize.query(
    `INSERT INTO verifywise.${table} (organization_id, ${column}, projects_risks_id)
     SELECT DISTINCT :organizationId, :targetId::int, r.projects_risks_id
       FROM verifywise.${table} r
       JOIN verifywise.risks risk
         ON risk.id = r.projects_risks_id AND risk.organization_id = :organizationId
      WHERE r.organization_id = :organizationId AND r.${column} IN (:sourceIds)
     ON CONFLICT DO NOTHING;`,
    { replacements: { organizationId, targetId, sourceIds }, transaction },
  );
}

/** Copies one organization's hidden work; returns the controls and answers marked. */
async function copyOrganization(sequelize, organization, transaction) {
  const { organization_id: organizationId, pf_id: pfId } = organization;
  const rows = await loadRows(sequelize, organizationId, pfId, transaction);
  const members = new Set(
    (
      await sequelize.query(
        `SELECT user_id FROM verifywise.organization_members WHERE organization_id = :organizationId;`,
        { replacements: { organizationId }, type: sequelize.QueryTypes.SELECT, transaction },
      )
    ).map((row) => row.user_id),
  );
  const ids = (sources) => sources.map((row) => row.id);
  let controls = 0;
  let answers = 0;

  // Subcontrols first: a control's status is derived from them.
  const copiedSubcontrolsByControl = new Map();
  for (const target of rows.targetSubcontrols) {
    if (!isUntouchedTarget(target, SUBCONTROL_FIELDS, "Waiting")) continue;
    const sources = rows.sourceSubcontrols.get(target.subcontrol_meta_id) ?? [];
    const source = bestSource(sources, SUBCONTROL_FIELDS, "Waiting");
    if (!source) continue;

    const values = {
      status: source.status ?? "Waiting",
      ...copiedValues(source, SUBCONTROL_FIELDS, members),
    };
    await writeCopy(sequelize, "subcontrols_eu", target.id, values, source.project_id, transaction);
    await copyFileLinks(
      sequelize,
      "subcontrol",
      organizationId,
      target.id,
      ids(sources),
      transaction,
    );
    await copyRiskLinks(
      sequelize,
      "subcontrols_eu__risks",
      "subcontrol_id",
      organizationId,
      target.id,
      ids(sources),
      transaction,
    );
    await recordHistory(
      sequelize,
      "subcontrol_eu_change_history",
      "subcontrol_eu_id",
      organizationId,
      target.id,
      sourceLabel(source),
      transaction,
    );
    target.status = values.status;
    if (!copiedSubcontrolsByControl.has(target.control_id)) {
      copiedSubcontrolsByControl.set(target.control_id, source);
    }
  }

  const subcontrolsByControl = groupBy(rows.targetSubcontrols, "control_id");
  for (const target of rows.targetControls) {
    if (!isUntouchedTarget(target, CONTROL_FIELDS, "Waiting")) continue;
    const sources = rows.sourceControls.get(target.control_meta_id) ?? [];
    const source =
      bestSource(sources, CONTROL_FIELDS, "Waiting") ?? copiedSubcontrolsByControl.get(target.id);
    if (!source) continue;

    const ownSource = sources.includes(source);
    const subcontrols = subcontrolsByControl.get(target.id) ?? [];
    const values = {
      status: subcontrols.length
        ? deriveControlStatus(subcontrols.map((s) => s.status))
        : (source.status ?? "Waiting"),
      ...(ownSource
        ? copiedValues(source, CONTROL_FIELDS, members)
        : Object.fromEntries(CONTROL_FIELDS.map((f) => [f, null]))),
    };
    await writeCopy(sequelize, "controls_eu", target.id, values, source.project_id, transaction);
    if (sources.length > 0) {
      await copyRiskLinks(
        sequelize,
        "controls_eu__risks",
        "control_id",
        organizationId,
        target.id,
        ids(sources),
        transaction,
      );
    }
    await recordHistory(
      sequelize,
      "control_eu_change_history",
      "control_eu_id",
      organizationId,
      target.id,
      sourceLabel(source),
      transaction,
    );
    controls++;
  }

  for (const target of rows.targetAnswers) {
    if (!isUntouchedTarget(target, ANSWER_FIELDS, "Not started")) continue;
    const sources = rows.sourceAnswers.get(target.question_id) ?? [];
    const source = bestSource(sources, ANSWER_FIELDS, "Not started");
    if (!source) continue;

    await writeCopy(
      sequelize,
      "answers_eu",
      target.id,
      { answer: source.answer, status: source.status ?? "Not started" },
      source.project_id,
      transaction,
    );
    await copyFileLinks(
      sequelize,
      "assessment",
      organizationId,
      target.id,
      ids(sources),
      transaction,
    );
    await copyRiskLinks(
      sequelize,
      "answers_eu__risks",
      "answer_id",
      organizationId,
      target.id,
      ids(sources),
      transaction,
    );
    answers++;
  }
  return { controls, answers };
}

/** The notice text for one Admin, in their language. */
function noticeText(language, project, copied) {
  const message =
    copied === 0
      ? EU_AI_ACT_ORGANIZATION_MOVED_NOTICE.none
      : copied === 1
        ? EU_AI_ACT_ORGANIZATION_MOVED_NOTICE.one
        : EU_AI_ACT_ORGANIZATION_MOVED_NOTICE.many;
  return {
    title: translate(language, EU_AI_ACT_ORGANIZATION_MOVED_NOTICE.titleKey),
    message: translate(language, message.messageKey, { project, copied }),
  };
}

/** One notification per Admin of the organization, unless they already have it. */
async function notifyAdmins(sequelize, organization, transaction) {
  const {
    organization_id: organizationId,
    project_id: projectId,
    project_title: project,
  } = organization;
  const [{ copied }] = await sequelize.query(
    `SELECT (SELECT COUNT(*) FROM verifywise.controls_eu c
              WHERE c.organization_id = :organizationId AND c.projects_frameworks_id = :pfId
                AND c.copied_from_project_id IS NOT NULL)
          + (SELECT COUNT(*) FROM verifywise.answers_eu a
               JOIN verifywise.assessments asmt
                 ON asmt.id = a.assessment_id AND asmt.organization_id = a.organization_id
              WHERE a.organization_id = :organizationId AND asmt.projects_frameworks_id = :pfId
                AND a.copied_from_project_id IS NOT NULL) AS copied;`,
    {
      replacements: { organizationId, pfId: organization.pf_id },
      type: sequelize.QueryTypes.SELECT,
      transaction,
    },
  );
  const admins = await sequelize.query(
    `SELECT m.user_id,
            (SELECT up.language FROM verifywise.user_preferences up
              WHERE up.user_id = m.user_id LIMIT 1) AS language
       FROM verifywise.organization_members m
      WHERE m.organization_id = :organizationId AND m.role_id = :adminRoleId
        AND NOT EXISTS (
          SELECT 1 FROM verifywise.notifications n
           WHERE n.organization_id = m.organization_id AND n.user_id = m.user_id
             AND n.metadata->>'notice' = :notice
        )
      ORDER BY m.user_id;`,
    {
      replacements: { organizationId, adminRoleId: ADMIN_ROLE_ID, notice: NOTICE },
      type: sequelize.QueryTypes.SELECT,
      transaction,
    },
  );
  for (const admin of admins) {
    const { title, message } = noticeText(admin.language, project, Number(copied));
    await sequelize.query(
      `INSERT INTO verifywise.notifications
         (organization_id, user_id, type, title, message, entity_type, entity_id, entity_name,
          action_url, metadata)
       VALUES (:organizationId, :userId, 'system', :title, :message, 'project', :projectId,
               :project, '/framework?framework=eu-ai-act-organization', :metadata::jsonb);`,
      {
        replacements: {
          organizationId,
          userId: admin.user_id,
          title,
          message,
          projectId,
          project,
          metadata: JSON.stringify({ notice: NOTICE }),
        },
        transaction,
      },
    );
  }
  return admins.length;
}

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();

    try {
      await addColumns(sequelize, transaction);

      // The organizational project the Frameworks page shows (newest first),
      // as in 20261119235846; demo ones are skipped.
      const organizations = await sequelize.query(
        `SELECT DISTINCT ON (p.organization_id)
                p.organization_id, p.id AS project_id, p.project_title, pf.id AS pf_id
           FROM verifywise.projects_frameworks pf
           JOIN verifywise.projects p
             ON p.id = pf.project_id AND p.organization_id = pf.organization_id
          WHERE pf.framework_id = :frameworkId
            AND p.is_organizational = true
            AND p.is_demo = false
          ORDER BY p.organization_id, p.created_at DESC, p.id ASC;`,
        {
          replacements: { frameworkId: EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID },
          type: sequelize.QueryTypes.SELECT,
          transaction,
        },
      );

      let controls = 0;
      let answers = 0;
      let notified = 0;
      for (const organization of organizations) {
        const copied = await copyOrganization(sequelize, organization, transaction);
        controls += copied.controls;
        answers += copied.answers;
        notified += await notifyAdmins(sequelize, organization, transaction);
      }

      console.log(
        `${LOG} copied ${controls} controls and ${answers} answers from use cases to EU AI Act (organization) in ${organizations.length} organizations; notified ${notified} Admins`,
      );
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  // Nothing to undo: the copied values may have been edited since, and the
  // use cases' hidden rows still hold the originals. The column stays, since
  // the app reads it.
  async down() {},
};
