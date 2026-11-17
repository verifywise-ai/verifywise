/**
 * Saving a monitoring cycle's answers upserts into
 * post_market_monitoring_responses. The ON CONFLICT target must match a
 * unique constraint that exists, or every save, flag and submit with answers
 * fails. The report is built inside the submit transaction, so its reads
 * must see answers saved in it before the commit.
 */
jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestProject } from "../factories";
import {
  getPMMResponsesQuery,
  savePMMResponsesQuery,
} from "../../utils/postMarketMonitoring.utils";

afterEach(async () => {
  await cleanupDatabase();
});

const insertId = async (sql: string, replacements: Record<string, unknown>): Promise<number> => {
  const rows = await sequelize.query<{ id: number }>(`${sql} RETURNING id`, {
    replacements,
    type: QueryTypes.SELECT,
  });
  return rows[0].id;
};

const seedCycle = async (orgId: number, projectId: number) => {
  const configId = await insertId(
    `INSERT INTO post_market_monitoring_configs (organization_id, project_id) VALUES (:orgId, :projectId)`,
    { orgId, projectId },
  );
  const questionId = await insertId(
    `INSERT INTO post_market_monitoring_questions (organization_id, config_id, question_text, question_type)
     VALUES (:orgId, :configId, 'Still performing as intended?', 'yes_no')`,
    { orgId, configId },
  );
  const cycleId = await insertId(
    `INSERT INTO post_market_monitoring_cycles (organization_id, config_id, cycle_number, status, due_at)
     VALUES (:orgId, :configId, 1, 'pending', NOW() + INTERVAL '7 days')`,
    { orgId, configId },
  );
  return { questionId, cycleId };
};

const storedAnswers = (cycleId: number) =>
  sequelize.query<{ question_id: number; response_value: unknown; is_flagged: boolean }>(
    `SELECT question_id, response_value, is_flagged FROM post_market_monitoring_responses
     WHERE cycle_id = :cycleId`,
    { replacements: { cycleId }, type: QueryTypes.SELECT },
  );

describe("saving monitoring cycle answers", () => {
  it("saves an answer and updates it on a second save", async () => {
    const { owner } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const { questionId, cycleId } = await seedCycle(owner.orgId, projectId);

    await savePMMResponsesQuery(
      cycleId,
      [{ question_id: questionId, response_value: true }],
      owner.orgId,
    );
    await savePMMResponsesQuery(
      cycleId,
      [{ question_id: questionId, response_value: false, is_flagged: true }],
      owner.orgId,
    );

    const rows = await storedAnswers(cycleId);
    expect(rows).toHaveLength(1);
    expect(rows[0].response_value).toBe(false);
    expect(rows[0].is_flagged).toBe(true);
  });

  it("reads answers saved in the same transaction before the commit", async () => {
    const { owner } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const { questionId, cycleId } = await seedCycle(owner.orgId, projectId);

    const transaction = await sequelize.transaction();
    try {
      await savePMMResponsesQuery(
        cycleId,
        [{ question_id: questionId, response_value: true }],
        owner.orgId,
        transaction,
      );
      const seen = await getPMMResponsesQuery(cycleId, owner.orgId, transaction);
      expect(seen.map((r) => r.question_id)).toEqual([questionId]);
    } finally {
      await transaction.rollback();
    }
  });
});
