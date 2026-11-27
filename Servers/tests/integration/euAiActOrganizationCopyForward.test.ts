jest.setTimeout(60000);

/**
 * Migration 20261126150000 copies the work an organization did on the EU AI
 * Act items that moved to EU AI Act (organization) from its use cases' hidden
 * rows to the organizational project's framework-29 rows, and tells each
 * Admin once, in their language.
 */

jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: { publish: jest.fn().mockResolvedValue(1) },
}));

import path from "path";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestFile, createTestProjectFramework, createTestRisk } from "../factories";
import { getTranslator } from "../../utils/i18n.utils";
import { EU_AI_ACT_ORGANIZATION_MOVED_NOTICE } from "../../structures";
import { attachLinkProjections } from "../../utils/files/attachLinkProjections";
import { buildEntityUrlAsync } from "../../services/inAppNotification.service";
import { getControlByIdQuery } from "../../utils/eu.utils";

const EU_AI_ACT = 1;
const EU_AI_ACT_ORGANIZATION = 29;

const migrationsDir = path.resolve(__dirname, "../../database/migrations");
const split = require(
  path.join(migrationsDir, "20261119235846-add-eu-ai-act-organization-framework.js"),
);
const copyForward = require(
  path.join(migrationsDir, "20261126150000-eu-ai-act-organization-copy-forward.js"),
);
const runMigrations = async () => {
  await split.up({ sequelize });
  await copyForward.up({ sequelize });
};

const select = <T>(sql: string, replacements: Record<string, unknown> = {}) =>
  sequelize.query(sql, { replacements, type: QueryTypes.SELECT }) as Promise<T[]>;
const one = async <T>(sql: string, replacements: Record<string, unknown> = {}) =>
  (await select<T>(sql, replacements))[0];

beforeAll(async () => {
  await seedFrameworks();
});

afterEach(async () => {
  await cleanupDatabase();
  await seedFrameworks();
});

let counter = 0;
const email = (name: string) => `cf-${name}-${Date.now()}-${++counter}@test.com`;

/** The moved AI literacy control (category 1, control 1), two of its subcontrols, a moved question. */
async function movedItems() {
  const control = await one<{ id: number }>(
    `SELECT cs.id FROM controls_struct_eu cs
       JOIN controlcategories_struct_eu cc ON cc.id = cs.control_category_id
      WHERE cc.framework_id = 1 AND cc.order_no = 1 AND cs.order_no = 1`,
  );
  const subcontrols = await select<{ id: number }>(
    `SELECT id FROM subcontrols_struct_eu WHERE control_id = :id ORDER BY order_no, id`,
    { id: control.id },
  );
  const question = await one<{ id: number }>(
    `SELECT id FROM questions_struct_eu WHERE moved_to_framework_id = :fw ORDER BY id LIMIT 1`,
    { fw: EU_AI_ACT_ORGANIZATION },
  );
  return {
    control: control.id,
    sub1: subcontrols[0].id,
    sub2: subcontrols[1].id,
    question: question.id,
  };
}

/** A use case with EU AI Act and hidden rows for the moved items, as before the split. */
async function legacyUseCase(
  orgId: number,
  title: string,
  isDemo: boolean,
  items: Awaited<ReturnType<typeof movedItems>>,
  work: {
    control?: Record<string, unknown>;
    sub1?: Record<string, unknown>;
    sub2?: Record<string, unknown>;
    answer?: Record<string, unknown>;
  },
) {
  const project = await one<{ id: number; uc_id: string }>(
    `INSERT INTO projects (organization_id, project_title, uc_id, start_date, is_demo)
     VALUES (:orgId, :title, 'UC-' || nextval('project_uc_id_seq'), NOW(), :isDemo)
     RETURNING id, uc_id`,
    { orgId, title, isDemo },
  );
  const pfId = await createTestProjectFramework(orgId, project.id, EU_AI_ACT);
  const insertRow = async (table: string, base: Record<string, unknown>, extra = {}) => {
    const values = { ...base, ...extra };
    const columns = Object.keys(values);
    return (
      await one<{ id: number }>(
        `INSERT INTO ${table} (${columns.join(", ")})
         VALUES (${columns.map((c) => `:${c}`).join(", ")}) RETURNING id`,
        values,
      )
    ).id;
  };
  const control = await insertRow(
    "controls_eu",
    {
      organization_id: orgId,
      control_meta_id: items.control,
      projects_frameworks_id: pfId,
      status: "Waiting",
    },
    work.control,
  );
  const sub1 = await insertRow(
    "subcontrols_eu",
    {
      organization_id: orgId,
      control_id: control,
      subcontrol_meta_id: items.sub1,
      status: "Waiting",
    },
    work.sub1,
  );
  const sub2 = await insertRow(
    "subcontrols_eu",
    {
      organization_id: orgId,
      control_id: control,
      subcontrol_meta_id: items.sub2,
      status: "Waiting",
    },
    work.sub2,
  );
  const assessment = await insertRow("assessments", {
    organization_id: orgId,
    projects_frameworks_id: pfId,
  });
  const answer = await insertRow(
    "answers_eu",
    {
      organization_id: orgId,
      assessment_id: assessment,
      question_id: items.question,
      status: "Not started",
    },
    work.answer,
  );
  return {
    projectId: project.id,
    label: `${title} (${project.uc_id})`,
    control,
    sub1,
    sub2,
    answer,
  };
}

async function link(
  orgId: number,
  fileId: number,
  entityType: string,
  entityId: number,
  linkType = "evidence",
) {
  await sequelize.query(
    `INSERT INTO file_entity_links (organization_id, file_id, framework_type, entity_type, entity_id, link_type)
     VALUES (:orgId, :fileId, 'eu_ai_act', :entityType, :entityId, :linkType)`,
    { replacements: { orgId, fileId, entityType, entityId, linkType } },
  );
}

/** The organizational project's framework-29 rows for the moved items. */
async function organizationRows(orgId: number, items: Awaited<ReturnType<typeof movedItems>>) {
  const pf = await one<{ id: number; project_id: number }>(
    `SELECT pf.id, pf.project_id FROM projects_frameworks pf
       JOIN projects p ON p.id = pf.project_id
      WHERE pf.organization_id = :orgId AND pf.framework_id = :fw AND p.is_organizational = true`,
    { orgId, fw: EU_AI_ACT_ORGANIZATION },
  );
  const control = await one<any>(
    `SELECT * FROM controls_eu WHERE projects_frameworks_id = :pf AND control_meta_id = :meta`,
    { pf: pf.id, meta: items.control },
  );
  const subcontrol = (meta: number) =>
    one<any>(
      `SELECT s.* FROM subcontrols_eu s WHERE s.control_id = :control AND s.subcontrol_meta_id = :meta`,
      { control: control.id, meta },
    );
  const answer = await one<any>(
    `SELECT ans.* FROM answers_eu ans JOIN assessments a ON a.id = ans.assessment_id
      WHERE a.projects_frameworks_id = :pf AND ans.question_id = :question`,
    { pf: pf.id, question: items.question },
  );
  return {
    projectId: pf.project_id,
    control,
    sub1: await subcontrol(items.sub1),
    sub2: await subcontrol(items.sub2),
    answer,
  };
}

/** Everything the migration writes, to compare a re-run against. */
const snapshot = (orgId: number) =>
  Promise.all([
    select(`SELECT * FROM controls_eu WHERE organization_id = :orgId ORDER BY id`, { orgId }),
    select(`SELECT * FROM subcontrols_eu WHERE organization_id = :orgId ORDER BY id`, { orgId }),
    select(`SELECT * FROM answers_eu WHERE organization_id = :orgId ORDER BY id`, { orgId }),
    select(
      `SELECT file_id, entity_type, entity_id, link_type FROM file_entity_links WHERE organization_id = :orgId ORDER BY id`,
      { orgId },
    ),
    select(
      `SELECT * FROM controls_eu__risks WHERE organization_id = :orgId ORDER BY control_id, projects_risks_id`,
      { orgId },
    ),
    select(
      `SELECT * FROM subcontrols_eu__risks WHERE organization_id = :orgId ORDER BY subcontrol_id, projects_risks_id`,
      { orgId },
    ),
    select(
      `SELECT * FROM answers_eu__risks WHERE organization_id = :orgId ORDER BY answer_id, projects_risks_id`,
      { orgId },
    ),
    select(`SELECT id FROM control_eu_change_history WHERE organization_id = :orgId ORDER BY id`, {
      orgId,
    }),
    select(
      `SELECT id FROM subcontrol_eu_change_history WHERE organization_id = :orgId ORDER BY id`,
      { orgId },
    ),
    select(
      `SELECT id, user_id, title FROM notifications WHERE organization_id = :orgId ORDER BY id`,
      { orgId },
    ),
  ]);

describe("EU AI Act (organization) copy-forward migration", () => {
  it("copies the most advanced work, unions links, notes history and tells each Admin once", async () => {
    const items = await movedItems();
    const orgId = await createTestOrganization();
    const germanAdmin = await createTestUser(orgId, 1, email("admin-de"), "Pw123456!");
    const englishAdmin = await createTestUser(orgId, 1, email("admin-en"), "Pw123456!");
    const editor = await createTestUser(orgId, 3, email("editor"), "Pw123456!");
    await sequelize.query(
      `INSERT INTO user_preferences (user_id, language) VALUES (:germanAdmin, 'de')`,
      { replacements: { germanAdmin } },
    );
    // A user of another organization, who is not a member of this one.
    const stranger = await createTestUser(
      await createTestOrganization(),
      1,
      email("gone"),
      "Pw123456!",
    );

    const a = await legacyUseCase(orgId, "Claims triage", false, items, {
      control: { status: "In progress", owner: editor, implementation_details: "A control" },
      sub1: { status: "In progress", implementation_details: "A sub" },
      answer: { status: "In progress", answer: "A answer" },
    });
    const b = await legacyUseCase(orgId, "Fraud scoring", false, items, {
      control: {
        status: "Done",
        owner: stranger,
        reviewer: editor,
        implementation_details: "B control",
      },
      sub1: { status: "Done", implementation_details: "B sub", owner: stranger, approver: editor },
      answer: { status: "Done", answer: "B answer" },
    });
    // A demo use case's work is never copied, however advanced.
    const demo = await legacyUseCase(orgId, "Demo", true, items, {
      sub2: { status: "Done", implementation_details: "demo" },
    });

    const files = await Promise.all(
      ["a1", "b1", "b2", "a-answer", "demo"].map((name) =>
        createTestFile(orgId, editor, { filename: `${name}.pdf` }),
      ),
    );
    await link(orgId, files[0], "subcontrol", a.sub1);
    await link(orgId, files[1], "subcontrol", b.sub1);
    await link(orgId, files[2], "subcontrol", b.sub1, "feedback");
    await link(orgId, files[3], "assessment", a.answer);
    await link(orgId, files[4], "subcontrol", demo.sub2);

    const [riskA, riskB, riskAnswer] = await Promise.all(
      [1, 2, 3].map(() => createTestRisk(orgId)),
    );
    await sequelize.query(
      `INSERT INTO controls_eu__risks (organization_id, control_id, projects_risks_id) VALUES (:orgId, :c, :r)`,
      { replacements: { orgId, c: a.control, r: riskA } },
    );
    await sequelize.query(
      `INSERT INTO subcontrols_eu__risks (organization_id, subcontrol_id, projects_risks_id) VALUES (:orgId, :s, :r)`,
      { replacements: { orgId, s: b.sub1, r: riskB } },
    );
    await sequelize.query(
      `INSERT INTO answers_eu__risks (organization_id, answer_id, projects_risks_id) VALUES (:orgId, :ans, :r)`,
      { replacements: { orgId, ans: a.answer, r: riskAnswer } },
    );
    const hiddenBefore = await select(
      `SELECT * FROM subcontrols_eu WHERE id IN (:ids) ORDER BY id`,
      { ids: [a.sub1, b.sub1, demo.sub2] },
    );

    await runMigrations();
    const org = await organizationRows(orgId, items);

    // The subcontrol takes the Done one (B); a user outside the organization is dropped.
    expect(org.sub1).toMatchObject({
      status: "Done",
      implementation_details: "B sub",
      owner: null,
      approver: editor,
      copied_from_project_id: b.projectId,
    });
    // Nothing to copy: only the demo use case worked on it.
    expect(org.sub2).toMatchObject({
      status: "Waiting",
      implementation_details: null,
      copied_from_project_id: null,
    });
    // The control takes B's fields, its status derived from its subcontrols.
    expect(org.control).toMatchObject({
      status: "In progress",
      owner: null,
      reviewer: editor,
      implementation_details: "B control",
      copied_from_project_id: b.projectId,
    });
    expect(org.answer).toMatchObject({
      status: "Done",
      answer: "B answer",
      copied_from_project_id: b.projectId,
    });

    // Every non-demo use case's files and risks, not only the chosen one's.
    const fileLinks = await select<{
      file_id: number;
      entity_type: string;
      entity_id: number;
      link_type: string;
    }>(
      `SELECT file_id, entity_type, entity_id, link_type FROM file_entity_links
        WHERE organization_id = :orgId AND entity_id IN (:ids) ORDER BY file_id`,
      { orgId, ids: [org.sub1.id, org.sub2.id, org.answer.id] },
    );
    expect(fileLinks).toEqual([
      {
        file_id: files[0],
        entity_type: "subcontrol",
        entity_id: org.sub1.id,
        link_type: "evidence",
      },
      {
        file_id: files[1],
        entity_type: "subcontrol",
        entity_id: org.sub1.id,
        link_type: "evidence",
      },
      {
        file_id: files[2],
        entity_type: "subcontrol",
        entity_id: org.sub1.id,
        link_type: "feedback",
      },
      {
        file_id: files[3],
        entity_type: "assessment",
        entity_id: org.answer.id,
        link_type: "evidence",
      },
    ]);
    expect(
      await select(`SELECT projects_risks_id FROM controls_eu__risks WHERE control_id = :id`, {
        id: org.control.id,
      }),
    ).toEqual([{ projects_risks_id: riskA }]);
    expect(
      await select(
        `SELECT projects_risks_id FROM subcontrols_eu__risks WHERE subcontrol_id = :id`,
        { id: org.sub1.id },
      ),
    ).toEqual([{ projects_risks_id: riskB }]);
    expect(
      await select(`SELECT projects_risks_id FROM answers_eu__risks WHERE answer_id = :id`, {
        id: org.answer.id,
      }),
    ).toEqual([{ projects_risks_id: riskAnswer }]);

    const history = (table: string, column: string, id: number) =>
      select(
        `SELECT action, field_name, old_value, new_value, changed_by_user_id, changed_by_system
           FROM ${table} WHERE ${column} = :id`,
        { id },
      );
    const note = {
      action: "updated",
      field_name: "Copied from use case",
      old_value: null,
      new_value: b.label,
      changed_by_user_id: null,
      changed_by_system: true,
    };
    expect(await history("control_eu_change_history", "control_eu_id", org.control.id)).toEqual([
      note,
    ]);
    expect(await history("subcontrol_eu_change_history", "subcontrol_eu_id", org.sub1.id)).toEqual([
      note,
    ]);
    expect(await history("subcontrol_eu_change_history", "subcontrol_eu_id", org.sub2.id)).toEqual(
      [],
    );

    // One notice per Admin, in their language; the Editor gets none.
    const project = (await one<{ project_title: string }>(
      `SELECT project_title FROM projects WHERE id = :id`,
      { id: org.projectId },
    ))!.project_title;
    const notices = await select<any>(
      `SELECT user_id, type, title, message, entity_type, entity_id, entity_name, action_url, metadata
         FROM notifications WHERE organization_id = :orgId ORDER BY user_id`,
      { orgId },
    );
    const expected = (lang: "en" | "de", userId: number) => {
      const t = getTranslator(lang);
      return {
        user_id: userId,
        type: "system",
        title: t(EU_AI_ACT_ORGANIZATION_MOVED_NOTICE.titleKey),
        message: t(EU_AI_ACT_ORGANIZATION_MOVED_NOTICE.many.messageKey, { project, copied: 2 }),
        entity_type: "project",
        entity_id: org.projectId,
        entity_name: project,
        action_url: "/framework?framework=eu-ai-act-organization",
        metadata: { notice: "eu_ai_act_organization_moved" },
      };
    };
    expect(notices).toEqual(
      [expected("de", germanAdmin), expected("en", englishAdmin)].sort(
        (x, y) => x.user_id - y.user_id,
      ),
    );
    expect(notices.find((n) => n.user_id === germanAdmin).title).toBe(
      "Organisationsweite Pflichten des EU AI Act verschoben",
    );
    expect(notices.find((n) => n.user_id === englishAdmin).message).toContain(
      "2 items were copied from your use cases",
    );

    // The hidden rows are left as they were.
    expect(
      await select(`SELECT * FROM subcontrols_eu WHERE id IN (:ids) ORDER BY id`, {
        ids: [a.sub1, b.sub1, demo.sub2],
      }),
    ).toEqual(hiddenBefore);

    // The File Manager shows the copied links, not the hidden rows' ones.
    const listed: Array<{ id: number; entity_links?: any[] }> = [
      { id: files[1] },
      { id: files[4] },
    ];
    await attachLinkProjections(orgId, listed);
    expect(listed[0].entity_links!.map((l) => l.entity_id)).toEqual([org.sub1.id]);
    // The demo use case's file was not copied and its hidden link is not shown.
    expect(listed[1].entity_links).toEqual([]);

    // Links to a hidden row open the organizational row of the same item.
    const base = "https://app.example";
    const organizationPage = `${base}/framework?framework=eu-ai-act-organization`;
    expect(await buildEntityUrlAsync(base, "eu_control", a.control, orgId)).toBe(
      `${organizationPage}&subtab=compliance&controlId=${org.control.id}`,
    );
    expect(await buildEntityUrlAsync(base, "eu_subcontrol", b.sub1, orgId)).toBe(
      `${organizationPage}&subtab=compliance&controlId=${org.control.id}&subControlId=${org.sub1.id}`,
    );
    expect(await buildEntityUrlAsync(base, "eu_subcontrol", org.sub1.id, orgId)).toBe(
      `${organizationPage}&subtab=compliance&controlId=${org.control.id}&subControlId=${org.sub1.id}`,
    );
    const assessmentUrl = (await buildEntityUrlAsync(base, "eu_assessment", a.answer, orgId)) ?? "";
    const assessmentPrefix = `${organizationPage}&subtab=assessment&topicId=`;
    expect(assessmentUrl.startsWith(assessmentPrefix)).toBe(true);
    expect(assessmentUrl.slice(assessmentPrefix.length)).toMatch(
      new RegExp(`^\\d+&questionId=${items.question}$`),
    );

    // A re-run changes nothing.
    const before = await snapshot(orgId);
    await runMigrations();
    expect(await snapshot(orgId)).toEqual(before);

    // The source use case is named only to a viewer who can see it.
    const outsider = await createTestUser(orgId, 3, email("outsider"), "Pw123456!");
    const labelFor = async (viewer?: { userId: number; role: string }) => {
      const [control] = await getControlByIdQuery(org.control.id, orgId, null, viewer);
      return control as { copied_from_project_id: number; copied_from_use_case: string | null };
    };
    expect((await labelFor({ userId: germanAdmin, role: "Admin" })).copied_from_use_case).toMatch(
      /^Fraud scoring/,
    );
    expect(await labelFor({ userId: outsider, role: "Editor" })).toMatchObject({
      copied_from_project_id: b.projectId,
      copied_from_use_case: null,
    });
    expect((await labelFor()).copied_from_use_case).toBeNull();
    await sequelize.query(
      `INSERT INTO projects_members (organization_id, project_id, user_id) VALUES (:orgId, :p, :u)`,
      { replacements: { orgId, p: b.projectId, u: outsider } },
    );
    expect((await labelFor({ userId: outsider, role: "Editor" })).copied_from_use_case).toMatch(
      /^Fraud scoring/,
    );
  });

  it("leaves rows already worked on, and sends the no-copy notice when nothing was copied", async () => {
    const items = await movedItems();
    const orgId = await createTestOrganization();
    const admin = await createTestUser(orgId, 1, email("admin"), "Pw123456!");
    const uc = await legacyUseCase(orgId, "Hiring", false, items, {
      sub1: { status: "Done", implementation_details: "use case work" },
    });
    const evidence = await createTestFile(orgId, admin, { filename: "hiring.pdf" });
    await link(orgId, evidence, "subcontrol", uc.sub1);
    await split.up({ sequelize });

    // Someone already worked on the organizational subcontrol.
    const org = await organizationRows(orgId, items);
    await sequelize.query(
      `UPDATE subcontrols_eu SET implementation_details = 'org work' WHERE id = :id`,
      { replacements: { id: org.sub1.id } },
    );
    await copyForward.up({ sequelize });

    const after = await organizationRows(orgId, items);
    expect(after.sub1).toMatchObject({
      status: "Waiting",
      implementation_details: "org work",
      copied_from_project_id: null,
    });
    expect(after.control.copied_from_project_id).toBeNull();
    expect(uc.projectId).toBeGreaterThan(0);
    // Its fields are kept, but the hidden row's file is linked to it, since
    // links to hidden rows no longer show anywhere.
    expect(
      await select(
        `SELECT file_id FROM file_entity_links
          WHERE organization_id = :orgId AND entity_type = 'subcontrol' AND entity_id = :id`,
        { orgId, id: after.sub1.id },
      ),
    ).toEqual([{ file_id: evidence }]);

    const [notice] = await select<{ user_id: number; message: string }>(
      `SELECT user_id, message FROM notifications WHERE organization_id = :orgId`,
      { orgId },
    );
    expect(notice.user_id).toBe(admin);
    expect(notice.message).not.toContain("copied");
    expect(notice.message).toContain("Review them on the Frameworks page.");
  });

  it("ranks controls on their fields, not on the status derived from their subcontrols", async () => {
    const items = await movedItems();
    const orgId = await createTestOrganization();
    await createTestUser(orgId, 1, email("admin"), "Pw123456!");
    // Older use case: the control has text but its subcontrols were never done.
    const written = await legacyUseCase(orgId, "Credit", false, items, {
      control: { status: "Waiting", implementation_details: "Credit control text" },
    });
    // Newer use case: every subcontrol done, so its control reads Done, but empty.
    await legacyUseCase(orgId, "Hiring", false, items, {
      control: { status: "Done" },
      sub1: { status: "Done", implementation_details: "Hiring sub" },
    });
    await runMigrations();

    const org = await organizationRows(orgId, items);
    expect(org.control).toMatchObject({
      implementation_details: "Credit control text",
      copied_from_project_id: written.projectId,
      status: "In progress",
    });
    expect(org.sub1).toMatchObject({ status: "Done", implementation_details: "Hiring sub" });
  });

  it("derives and marks a control already worked on when its subcontrols are copied", async () => {
    const items = await movedItems();
    const orgId = await createTestOrganization();
    const admin = await createTestUser(orgId, 1, email("admin"), "Pw123456!");
    const uc = await legacyUseCase(orgId, "Hiring", false, items, {
      sub1: { status: "Done", implementation_details: "use case work" },
      sub2: { status: "Done", implementation_details: "more work" },
    });
    await split.up({ sequelize });
    const before = await organizationRows(orgId, items);
    await sequelize.query(`UPDATE controls_eu SET owner = :admin WHERE id = :id`, {
      replacements: { admin, id: before.control.id },
    });
    await copyForward.up({ sequelize });

    const after = await organizationRows(orgId, items);
    expect(after.sub1).toMatchObject({ status: "Done", copied_from_project_id: uc.projectId });
    expect(after.control).toMatchObject({
      owner: admin,
      implementation_details: null,
      copied_from_project_id: uc.projectId,
    });
    // Two of its subcontrols are copied Done; the control follows them.
    const statuses = await select<{ status: string }>(
      `SELECT status FROM subcontrols_eu WHERE control_id = :id`,
      { id: after.control.id },
    );
    expect(after.control.status).toBe(
      statuses.every((r) => r.status === "Done") ? "Done" : "In progress",
    );
    const [notice] = await select<{ message: string }>(
      `SELECT message FROM notifications WHERE organization_id = :orgId`,
      { orgId },
    );
    expect(notice.message).toContain("1 item was copied from your use cases");

    // A re-run changes nothing.
    const snap = await snapshot(orgId);
    await copyForward.up({ sequelize });
    expect(await snapshot(orgId)).toEqual(snap);
  });
});
