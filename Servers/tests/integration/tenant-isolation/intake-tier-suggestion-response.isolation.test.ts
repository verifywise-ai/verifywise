jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "../helpers";
import {
  getTierSuggestionResponseQuery,
  setTierSuggestionResponseQuery,
  type TierSuggestionResponse,
} from "../../../utils/intakeTierSuggestion.utils";

/**
 * intake_submissions.tier_suggestion_response (#5190): the applicant's response
 * to the suggested risk level. Written with the submission and read by
 * reviewers, always scoped to the submission's organization.
 */
const seedSubmission = async (orgId: number, userId: number, suffix: string) => {
  const [{ id: formId }] = await sequelize.query<{ id: number }>(
    `INSERT INTO intake_forms (organization_id, name, description, slug, entity_type, created_by)
     VALUES (:orgId, :slug, '', :slug, 'use_case', :userId)
     RETURNING id`,
    { replacements: { orgId, userId, slug: `tier-${suffix}` }, type: QueryTypes.SELECT },
  );
  const [{ id }] = await sequelize.query<{ id: number }>(
    `INSERT INTO intake_submissions (organization_id, form_id, entity_type)
     VALUES (:orgId, :formId, 'use_case')
     RETURNING id`,
    { replacements: { orgId, formId }, type: QueryTypes.SELECT },
  );
  return id;
};

const RESPONSE: TierSuggestionResponse = {
  suggestedLevel: "High risk",
  questionnaireVersion: 2,
  accepted: false,
  context: "We only rank internal staff.",
  respondedAt: "2026-10-31T10:00:00.000Z",
};

describe("intake tier suggestion response", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("stores and reads the response in the submission's organization only", async () => {
    const suffix = String(Date.now());
    const orgA = await createTestOrganization(`Tier A ${suffix}`);
    const orgB = await createTestOrganization(`Tier B ${suffix}`);
    const userA = await createTestUser(orgA, 1, `tier-a-${suffix}@test.com`, "Password123!");
    const submissionId = await seedSubmission(orgA, userA, suffix);

    expect(await getTierSuggestionResponseQuery(submissionId, orgA)).toBeNull();

    const t = await sequelize.transaction();
    await setTierSuggestionResponseQuery(submissionId, orgA, RESPONSE, t);
    await t.commit();

    expect(await getTierSuggestionResponseQuery(submissionId, orgA)).toEqual(RESPONSE);
    // Another organization neither reads it nor sees the submission.
    expect(await getTierSuggestionResponseQuery(submissionId, orgB)).toBeUndefined();

    const t2 = await sequelize.transaction();
    await setTierSuggestionResponseQuery(submissionId, orgB, { ...RESPONSE, accepted: true }, t2);
    await t2.commit();
    expect((await getTierSuggestionResponseQuery(submissionId, orgA))?.accepted).toBe(false);
  });
});
