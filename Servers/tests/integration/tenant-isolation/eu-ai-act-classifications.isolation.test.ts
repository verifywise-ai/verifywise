jest.setTimeout(60000);

import { cleanupDatabase, seedFrameworks } from "../helpers";
import { createTestProject, createTestProjectFramework } from "../../factories";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { EU_AI_ACT_FRAMEWORK_ID } from "../../../utils/validations/projectValidation.utils";
import {
  getLatestRunForUseCaseQuery,
  insertClassificationRunQuery,
} from "../../../utils/euAiActClassification.utils";

/**
 * eu_ai_act_classifications — a run written for org A is never returned for
 * org B, even when B asks for A's use case id.
 */
describe("eu_ai_act_classifications tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("returns a use case's run only to its own organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    // createTestProject returns the new project's id.
    const projectId = await createTestProject(owner.orgId, owner.userId);

    await insertClassificationRunQuery(
      {
        useCaseId: projectId,
        intakeSubmissionId: null,
        questionnaireVersion: 2,
        role: "Deployer",
        answers: { scope: "research_only" },
        result: {
          questionnaireVersion: 2,
          level: "Out of scope",
          role: null,
          reasons: [],
          obligations: [],
        },
        reviewerLevel: null,
        reviewerJustification: null,
        reviewedBy: null,
        source: "wizard",
        createdBy: owner.userId,
      },
      owner.orgId,
    );

    expect((await getLatestRunForUseCaseQuery(projectId, owner.orgId))?.result.level).toBe(
      "Out of scope",
    );
    expect(await getLatestRunForUseCaseQuery(projectId, attacker.orgId)).toBeNull();
  });

  it("route: the owner can read the classification, another organization gets 404", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    // Positive control first, so a missing route cannot pass as "isolated".
    expect(
      (await owner.request.get(`/api/projects/${projectId}/eu-ai-act-classification`)).status,
    ).toBe(200);
    expect(
      (await attacker.request.get(`/api/projects/${projectId}/eu-ai-act-classification`)).status,
    ).toBe(404);
  });

  it("route: an Editor can classify; Reviewer and Auditor cannot", async () => {
    await seedFrameworks();
    const editor = (await seedTwoTenantContexts(3)).owner;
    const editorProject = await createTestProject(editor.orgId, editor.userId);
    await createTestProjectFramework(editor.orgId, editorProject, EU_AI_ACT_FRAMEWORK_ID);
    const ok = await editor.request
      .post(`/api/projects/${editorProject}/eu-ai-act-classification`)
      .send({ answers: { scope: "research_only" } });
    expect(ok.status).toBe(200);

    for (const roleId of [2, 4]) {
      await cleanupDatabase();
      await seedFrameworks();
      const { owner } = await seedTwoTenantContexts(roleId);
      const projectId = await createTestProject(owner.orgId, owner.userId);
      await createTestProjectFramework(owner.orgId, projectId, EU_AI_ACT_FRAMEWORK_ID);
      const denied = await owner.request
        .post(`/api/projects/${projectId}/eu-ai-act-classification`)
        .send({ answers: { scope: "research_only" } });
      expect(denied.status).toBe(403);
    }
  });

  it("route: a use case without the EU AI Act framework cannot be classified", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const res = await owner.request
      .post(`/api/projects/${projectId}/eu-ai-act-classification`)
      .send({ answers: { scope: "research_only" } });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("AI_RISK_WITHOUT_EU_AI_ACT");
  });
});
