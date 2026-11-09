// Ingestion starts rule evaluation after it responds and does not wait for
// it; left running, it races afterEach's TRUNCATE. Rules are not under test.
jest.mock("../../services/shadowAiAlertNotification.service", () => ({
  ...jest.requireActual("../../services/shadowAiAlertNotification.service"),
  evaluateRulesForBatch: jest.fn().mockResolvedValue(undefined),
}));

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

    // Matching is host-only, so no seeded domain may carry a path.
    const [withPath] = await sequelize.query(
      `SELECT name FROM shadow_ai_tool_registry
       WHERE EXISTS (SELECT 1 FROM unnest(domains) d WHERE d LIKE '%/%')`,
    );
    expect(withPath).toEqual([]);

    const [[{ patterns }]] = (await sequelize.query(
      `SELECT COUNT(*)::int AS patterns FROM verifywise.shadow_ai_model_patterns`,
    )) as [{ patterns: number }[], unknown];
    expect(patterns).toBeGreaterThanOrEqual(4);
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

  it("extracts models from uri_paths that match the seeded patterns", async () => {
    const cases: [string, string, string | null][] = [
      [
        "bedrock-runtime.us-east-1.amazonaws.com",
        "/model/anthropic.claude-3-sonnet-20240229-v1:0/invoke",
        "anthropic.claude-3-sonnet-20240229-v1:0",
      ],
      [
        "acme-prod.openai.azure.com",
        "/openai/deployments/gpt-4o/chat/completions?api-version=2024-06-01",
        "gpt-4o",
      ],
      [
        "us-central1-aiplatform.googleapis.com",
        "/v1/projects/p1/locations/us-central1/publishers/google/models/gemini-1.5-pro:generateContent",
        "gemini-1.5-pro",
      ],
      [
        "generativelanguage.googleapis.com",
        "/v1beta/models/gemini-2.0-flash:generateContent",
        "gemini-2.0-flash",
      ],
      // Anchored host patterns: a lookalike host extracts nothing.
      ["api.openai.com.attacker.example", "/v1/chat/completions", null],
      ["bedrock-runtime.us-east-1.amazonaws.com.attacker.example", "/model/x/invoke", null],
    ];

    const app = await createTestApp();
    const res = await testRequest(app)
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", apiKey)
      .send({
        events: cases.map(([destination, uri_path]) => ({ ...event(destination), uri_path })),
      });

    expect(res.status).toBe(200);
    expect(res.body.data.ingested).toBe(cases.length);

    const [rows] = await sequelize.query(
      `SELECT destination, detected_model FROM shadow_ai_events WHERE organization_id = :orgId`,
      { replacements: { orgId } },
    );
    const byDestination = Object.fromEntries(
      (rows as { destination: string; detected_model: string | null }[]).map((r) => [
        r.destination,
        r.detected_model,
      ]),
    );
    for (const [destination, , model] of cases) {
      expect(byDestination[destination]).toBe(model);
    }
  });
});
