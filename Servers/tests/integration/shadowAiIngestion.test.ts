// Rule evaluation runs after the response and would race afterEach's TRUNCATE.
jest.mock("../../services/shadowAiAlertNotification.service", () => ({
  ...jest.requireActual("../../services/shadowAiAlertNotification.service"),
  evaluateRulesForBatch: jest.fn().mockResolvedValue(undefined),
}));

import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { generateApiKey, createApiKeyQuery } from "../../utils/shadowAiApiKey.utils";

/**
 * Characterises POST /api/v1/shadow-ai/events (X-API-Key auth). Written before
 * the ingestion logic moved into services/shadowAiIngestion.service.ts and
 * kept as the guard that the REST behaviour did not change.
 */
describe("POST /api/v1/shadow-ai/events", () => {
  let orgA: number;
  let orgB: number;
  let keyA: string;

  const count = async (table: string, org: number): Promise<number> => {
    const [rows] = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE organization_id = :org`,
      { replacements: { org } },
    );
    return (rows as { n: number }[])[0].n;
  };

  beforeEach(async () => {
    orgA = await createTestOrganization("Shadow AI ingest A");
    orgB = await createTestOrganization("Shadow AI ingest B");
    const userA = await createTestUser(orgA, 1, `ingest-a-${Date.now()}@test.com`, "Password123!");
    const { key, keyHash, keyPrefix } = generateApiKey(orgA);
    await createApiKeyQuery(orgA, keyHash, keyPrefix, "ingest test", userA);
    keyA = key;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  const event = (destination: string, email = "Alice@Example.com") => ({
    user_email: email,
    destination,
    timestamp: "2026-11-01T10:00:00Z",
  });

  it("ingests events, creates the tool row and leaves other orgs untouched", async () => {
    const app = await createTestApp();
    const res = await testRequest(app)
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", keyA)
      .send({ events: [event("chat.openai.com"), event("example.com")] });

    expect(res.status).toBe(200);
    expect(res.body.data.ingested).toBe(2);
    expect(res.body.data.tools_matched).toBe(1);

    expect(await count("shadow_ai_tools", orgA)).toBe(1);
    expect(await count("shadow_ai_events", orgA)).toBe(2);

    const [rows] = await sequelize.query(
      `SELECT user_email, detected_tool_id FROM shadow_ai_events
       WHERE organization_id = :org ORDER BY destination`,
      { replacements: { org: orgA } },
    );
    const typed = rows as { user_email: string; detected_tool_id: number | null }[];
    expect(typed.filter((r) => r.detected_tool_id === null)).toHaveLength(1);
    expect(typed.every((r) => r.user_email === "alice@example.com")).toBe(true);

    expect(await count("shadow_ai_events", orgB)).toBe(0);
    expect(await count("shadow_ai_tools", orgB)).toBe(0);
  });

  it("returns 200 with ingested 0 for an empty batch", async () => {
    const app = await createTestApp();
    const res = await testRequest(app)
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", keyA)
      .send({ events: [] });
    expect(res.status).toBe(200);
    expect(res.body.data.ingested).toBe(0);
  });

  it("returns 401 without an API key", async () => {
    const app = await createTestApp();
    const res = await testRequest(app)
      .post("/api/v1/shadow-ai/events")
      .send({ events: [event("chat.openai.com")] });
    expect(res.status).toBe(401);
  });

  it("returns 401 for an unknown API key", async () => {
    const app = await createTestApp();
    const res = await testRequest(app)
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", generateApiKey(orgA).key)
      .send({ events: [event("chat.openai.com")] });
    expect(res.status).toBe(401);
  });

  it("returns 400 when events is not an array", async () => {
    const app = await createTestApp();
    const res = await testRequest(app)
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", keyA)
      .send({ events: "nope" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a missing required field", async () => {
    const app = await createTestApp();
    const res = await testRequest(app)
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", keyA)
      .send({ events: [{ user_email: "a@example.com", destination: "example.com" }] });
    expect(res.status).toBe(400);
    expect(await count("shadow_ai_events", orgA)).toBe(0);
  });

  it("returns 400 for a bad email and stores nothing", async () => {
    const app = await createTestApp();
    const res = await testRequest(app)
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", keyA)
      .send({ events: [event("chat.openai.com"), event("example.com", "not-an-email")] });
    expect(res.status).toBe(400);
    expect(await count("shadow_ai_events", orgA)).toBe(0);
  });

  it("returns 413 above 10 000 events", async () => {
    const app = await createTestApp();
    const events = Array.from({ length: 10001 }, () => event("example.com"));
    const res = await testRequest(app)
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", keyA)
      .send({ events });
    expect(res.status).toBe(413);
    expect(await count("shadow_ai_events", orgA)).toBe(0);
  });
});
