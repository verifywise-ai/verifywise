// Rule evaluation is stubbed so the test can observe exactly when it starts.
jest.mock("../../services/shadowAiAlertNotification.service", () => ({
  ...jest.requireActual("../../services/shadowAiAlertNotification.service"),
  evaluateRulesForBatch: jest.fn().mockResolvedValue(undefined),
}));

import "./setup";
import { createTestOrganization, cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { ingestShadowAiEvents } from "../../services/shadowAiIngestion.service";
import { evaluateRulesForBatch } from "../../services/shadowAiAlertNotification.service";

describe("ingestShadowAiEvents with an external transaction", () => {
  let orgId: number;
  const events = [
    {
      user_email: "bob@example.com",
      destination: "chat.openai.com",
      timestamp: "2026-11-01T10:00:00Z",
    },
  ];

  const eventCount = async (): Promise<number> => {
    const [rows] = await sequelize.query(
      "SELECT COUNT(*)::int AS n FROM shadow_ai_events WHERE organization_id = :orgId",
      { replacements: { orgId } },
    );
    return (rows as { n: number }[])[0].n;
  };

  beforeEach(async () => {
    (evaluateRulesForBatch as jest.Mock).mockClear();
    orgId = await createTestOrganization("Shadow AI service org");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("does not commit and starts rule evaluation only after the caller commits", async () => {
    const transaction = await sequelize.transaction();
    const result = await ingestShadowAiEvents(orgId, events, { transaction });

    expect(result.ingested).toBe(1);
    expect(evaluateRulesForBatch).not.toHaveBeenCalled();

    await transaction.commit();
    expect(evaluateRulesForBatch).toHaveBeenCalledTimes(1);
    expect(await eventCount()).toBe(1);
  });

  it("never starts rule evaluation when the caller rolls back", async () => {
    const transaction = await sequelize.transaction();
    await ingestShadowAiEvents(orgId, events, { transaction });
    await transaction.rollback();

    expect(evaluateRulesForBatch).not.toHaveBeenCalled();
    expect(await eventCount()).toBe(0);
  });

  describe("a row that does not fit its column", () => {
    const good = (n: number) => ({
      user_email: `user${n}@example.com`,
      destination: "chat.openai.com",
      timestamp: "2026-11-01T10:00:00Z",
    });
    const bad = { ...good(99), job_title: "x".repeat(256) };

    it("is skipped with skipInvalidRows and the good rows are stored", async () => {
      const result = await ingestShadowAiEvents(orgId, [good(1), bad, good(2)], {
        skipInvalidRows: true,
      });
      expect(result).toEqual(expect.objectContaining({ ingested: 2, skipped: 1 }));
      expect(await eventCount()).toBe(2);
    });

    it("keeps a row whose uri_path is over-long in both modes, with the path left out", async () => {
      const longPath = { ...good(3), uri_path: `/${"a".repeat(2999)}` };
      expect(await ingestShadowAiEvents(orgId, [longPath])).toEqual(
        expect.objectContaining({ ingested: 1, skipped: 0 }),
      );
      expect(await ingestShadowAiEvents(orgId, [longPath], { skipInvalidRows: true })).toEqual(
        expect.objectContaining({ ingested: 1, skipped: 0 }),
      );
      const [rows] = await sequelize.query(
        "SELECT uri_path FROM shadow_ai_events WHERE organization_id = :orgId",
        { replacements: { orgId } },
      );
      expect(rows).toEqual([{ uri_path: null }, { uri_path: null }]);
    });

    it("refuses the batch without skipInvalidRows and writes nothing", async () => {
      await expect(ingestShadowAiEvents(orgId, [good(1), bad])).rejects.toThrow(/too long/);
      expect(await eventCount()).toBe(0);
    });
  });
});
