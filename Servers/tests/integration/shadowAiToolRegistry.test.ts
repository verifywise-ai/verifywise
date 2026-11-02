// Ingestion runs rule evaluation after responding, which can hold row locks
// while afterEach truncates; give the hooks room as the other suites do.
jest.setTimeout(60000);

import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { generateApiKey, createApiKeyQuery } from "../../utils/shadowAiApiKey.utils";
import {
  clearToolRegistryCache,
  ensureTenantTool,
} from "../../services/shadowAiToolMatcher.service";

/**
 * The global AI tool registry must come from the migration chain (a fresh
 * database has nothing else), and a matched tool's domains must be stored in
 * the org's shadow_ai_tools row as one text[] value however many there are.
 */
describe("Shadow AI tool registry and ingestion matching", () => {
  let orgId: number;
  let apiKey: string;

  const event = (destination: string) => ({
    user_email: "alice@example.com",
    destination,
    timestamp: "2026-11-01T10:00:00Z",
  });

  const tenantTool = async (name: string) => {
    const [rows] = await sequelize.query(
      `SELECT id, domains FROM shadow_ai_tools WHERE organization_id = :orgId AND name = :name`,
      { replacements: { orgId, name } },
    );
    return (rows as { id: number; domains: string[] }[])[0];
  };

  beforeAll(() => {
    clearToolRegistryCache();
  });

  beforeEach(async () => {
    orgId = await createTestOrganization("Shadow AI registry org");
    const userId = await createTestUser(
      orgId,
      1,
      `registry-${Date.now()}@test.com`,
      "Password123!",
    );
    const { key, keyHash, keyPrefix } = generateApiKey(orgId);
    await createApiKeyQuery(orgId, keyHash, keyPrefix, "registry test", userId);
    apiKey = key;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("is created and seeded by the migrations", async () => {
    const [[{ n }]] = (await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM verifywise.shadow_ai_tool_registry`,
    )) as [{ n: number }[], unknown];
    expect(n).toBeGreaterThanOrEqual(55);

    const [rows] = await sequelize.query(
      `SELECT domains FROM shadow_ai_tool_registry WHERE name = 'ChatGPT'`,
    );
    expect((rows as { domains: string[] }[])[0].domains).toEqual([
      "chat.openai.com",
      "chatgpt.com",
    ]);
  });

  it("ingests a multi-domain match and an unmatched event", async () => {
    const app = await createTestApp();
    const res = await testRequest(app)
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", apiKey)
      .send({ events: [event("chat.openai.com"), event("example.com")] });

    expect(res.status).toBe(200);
    expect(res.body.data.ingested).toBe(2);

    const [tools] = await sequelize.query(
      `SELECT name FROM shadow_ai_tools WHERE organization_id = :orgId`,
      { replacements: { orgId } },
    );
    expect(tools).toHaveLength(1);

    const chatgpt = await tenantTool("ChatGPT");
    expect(chatgpt.domains).toEqual(["chat.openai.com", "chatgpt.com"]);

    const [events] = await sequelize.query(
      `SELECT destination, detected_tool_id FROM shadow_ai_events
       WHERE organization_id = :orgId ORDER BY destination`,
      { replacements: { orgId } },
    );
    expect(events).toEqual([
      { destination: "chat.openai.com", detected_tool_id: chatgpt.id },
      { destination: "example.com", detected_tool_id: null },
    ]);
  });

  it("ingests a single-domain match", async () => {
    const app = await createTestApp();
    const res = await testRequest(app)
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", apiKey)
      .send({ events: [event("claude.ai")] });

    expect(res.status).toBe(200);
    expect(res.body.data.ingested).toBe(1);
    expect((await tenantTool("Claude AI")).domains).toEqual(["claude.ai"]);
  });

  it("stores an empty domain list as an empty array", async () => {
    const { id } = await ensureTenantTool(orgId, {
      id: 0,
      name: "No-domain tool",
      domains: [],
      models: [],
    } as any);
    const tool = await tenantTool("No-domain tool");
    expect(tool.id).toBe(id);
    expect(tool.domains).toEqual([]);
  });
});
