jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { createTestProject } from "../../factories";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
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
});
