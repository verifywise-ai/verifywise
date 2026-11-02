/**
 * Shadow AI: one definition of AI usage across Insights and alerts.
 *
 * An event is AI usage when it matched an AI tool at ingestion. Events are
 * sent through the real ingestion controller and read back through the real
 * Insights queries, so every count is checked against the same data:
 * - unmatched proxy traffic adds no users, events, prompts or departments;
 * - deleting the matched tool keeps the past usage counted;
 * - the new_user_detected rule ignores users with only unmatched traffic;
 * - migration 20261102063837 backfills is_ai_tool from detected_tool_id.
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { ingestEvents } from "../../controllers/shadowAiIngestion.ctrl";
import { validateApiKeyWithCache } from "../../utils/shadowAiApiKey.utils";
import { evaluateRulesForBatch } from "../../services/shadowAiAlertNotification.service";
import {
  getDepartmentActivityQuery,
  getInsightsSummaryQuery,
  getTrendQuery,
  getUserActivityQuery,
  getUsersByDepartmentQuery,
} from "../../utils/shadowAiInsights.utils";

const backfill = require("../../database/migrations/20261102063837-shadow-ai-events-is-ai-tool.js");

// The API key lookup is not under test: resolve every key to the test org.
jest.mock("../../utils/shadowAiApiKey.utils", () => ({
  validateApiKeyWithCache: jest.fn(),
}));

// Matching is stubbed: no migration creates shadow_ai_tool_registry, and the
// real ensureTenantTool binds `domains` in a way that fails on a fresh DB
// (both pre-existing, fixed separately). The stubs return the same shape, so
// the real controller and insert util still decide and store the match.
jest.mock("../../services/shadowAiToolMatcher.service", () => {
  const actual = jest.requireActual("../../services/shadowAiToolMatcher.service");
  const { sequelize: db } = jest.requireActual("../../database/db");
  return {
    ...actual,
    matchDomain: jest.fn(async (destination: string) =>
      destination === "chatgpt.com"
        ? { id: 1, name: "ChatGPT", vendor: "OpenAI", domains: ["chatgpt.com"], models: [] }
        : null,
    ),
    ensureTenantTool: jest.fn(
      async (organizationId: number, entry: { name: string }, transaction?: unknown) => {
        const [existing] = await db.query(
          `SELECT id FROM shadow_ai_tools WHERE organization_id = :organizationId AND name = :name`,
          { replacements: { organizationId, name: entry.name }, transaction },
        );
        if ((existing as any[]).length > 0) return { id: (existing as any[])[0].id, isNew: false };
        const [rows] = await db.query(
          `INSERT INTO shadow_ai_tools (organization_id, name, domains, status, first_detected_at, last_seen_at)
           VALUES (:organizationId, :name, '{chatgpt.com}', 'detected', NOW(), NOW()) RETURNING id`,
          { replacements: { organizationId, name: entry.name }, transaction },
        );
        return { id: (rows as any[])[0].id, isNew: true };
      },
    ),
  };
});

// The controller fires rule evaluation without awaiting it; wrap the real
// function so the test can wait for it to finish.
jest.mock("../../services/shadowAiAlertNotification.service", () => {
  const actual = jest.requireActual("../../services/shadowAiAlertNotification.service");
  return {
    ...actual,
    evaluateRulesForBatch: jest.fn((...args: unknown[]) => actual.evaluateRulesForBatch(...args)),
  };
});

const AI = "chatgpt.com";
const NOT_AI = "example.com";
// One timestamp for every event keeps the trend in a single bucket.
const EVENT_TIME = new Date(Date.now() - 60 * 60 * 1000).toISOString();

type Evt = { user: string; destination: string; method?: string; department?: string };

const ingest = async (orgId: number, events: Evt[]) => {
  (validateApiKeyWithCache as jest.Mock).mockResolvedValue(orgId);
  const evaluate = evaluateRulesForBatch as jest.Mock;
  const callsBefore = evaluate.mock.results.length;
  const res: { statusCode?: number; body?: unknown } & Record<string, any> = {
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  await ingestEvents(
    {
      headers: { "x-api-key": "test-key" },
      body: {
        events: events.map((e) => ({
          user_email: e.user,
          destination: e.destination,
          http_method: e.method ?? "POST",
          department: e.department,
          timestamp: EVENT_TIME,
        })),
      },
      t: (s: string) => s,
    } as any,
    res as any,
  );
  expect(res.statusCode).toBe(200);
  if (evaluate.mock.results.length > callsBefore) {
    await evaluate.mock.results[callsBefore].value;
  }
};

const times = (n: number, e: Evt): Evt[] => Array.from({ length: n }, () => e);

afterEach(cleanupDatabase);

describe("Shadow AI Insights count only AI usage", () => {
  // alice: 2 AI prompts. bob: unmatched traffic only. carol: one AI GET and
  // one unmatched POST. Unfiltered, Sales would have 2 users and 4 prompts.
  const seed = async () => {
    const orgId = await createTestOrganization(`AI usage ${Date.now()}`);
    await ingest(orgId, [
      ...times(2, { user: "alice@test.com", destination: AI, department: "Engineering" }),
      ...times(3, { user: "bob@test.com", destination: NOT_AI, department: "Sales" }),
      { user: "carol@test.com", destination: AI, method: "GET", department: "Sales" },
      { user: "carol@test.com", destination: NOT_AI, department: "Sales" },
    ]);
    return orgId;
  };

  const expectAiOnlyCounts = async (orgId: number) => {
    const summary = await getInsightsSummaryQuery(orgId, 30);
    expect(summary.total_ai_users).toBe(2);
    expect(summary.departments_using_ai).toBe(2);
    // Unfiltered, Sales (5 events) would beat Engineering (2).
    expect(summary.most_active_department).toBe("Engineering");

    const byDept = await getUsersByDepartmentQuery(orgId, 30);
    expect(byDept).toEqual([
      { department: "Engineering", user_count: 1 },
      { department: "Sales", user_count: 1 },
    ]);

    const trend = await getTrendQuery(orgId, 30, "daily");
    expect(trend).toHaveLength(1);
    expect(trend[0].total_events).toBe(3);
    expect(trend[0].unique_users).toBe(2);

    const activity = await getUserActivityQuery(orgId, { sort: "email" });
    expect(activity.total).toBe(2);
    expect(activity.users.map((u) => [u.user_email, u.total_prompts])).toEqual([
      ["alice@test.com", 2],
      ["carol@test.com", 0],
    ]);

    const deptActivity = await getDepartmentActivityQuery(orgId);
    const bySales = deptActivity.find((d) => d.department === "Sales")!;
    const byEng = deptActivity.find((d) => d.department === "Engineering")!;
    expect(deptActivity).toHaveLength(2);
    expect([byEng.users, byEng.total_prompts]).toEqual([1, 2]);
    expect([bySales.users, bySales.total_prompts]).toEqual([1, 0]);
    return deptActivity;
  };

  it("stores the match on each event and every count agrees, excluding unmatched traffic", async () => {
    const orgId = await seed();

    const flags = await sequelize.query<{ is_ai_tool: boolean; with_tool: string; n: string }>(
      `SELECT is_ai_tool, COUNT(detected_tool_id) AS with_tool, COUNT(*) AS n
         FROM shadow_ai_events WHERE organization_id = :orgId
        GROUP BY is_ai_tool ORDER BY is_ai_tool`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    expect(flags.map((f) => [f.is_ai_tool, Number(f.with_tool), Number(f.n)])).toEqual([
      [false, 0, 4],
      [true, 3, 3],
    ]);

    const deptActivity = await expectAiOnlyCounts(orgId);
    expect(deptActivity.every((d) => d.top_tool === "ChatGPT")).toBe(true);
  });

  it("keeps a deleted tool's past usage in every count", async () => {
    const orgId = await seed();

    await sequelize.query(`DELETE FROM shadow_ai_tools WHERE organization_id = :orgId`, {
      replacements: { orgId },
    });
    const [{ dangling }] = await sequelize.query<{ dangling: string }>(
      `SELECT COUNT(*) AS dangling FROM shadow_ai_events
        WHERE organization_id = :orgId AND is_ai_tool AND detected_tool_id IS NULL`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    expect(Number(dangling)).toBe(3);

    const deptActivity = await expectAiOnlyCounts(orgId);
    // No tool left to name, but the usage still counts.
    expect(deptActivity.every((d) => d.top_tool === "N/A")).toBe(true);
  });
});

describe("new_user_detected alert counts only AI usage", () => {
  const alertedEmails = async (orgId: number) =>
    (
      await sequelize.query<{ email: string }>(
        `SELECT trigger_data->>'user_email' AS email FROM shadow_ai_alert_history
          WHERE organization_id = :orgId AND trigger_type = 'new_user_detected'
          ORDER BY email`,
        { replacements: { orgId }, type: QueryTypes.SELECT },
      )
    ).map((r) => r.email);

  const setup = async () => {
    const orgId = await createTestOrganization(`AI alerts ${Date.now()}`);
    const userId = await createTestUser(orgId, 1, `admin-${Date.now()}@test.com`, "Password123!");
    // No notification recipients: the alert is only recorded in history.
    await sequelize.query(
      `INSERT INTO shadow_ai_rules
         (organization_id, name, is_active, trigger_type, trigger_config, actions, cooldown_minutes, created_by)
       VALUES (:orgId, 'New AI user', true, 'new_user_detected', '{}', '[]', 1440, :userId)`,
      { replacements: { orgId, userId } },
    );
    return orgId;
  };

  it("alerts for a user with AI usage and not for one with unmatched traffic only", async () => {
    const orgId = await setup();
    await ingest(orgId, [
      { user: "dave@test.com", destination: AI },
      ...times(3, { user: "erin@test.com", destination: NOT_AI }),
    ]);
    expect(await alertedEmails(orgId)).toEqual(["dave@test.com"]);
  });

  it("alerts on a user's first AI use even after earlier unmatched traffic", async () => {
    const orgId = await setup();
    // More unmatched rows than the lookup's recent-row window (10 per email),
    // so they would have marked frank as an existing user.
    await ingest(orgId, times(15, { user: "frank@test.com", destination: NOT_AI }));
    expect(await alertedEmails(orgId)).toEqual([]);

    await ingest(orgId, [{ user: "frank@test.com", destination: AI }]);
    expect(await alertedEmails(orgId)).toEqual(["frank@test.com"]);
  });
});

describe("migration 20261102063837: backfill is_ai_tool", () => {
  it("sets is_ai_tool = (detected_tool_id IS NOT NULL) across batches and keeps existing flags", async () => {
    const orgId = await createTestOrganization(`Backfill ${Date.now()}`);
    const [[tool]] = (await sequelize.query(
      `INSERT INTO shadow_ai_tools (organization_id, name, domains, status)
       VALUES (:orgId, 'ChatGPT', '{chatgpt.com}', 'detected')
       RETURNING id`,
      { replacements: { orgId } },
    )) as [Array<{ id: number }>, unknown];

    // 25,000 rows span three 10,000-id batches; even rows matched a tool.
    await sequelize.query(
      `INSERT INTO shadow_ai_events (organization_id, user_email, detected_tool_id, event_timestamp, is_ai_tool)
       SELECT :orgId, 'u' || g || '@test.com', CASE WHEN g % 2 = 0 THEN :toolId END, NOW(), false
         FROM generate_series(1, 25000) g`,
      { replacements: { orgId, toolId: tool.id } },
    );
    // Already flagged, tool since deleted: the backfill must not clear it.
    await sequelize.query(
      `INSERT INTO shadow_ai_events (organization_id, user_email, detected_tool_id, event_timestamp, is_ai_tool)
       VALUES (:orgId, 'kept@test.com', NULL, NOW(), true)`,
      { replacements: { orgId } },
    );

    await backfill.up({ sequelize });

    const [{ wrong, flagged, kept }] = await sequelize.query<{
      wrong: string;
      flagged: string;
      kept: boolean;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE user_email <> 'kept@test.com'
                            AND is_ai_tool <> (detected_tool_id IS NOT NULL)) AS wrong,
         COUNT(*) FILTER (WHERE is_ai_tool) AS flagged,
         BOOL_AND(is_ai_tool) FILTER (WHERE user_email = 'kept@test.com') AS kept
       FROM shadow_ai_events WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    expect(Number(wrong)).toBe(0);
    expect(Number(flagged)).toBe(12501);
    expect(kept).toBe(true);
  });
});
