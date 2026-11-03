/**
 * Shadow AI: one definition of AI usage across Insights and alerts.
 *
 * An event is AI usage when it matched an AI tool at ingestion. Events are
 * sent through the real ingestion controller and read back through the real
 * Insights queries, so every count is checked against the same data:
 * - unmatched proxy traffic adds no users, events, prompts or departments;
 * - deleting the matched tool keeps the past usage counted;
 * - the user detail drawer agrees with the user list;
 * - the new_user_detected and sensitive_department rules ignore unmatched
 *   traffic, and a new user's first AI event alerts in any batch size;
 * - daily and monthly rollups count only AI usage and are idempotent;
 * - a database trigger sets is_ai_tool, and migration 20261102063837
 *   backfills it from detected_tool_id.
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { ingestEvents } from "../../controllers/shadowAiIngestion.ctrl";
import { validateApiKeyWithCache } from "../../utils/shadowAiApiKey.utils";
import { evaluateRulesForBatch } from "../../services/shadowAiAlertNotification.service";
import { getUserDetail } from "../../controllers/shadowAi.ctrl";
import {
  getDepartmentActivityQuery,
  getUserDetailQuery,
  getInsightsSummaryQuery,
  getTrendQuery,
  getUserActivityQuery,
  getUsersByDepartmentQuery,
} from "../../utils/shadowAiInsights.utils";
import { runDailyRollup, runMonthlyRollup } from "../../services/shadowAiAggregation.service";

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

type Evt = {
  user: string;
  destination: string;
  method?: string;
  department?: string;
  at?: string;
};

const fakeRes = () => {
  const res: { statusCode?: number; body?: any } & Record<string, any> = {
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
};

const ingest = async (orgId: number, events: Evt[]) => {
  (validateApiKeyWithCache as jest.Mock).mockResolvedValue(orgId);
  const evaluate = evaluateRulesForBatch as jest.Mock;
  const callsBefore = evaluate.mock.results.length;
  const res = fakeRes();
  await ingestEvents(
    {
      headers: { "x-api-key": "test-key" },
      body: {
        events: events.map((e) => ({
          user_email: e.user,
          destination: e.destination,
          http_method: e.method ?? "POST",
          department: e.department,
          timestamp: e.at ?? EVENT_TIME,
        })),
      },
      t: (s: string) => s,
    } as any,
    res as any,
  );
  expect(res.statusCode).toBe(200);
  // Rule evaluation is fire-and-forget in the controller; wait for it here so
  // no query from it is still running when cleanup truncates the tables.
  expect(evaluate.mock.results.length).toBe(callsBefore + 1);
  await evaluate.mock.results[callsBefore].value;
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

describe("user detail agrees with the user list", () => {
  it("counts only AI usage, keeps a deleted tool's events and counts prompts as POSTs", async () => {
    const orgId = await createTestOrganization(`Detail ${Date.now()}`);
    const earlier = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    // henry: AI usage from Legal, then later unmatched traffic from Marketing.
    await ingest(orgId, [
      { user: "henry@test.com", destination: AI, department: "Legal", at: earlier },
      { user: "henry@test.com", destination: AI, method: "GET", department: "Legal", at: earlier },
      ...times(4, { user: "henry@test.com", destination: NOT_AI, department: "Marketing" }),
    ]);
    await sequelize.query(`DELETE FROM shadow_ai_tools WHERE organization_id = :orgId`, {
      replacements: { orgId },
    });

    const tools = await getUserDetailQuery(orgId, "henry@test.com", 30);
    expect(tools.map((t) => [t.tool_name, Number(t.event_count), Number(t.prompt_count)])).toEqual([
      ["Unknown", 2, 1],
    ]);

    const res = fakeRes();
    await getUserDetail(
      {
        userId: 1,
        organizationId: orgId,
        params: { email: "henry@test.com" },
        query: { period: "30d" },
      } as any,
      res as any,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ department: "Legal", total_prompts: 1 });

    const list = await getUserActivityQuery(orgId);
    expect(list.users).toEqual([
      expect.objectContaining({ user_email: "henry@test.com", total_prompts: 1 }),
    ]);
  });
});

describe("alert rules count only AI usage", () => {
  const alerted = async (orgId: number, triggerType: string, field: string) =>
    (
      await sequelize.query<{ v: string }>(
        `SELECT trigger_data->>:field AS v FROM shadow_ai_alert_history
          WHERE organization_id = :orgId AND trigger_type = :triggerType
          ORDER BY v`,
        { replacements: { orgId, triggerType, field }, type: QueryTypes.SELECT },
      )
    ).map((r) => r.v);
  const alertedEmails = (orgId: number) => alerted(orgId, "new_user_detected", "user_email");

  const setup = async (triggerType = "new_user_detected", config: object = {}) => {
    const orgId = await createTestOrganization(`AI alerts ${Date.now()}`);
    const userId = await createTestUser(orgId, 1, `admin-${Date.now()}@test.com`, "Password123!");
    // No notification recipients: the alert is only recorded in history.
    await sequelize.query(
      `INSERT INTO shadow_ai_rules
         (organization_id, name, is_active, trigger_type, trigger_config, actions, cooldown_minutes, created_by)
       VALUES (:orgId, 'Rule', true, :triggerType, :config, '[]', 1440, :userId)`,
      { replacements: { orgId, userId, triggerType, config: JSON.stringify(config) } },
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

  it("alerts for a new user's AI event even when the batch has many unmatched events", async () => {
    const orgId = await setup();
    // A size-based "recent rows" window would leave gina's event outside it
    // and read it as prior usage.
    await ingest(orgId, [
      { user: "gina@test.com", destination: AI },
      ...times(30, { user: "ivan@test.com", destination: NOT_AI }),
    ]);
    expect(await alertedEmails(orgId)).toEqual(["gina@test.com"]);
  });

  it("alerts on a user's first AI use even after earlier unmatched traffic", async () => {
    const orgId = await setup();
    await ingest(orgId, times(15, { user: "frank@test.com", destination: NOT_AI }));
    expect(await alertedEmails(orgId)).toEqual([]);

    await ingest(orgId, [{ user: "frank@test.com", destination: AI }]);
    expect(await alertedEmails(orgId)).toEqual(["frank@test.com"]);

    // Now an existing AI user: no second alert (cooldown aside).
    await sequelize.query(`DELETE FROM shadow_ai_alert_history WHERE organization_id = :orgId`, {
      replacements: { orgId },
    });
    await ingest(orgId, [{ user: "frank@test.com", destination: AI }]);
    expect(await alertedEmails(orgId)).toEqual([]);
  });

  it("sensitive_department fires only for a department's AI usage", async () => {
    const orgId = await setup("sensitive_department", { departments: ["Finance", "Legal"] });
    await ingest(orgId, [
      { user: "jack@test.com", destination: NOT_AI, department: "Finance" },
      { user: "kate@test.com", destination: AI, department: "Legal" },
    ]);
    expect(await alerted(orgId, "sensitive_department", "department")).toEqual(["Legal"]);
  });
});

describe("rollups count only AI usage and can be rerun", () => {
  const createTool = async (orgId: number, name: string) =>
    (
      (await sequelize.query(
        `INSERT INTO shadow_ai_tools (organization_id, name, domains, status)
         VALUES (:orgId, :name, '{chatgpt.com}', 'detected') RETURNING id`,
        { replacements: { orgId, name } },
      )) as [Array<{ id: number }>, unknown]
    )[0][0].id;

  it("daily rollup: deleted tool, two departments and a rerun give one row per key", async () => {
    const orgId = await createTestOrganization(`Rollup ${Date.now()}`);
    const chatgpt = await createTool(orgId, "ChatGPT");
    const claude = await createTool(orgId, "Claude");
    const event = (user: string, toolId: number | null, dept: string, hour: number) =>
      sequelize.query(
        `INSERT INTO shadow_ai_events (organization_id, user_email, detected_tool_id, department, http_method, event_timestamp)
         VALUES (:orgId, :user, :toolId, :dept, 'POST', (CURRENT_DATE - 1) + make_interval(hours => :hour))`,
        { replacements: { orgId, user, toolId, dept, hour } },
      );
    // lena moved departments during the day: same key, two departments.
    await event("lena@test.com", chatgpt, "Sales", 9);
    await event("lena@test.com", chatgpt, "Legal", 15);
    // mike used a tool that is then deleted: his row has a NULL tool_id.
    await event("mike@test.com", claude, "Finance", 10);
    await event("mike@test.com", claude, "Finance", 11);
    // Unmatched traffic is not rolled up.
    await event("nina@test.com", null, "Finance", 12);
    await sequelize.query(`DELETE FROM shadow_ai_tools WHERE id = :id`, {
      replacements: { id: claude },
    });

    await runDailyRollup();
    await runDailyRollup();

    const rows = await sequelize.query<{
      user_email: string;
      tool_id: number | null;
      department: string;
      total_events: number;
    }>(
      `SELECT user_email, tool_id, department, total_events FROM shadow_ai_daily_rollups
        WHERE organization_id = :orgId ORDER BY user_email`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    expect(rows).toEqual([
      { user_email: "lena@test.com", tool_id: chatgpt, department: "Legal", total_events: 2 },
      { user_email: "mike@test.com", tool_id: null, department: "Finance", total_events: 2 },
    ]);
  });

  it("monthly rollup: a rerun does not duplicate rows with a NULL tool_id", async () => {
    const orgId = await createTestOrganization(`Monthly ${Date.now()}`);
    // getAllOrganizationIds reads orgs from events.
    await sequelize.query(
      `INSERT INTO shadow_ai_events (organization_id, user_email, event_timestamp)
       VALUES (:orgId, 'seed@test.com', NOW())`,
      { replacements: { orgId } },
    );
    await sequelize.query(
      `INSERT INTO shadow_ai_daily_rollups (organization_id, rollup_date, user_email, tool_id, department, total_events)
       VALUES (:orgId, DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::date, 'o@test.com', NULL, 'Finance', 3),
              (:orgId, DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::date + 1, 'p@test.com', NULL, NULL, 4)`,
      { replacements: { orgId } },
    );

    await runMonthlyRollup();
    await runMonthlyRollup();

    const rows = await sequelize.query<{ department: string | null; total_events: string }>(
      `SELECT department, total_events FROM shadow_ai_monthly_rollups
        WHERE organization_id = :orgId ORDER BY department NULLS LAST`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    expect(rows.map((r) => [r.department, Number(r.total_events)])).toEqual([
      ["Finance", 3],
      [null, 4],
    ]);
  });
});

describe("is_ai_tool is set by the database", () => {
  const insertEvent = async (orgId: number, toolId: number | null, flag?: boolean) => {
    const [[row]] = (await sequelize.query(
      flag === undefined
        ? `INSERT INTO shadow_ai_events (organization_id, user_email, detected_tool_id, event_timestamp)
           VALUES (:orgId, 'x@test.com', :toolId, NOW()) RETURNING id, is_ai_tool`
        : `INSERT INTO shadow_ai_events (organization_id, user_email, detected_tool_id, event_timestamp, is_ai_tool)
           VALUES (:orgId, 'x@test.com', :toolId, NOW(), :flag) RETURNING id, is_ai_tool`,
      { replacements: { orgId, toolId, flag: flag ?? null } },
    )) as [Array<{ id: string; is_ai_tool: boolean }>, unknown];
    return row;
  };

  it("sets it from detected_tool_id on insert and keeps it when the tool is deleted", async () => {
    const orgId = await createTestOrganization(`Trigger ${Date.now()}`);
    const [[tool]] = (await sequelize.query(
      `INSERT INTO shadow_ai_tools (organization_id, name, domains, status)
       VALUES (:orgId, 'ChatGPT', '{chatgpt.com}', 'detected') RETURNING id`,
      { replacements: { orgId } },
    )) as [Array<{ id: number }>, unknown];

    expect((await insertEvent(orgId, tool.id)).is_ai_tool).toBe(true);
    expect((await insertEvent(orgId, tool.id, false)).is_ai_tool).toBe(true);
    expect((await insertEvent(orgId, null)).is_ai_tool).toBe(false);

    await sequelize.query(`DELETE FROM shadow_ai_tools WHERE id = :id`, {
      replacements: { id: tool.id },
    });
    const flags = await sequelize.query<{ is_ai_tool: boolean; detected_tool_id: number | null }>(
      `SELECT is_ai_tool, detected_tool_id FROM shadow_ai_events
        WHERE organization_id = :orgId ORDER BY id`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    expect(flags).toEqual([
      { is_ai_tool: true, detected_tool_id: null },
      { is_ai_tool: true, detected_tool_id: null },
      { is_ai_tool: false, detected_tool_id: null },
    ]);
  });
});

describe("migration 20261102063837: backfill is_ai_tool", () => {
  it("sets is_ai_tool = (detected_tool_id IS NOT NULL) over sparse ids and keeps existing flags", async () => {
    const orgId = await createTestOrganization(`Backfill ${Date.now()}`);
    const [[tool]] = (await sequelize.query(
      `INSERT INTO shadow_ai_tools (organization_id, name, domains, status)
       VALUES (:orgId, 'ChatGPT', '{chatgpt.com}', 'detected') RETURNING id`,
      { replacements: { orgId } },
    )) as [Array<{ id: number }>, unknown];

    // Rows written before the trigger existed: simulate by disabling it.
    await sequelize.query(
      `ALTER TABLE shadow_ai_events DISABLE TRIGGER trg_shadow_ai_events_is_ai_tool`,
    );
    try {
      // 25,000 rows with ids spread 1,000 apart (sparse, like a pruned
      // table) span three batches; even rows matched a tool.
      await sequelize.query(
        `INSERT INTO shadow_ai_events (id, organization_id, user_email, detected_tool_id, event_timestamp, is_ai_tool)
         SELECT 1000000 + g * 1000, :orgId, 'u' || g || '@test.com',
                CASE WHEN g % 2 = 0 THEN :toolId END, NOW(), false
           FROM generate_series(1, 25000) g`,
        { replacements: { orgId, toolId: tool.id } },
      );
      // Already flagged, tool since deleted: the backfill must not clear it.
      await sequelize.query(
        `INSERT INTO shadow_ai_events (organization_id, user_email, detected_tool_id, event_timestamp, is_ai_tool)
         VALUES (:orgId, 'kept@test.com', NULL, NOW(), true)`,
        { replacements: { orgId } },
      );
    } finally {
      await sequelize.query(
        `ALTER TABLE shadow_ai_events ENABLE TRIGGER trg_shadow_ai_events_is_ai_tool`,
      );
    }

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
