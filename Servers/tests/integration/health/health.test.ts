import { createTestApp, testRequest } from "../setup";
import redisClient from "../../../database/redis";
import http from "http";
import { sequelize } from "../../../database/db";

/**
 * Liveness and readiness must not depend on the AI Gateway: an outage there
 * used to fail every backend pod's liveness probe and restart it in a loop.
 */
describe("health endpoints", () => {
  let server: http.Server;
  const originalGatewayUrl = process.env.AI_GATEWAY_URL;

  beforeAll(async () => {
    process.env.AI_GATEWAY_URL = "http://127.0.0.1:1"; // nothing listens here
    server = await createTestApp();
    // Open the DB connection first: under a busy parallel test run the very
    // first connection can take longer than the 2s data-store check timeout.
    await sequelize.query("SELECT 1");
  });

  afterAll(() => {
    process.env.AI_GATEWAY_URL = originalGatewayUrl;
    server.close();
  });

  it("GET /health/live returns 200 with no dependency checks", async () => {
    const res = await testRequest(server).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /health/ready checks only PostgreSQL and Redis, so a gateway outage does not fail it", async () => {
    const res = await testRequest(server).get("/health/ready");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.checks).sort()).toEqual(["database", "redis"]);
  });

  it("GET /health still reports the AI Gateway for monitoring", async () => {
    const res = await testRequest(server).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.checks.ai_gateway.status).toBe("error");
    expect(res.body.checks.database.status).toBe("ok");
  });

  it("GET /health/ready returns 503 promptly when Redis hangs", async () => {
    (redisClient.ping as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
    const started = Date.now();
    const res = await testRequest(server).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.checks.redis.error).toMatch(/timed out/);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
