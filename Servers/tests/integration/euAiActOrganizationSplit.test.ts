jest.setTimeout(60000);

/**
 * The organization-wide EU AI Act controls and assessment questions live in
 * EU AI Act (organization), framework 29. The use-case EU AI Act (framework 1)
 * no longer creates them, and rows a use case already has for them stay in the
 * database but are not counted or listed.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestProjectFramework } from "../factories";
import { EU_AI_ACT_ORGANIZATION_CONTROLS } from "../../structures";
import {
  countAnswersEUByProjectId,
  countSubControlsEUByProjectId,
  createEUAIActOrganizationFrameworkQuery,
  createNewAssessmentEUQuery,
  createNewControlsQuery,
  getAssessmentsEUByProjectIdQuery,
  getUseCaseAssessmentTopicsQuery,
  getAllControlCategoriesQuery,
  getComplianceEUByProjectIdQuery,
  getVisibleEuCategoryIdsForProject,
} from "../../utils/eu.utils";

const EU_AI_ACT_FRAMEWORK_ID = 1;
const EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID = 29;
/** Categories every control of which moved. */
const MOVED_CATEGORY_ORDER_NOS = [0, 1, 15];

beforeAll(async () => {
  await seedFrameworks();
});

afterEach(async () => {
  await cleanupDatabase();
});

const select = <T>(sql: string, replacements: Record<string, unknown> = {}) =>
  sequelize.query(sql, { replacements, type: QueryTypes.SELECT }) as Promise<T[]>;

async function movedCategoryIds(): Promise<number[]> {
  const rows = await select<{ id: number }>(
    `SELECT id FROM controlcategories_struct_eu
      WHERE framework_id = 1 AND order_no IN (:orders)`,
    { orders: MOVED_CATEGORY_ORDER_NOS },
  );
  return rows.map((r) => r.id);
}

/** A use case with the EU AI Act, its controls created as on a real add. */
async function euUseCase(tier: string, roles: string[]) {
  const orgId = await createTestOrganization();
  const userId = await createTestUser(orgId, 1, `eu-split-${Date.now()}@example.com`, "Passw0rd!");
  const [{ id: projectId }] = await select<{ id: number }>(
    `INSERT INTO projects
       (project_title, owner, start_date, ai_risk_classification, high_risk_roles,
        goal, last_updated, last_updated_by, organization_id)
     VALUES ('EU split', :userId, NOW(), :tier, CAST(:roles AS text[]),
             'goal', NOW(), :userId, :orgId)
     RETURNING id`,
    { userId, orgId, tier, roles: `{${roles.join(",")}}` },
  );
  const projectFrameworkId = await createTestProjectFramework(
    orgId,
    projectId,
    EU_AI_ACT_FRAMEWORK_ID,
  );
  await sequelize.transaction(async (transaction) => {
    await createNewAssessmentEUQuery({ project_id: projectId }, false, orgId, transaction, false);
    await createNewControlsQuery(projectId, false, orgId, transaction, false);
  });
  return { orgId, projectId, projectFrameworkId };
}

/** The question ids an assessment tree lists. */
const listedQuestionIds = (topics: any[]) =>
  topics.flatMap((topic) =>
    (topic.dataValues?.subTopics ?? []).flatMap((subtopic: any) =>
      (subtopic.dataValues?.questions ?? []).map((q: any) => q.question_id),
    ),
  );

/** EU AI Act questions moved to framework 29. */
const movedQuestions = () =>
  select<{ id: number; topic: number; subtopic: number; question: number }>(
    `SELECT q.id, t.order_no AS topic, st.order_no AS subtopic, q.order_no AS question
       FROM questions_struct_eu q
       JOIN subtopics_struct_eu st ON st.id = q.subtopic_id
       JOIN topics_struct_eu t ON t.id = st.topic_id
      WHERE q.moved_to_framework_id = :frameworkId
      ORDER BY t.order_no, st.order_no, q.order_no`,
    { frameworkId: EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID },
  );

describe("EU AI Act controls moved to EU AI Act (organization)", () => {
  it("marks exactly the listed controls as moved to framework 29", async () => {
    const rows = await select<{ category: number; control: number; moved: number | null }>(
      `SELECT cc.order_no AS category, cs.order_no AS control, cs.moved_to_framework_id AS moved
         FROM controls_struct_eu cs
         JOIN controlcategories_struct_eu cc ON cc.id = cs.control_category_id
        WHERE cc.framework_id = 1`,
    );
    const isListed = (category: number, control: number) =>
      (EU_AI_ACT_ORGANIZATION_CONTROLS[category] ?? []).includes(control);

    expect(rows.filter((r) => r.moved !== null)).toHaveLength(18);
    for (const row of rows) {
      expect(row.moved).toBe(
        isListed(row.category, row.control) ? EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID : null,
      );
    }
  });

  it("creates no rows for moved controls when the EU AI Act is added to a use case", async () => {
    const { projectFrameworkId } = await euUseCase("High risk", ["Provider", "Deployer"]);

    const [{ created, moved, expected }] = await select<{
      created: number;
      moved: number;
      expected: number;
    }>(
      `SELECT COUNT(*)::int AS created,
              COUNT(*) FILTER (WHERE cs.moved_to_framework_id IS NOT NULL)::int AS moved,
              (SELECT COUNT(*)::int FROM controls_struct_eu WHERE moved_to_framework_id IS NULL) AS expected
         FROM controls_eu c
         JOIN controls_struct_eu cs ON cs.id = c.control_meta_id
        WHERE c.projects_frameworks_id = :projectFrameworkId`,
      { projectFrameworkId },
    );
    expect(moved).toBe(0);
    expect(created).toBe(expected);
  });

  it("keeps a use case's existing rows for moved controls but no longer counts or lists them", async () => {
    const { orgId, projectFrameworkId } = await euUseCase("High risk", ["Provider", "Deployer"]);
    const before = await countSubControlsEUByProjectId(projectFrameworkId, orgId);

    // A row the use case got before the split: AI literacy, with a done subcontrol.
    const [movedControl] = await select<{ id: number }>(
      `SELECT cs.id FROM controls_struct_eu cs
         JOIN controlcategories_struct_eu cc ON cc.id = cs.control_category_id
        WHERE cc.framework_id = 1 AND cc.order_no = 1 AND cs.order_no = 1`,
    );
    const [{ id: controlId }] = await select<{ id: number }>(
      `INSERT INTO controls_eu (organization_id, control_meta_id, status, projects_frameworks_id)
       VALUES (:orgId, :meta, 'Done', :projectFrameworkId) RETURNING id`,
      { orgId, meta: movedControl.id, projectFrameworkId },
    );
    await sequelize.query(
      `INSERT INTO subcontrols_eu (organization_id, control_id, subcontrol_meta_id, status)
       SELECT :orgId, :controlId, id, 'Done' FROM subcontrols_struct_eu WHERE control_id = :meta`,
      { replacements: { orgId, controlId, meta: movedControl.id } },
    );

    expect(await countSubControlsEUByProjectId(projectFrameworkId, orgId)).toEqual(before);

    const compliance = (await getComplianceEUByProjectIdQuery(projectFrameworkId, orgId)) as any[];
    const listedControlIds = compliance.flatMap((category) =>
      (category.dataValues?.controls ?? category.controls ?? []).map((c: any) => c.id),
    );
    expect(listedControlIds.length).toBeGreaterThan(0);
    expect(listedControlIds).not.toContain(controlId);

    const [kept] = await select<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM subcontrols_eu WHERE control_id = :controlId`,
      { controlId },
    );
    expect(kept.n).toBeGreaterThan(0);
  });

  it("no longer shows the categories whose controls all moved", async () => {
    const moved = await movedCategoryIds();
    expect(moved).toHaveLength(MOVED_CATEGORY_ORDER_NOS.length);

    const highRisk = await euUseCase("High risk", ["Provider", "Deployer"]);
    const prohibited = await euUseCase("Prohibited", []);
    const highRiskVisible = await getVisibleEuCategoryIdsForProject(
      highRisk.projectFrameworkId,
      highRisk.orgId,
    );

    expect(highRiskVisible.length).toBeGreaterThan(0);
    for (const id of moved) expect(highRiskVisible).not.toContain(id);
    // Prohibited showed only prohibited practices and AI literacy, both moved.
    expect(
      await getVisibleEuCategoryIdsForProject(prohibited.projectFrameworkId, prohibited.orgId),
    ).toEqual([]);

    const allCategoryIds = (await getAllControlCategoriesQuery(highRisk.orgId)).map((c) => c.id);
    for (const id of moved) expect(allCategoryIds).not.toContain(id);
  });
});

describe("EU AI Act assessment questions moved to EU AI Act (organization)", () => {
  it("marks exactly the listed questions as moved to framework 29", async () => {
    expect((await movedQuestions()).map((q) => `${q.topic}.${q.subtopic}.${q.question}`)).toEqual([
      "5.1.2",
      "8.1.1",
      "8.1.2",
      "8.1.3",
      "11.1.1",
    ]);
  });

  it("creates no answers to moved questions when the EU AI Act is added to a use case", async () => {
    const { orgId, projectFrameworkId } = await euUseCase("High risk", ["Provider"]);

    const [{ expected }] = await select<{ expected: number }>(
      `SELECT COUNT(*)::int AS expected FROM questions_struct_eu WHERE moved_to_framework_id IS NULL`,
    );
    const { totalAssessments } = await countAnswersEUByProjectId(projectFrameworkId, orgId);
    expect(Number(totalAssessments)).toBe(expected);
    const [{ moved }] = await select<{ moved: number }>(
      `SELECT COUNT(*)::int AS moved FROM answers_eu ans
         JOIN assessments a ON a.id = ans.assessment_id
         JOIN questions_struct_eu q ON q.id = ans.question_id
        WHERE a.projects_frameworks_id = :projectFrameworkId AND q.moved_to_framework_id IS NOT NULL`,
      { projectFrameworkId },
    );
    expect(moved).toBe(0);
  });

  it("keeps a use case's existing answers to moved questions but no longer counts or lists them", async () => {
    const { orgId, projectFrameworkId } = await euUseCase("High risk", ["Provider"]);
    const before = await countAnswersEUByProjectId(projectFrameworkId, orgId);

    // An answer the use case got before the move, already done.
    const [moved] = await movedQuestions();
    const [{ id: answerId }] = await select<{ id: number }>(
      `INSERT INTO answers_eu (organization_id, assessment_id, question_id, answer, status)
       SELECT :orgId, a.id, :questionId, 'Our AI values', 'Done'
         FROM assessments a WHERE a.projects_frameworks_id = :projectFrameworkId
       RETURNING id`,
      { orgId, questionId: moved.id, projectFrameworkId },
    );

    expect(await countAnswersEUByProjectId(projectFrameworkId, orgId)).toEqual(before);
    const listed = listedQuestionIds(
      (await getAssessmentsEUByProjectIdQuery(projectFrameworkId, orgId)) as any[],
    );
    expect(listed.length).toBeGreaterThan(0);
    expect(listed).not.toContain(moved.id);
    const [kept] = await select<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM answers_eu WHERE id = :answerId`,
      { answerId },
    );
    expect(kept.n).toBe(1);
  });

  it("answers them in the assessment of EU AI Act (organization) on the organizational project", async () => {
    const orgId = await createTestOrganization();
    const [{ id: projectId }] = await select<{ id: number }>(
      `INSERT INTO projects (organization_id, project_title, start_date, is_organizational)
       VALUES (:orgId, 'Org', NOW(), true) RETURNING id`,
      { orgId },
    );
    const projectFrameworkId = await createTestProjectFramework(
      orgId,
      projectId,
      EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID,
    );
    await sequelize.transaction((transaction) =>
      createEUAIActOrganizationFrameworkQuery(projectId, false, orgId, transaction),
    );

    const moved = (await movedQuestions()).map((q) => q.id);
    const listed = listedQuestionIds(
      (await getAssessmentsEUByProjectIdQuery(projectFrameworkId, orgId)) as any[],
    );
    expect([...listed].sort((a, b) => a - b)).toEqual([...moved].sort((a, b) => a - b));
    expect(await countAnswersEUByProjectId(projectFrameworkId, orgId)).toEqual({
      totalAssessments: String(moved.length),
      answeredAssessments: "0",
    });
  });

  it("shows the moved controls on the organizational project, with their EU AI Act numbers", async () => {
    const orgId = await createTestOrganization();
    const [{ id: projectId }] = await select<{ id: number }>(
      `INSERT INTO projects (organization_id, project_title, start_date, is_organizational)
       VALUES (:orgId, 'Org', NOW(), true) RETURNING id`,
      { orgId },
    );
    const projectFrameworkId = await createTestProjectFramework(
      orgId,
      projectId,
      EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID,
    );
    await sequelize.transaction((transaction) =>
      createEUAIActOrganizationFrameworkQuery(projectId, false, orgId, transaction),
    );

    // Every moved category shows, whatever the project's risk classification.
    const compliance = (await getComplianceEUByProjectIdQuery(projectFrameworkId, orgId)) as any[];
    const listed = compliance.flatMap((category) =>
      (category.dataValues?.controls ?? category.controls ?? []).map(
        (control: any) => `${category.order_no}.${control.order_no}`,
      ),
    );
    expect(listed).toEqual(
      Object.entries(EU_AI_ACT_ORGANIZATION_CONTROLS).flatMap(([category, controls]) =>
        controls.map((control) => `${category}.${control}`),
      ),
    );
    expect(await countSubControlsEUByProjectId(projectFrameworkId, orgId)).toEqual({
      totalSubcontrols: "42",
      doneSubcontrols: "0",
    });
  });

  it("no longer lists, for use cases, the topic whose questions all moved", async () => {
    const titles = ((await getUseCaseAssessmentTopicsQuery()) as any[]).map((t) => t.title);
    expect(titles).not.toContain("Conformity assessment");
    expect(titles).toContain("Transparency & user information");
    expect(titles).toContain("Accountability and governance");
  });
});
