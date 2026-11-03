/**
 * AI Gateway proxy integration test — issue #4505 (node-side, backend part).
 *
 * Calls the Express `/api/ai-gateway/*` proxy (Servers/routes/aiGateway.route.ts)
 * with the Python AIGateway mocked at the HTTP level: a throwaway Node HTTP
 * server plays the gateway, and `AI_GATEWAY_URL` is pointed at it. The real
 * `http-proxy-middleware` is used (the jest moduleNameMapper pass-through mock
 * is overridden for this file only) so path rewriting, header forwarding and
 * the graceful-degradation fallback are exercised end to end over real
 * sockets.
 *
 * Contract asserted here is the response shape the Clients actually consume
 * (grep-verified against Clients/src):
 *
 *   Clients/src/presentation/pages/AIGateway/SpendDashboard/index.tsx
 *     GET /ai-gateway/spend/exists      → body { has_logs: boolean }
 *     GET /ai-gateway/spend?period=     → body { summary: {...}, by_day: [...] }
 *     GET /ai-gateway/spend/by-endpoint → body { data: [...] }
 *     GET /ai-gateway/spend/by-user     → body { data: [...] }
 *     GET /ai-gateway/guardrails/stats  → body { summary: {...}, topDetections|byType }
 *     GET /ai-gateway/cache/stats       → body { stats: {...} }
 *
 * plus the security headers the gateway relies on: x-internal-key and the
 * tenant context (x-organization-id / x-user-id / x-role) forwarded from the
 * authenticated JWT context — never from client-supplied headers.
 *
 * Runs under `npm run test:unit` (no Postgres required).
 */

import http from "node:http";

/**
 * Serve a FUNCTIONAL http-proxy-middleware stand-in to the modules under
 * test. jest's moduleNameMapper maps the real package to a pass-through mock
 * for integration tests, and the real v4 build is ESM (unloadable under the
 * CJS jest runtime), so this factory implements the small documented surface
 * the route config uses — `router`, `pathRewrite`, `on.proxyReq`,
 * `on.error`, `fixRequestBody` — over REAL HTTP sockets. The Python AIGateway
 * is mocked at the HTTP level by a throwaway Node server (see below), which
 * is the integration boundary this suite pins down; the route-config wiring
 * against the real library is covered by routes/__tests__/gatewayProxyTarget.test.ts.
 */
jest.mock("http-proxy-middleware", () => {
  const http = require("node:http");

  /** Mirrors http-proxy-middleware's fixRequestBody: re-stream a parsed body. */
  function fixRequestBody(proxyReq: any, req: any) {
    if (!req.body || Object.keys(req.body).length === 0) return;
    const bodyData = JSON.stringify(req.body);
    proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }

  function createProxyMiddleware(options: any) {
    return (req: any, res: any, next: any) => {
      const target: string | undefined = options.router ? options.router(req) : options.target;
      if (!target) return next();

      let rewritten: string = req.url;
      for (const [pattern, replacement] of Object.entries<string>(options.pathRewrite ?? {})) {
        rewritten = rewritten.replace(new RegExp(pattern), replacement);
      }

      const targetUrl = new URL(target);
      const proxyReq = http.request(
        {
          hostname: targetUrl.hostname,
          port: targetUrl.port,
          path: rewritten,
          method: req.method,
          headers: { ...req.headers, host: targetUrl.host },
        },
        (proxyRes: http.IncomingMessage) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on("error", (err: Error) => {
        if (options.on?.error) return options.on.error(err, req, res);
        next(err);
      });
      // Let the route's own hook set x-internal-key / tenant headers and
      // re-stream the parsed body, exactly as the real proxy would.
      if (options.on?.proxyReq) options.on.proxyReq(proxyReq, req);
      proxyReq.end();
    };
  }

  return { createProxyMiddleware, fixRequestBody };
});

import "./testEnv";
import { createTestApp, testRequest } from "../integration/setup";

interface CapturedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** A throwaway HTTP server that plays the Python AIGateway. */
function startMockGateway(
  responder: (req: CapturedRequest) => { status: number; body: unknown },
): Promise<{ server: http.Server; url: string; captured: CapturedRequest[] }> {
  const captured: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const snapshot: CapturedRequest = {
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: req.headers,
        body,
      };
      captured.push(snapshot);
      const { status, body: responseBody } = responder(snapshot);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(responseBody));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("mock gateway has no bound address");
      }
      resolve({ server, url: `http://127.0.0.1:${address.port}`, captured });
    });
  });
}

describe("AI Gateway proxy (#4505)", () => {
  let app: http.Server;
  const savedUrl = process.env.AI_GATEWAY_URL;
  const savedKey = process.env.AI_GATEWAY_INTERNAL_KEY;
  const testServers: http.Server[] = [];

  beforeAll(async () => {
    process.env.AI_GATEWAY_INTERNAL_KEY = "test-internal-key";
    app = await createTestApp({
      bypassAuth: true,
      mockUser: { userId: 42, organizationId: 7, role: "Admin" },
    });
  });

  afterEach(() => {
    for (const server of testServers.splice(0)) {
      server.closeAllConnections();
      server.close();
    }
  });

  afterAll(() => {
    if (savedUrl === undefined) delete process.env.AI_GATEWAY_URL;
    else process.env.AI_GATEWAY_URL = savedUrl;
    if (savedKey === undefined) delete process.env.AI_GATEWAY_INTERNAL_KEY;
    else process.env.AI_GATEWAY_INTERNAL_KEY = savedKey;
  });

  describe("happy path — proxied to /internal/* with tenant context", () => {
    it("GET /api/ai-gateway/spend forwards headers from JWT context, not the client", async () => {
      const gateway = await startMockGateway(() => ({
        status: 200,
        body: {
          summary: { total_requests: 5, total_cost_usd: 0.01 },
          by_day: [{ day: "2026-10-14", requests: 5, cost_usd: 0.01 }],
        },
      }));
      testServers.push(gateway.server);
      process.env.AI_GATEWAY_URL = gateway.url;

      const res = await testRequest(app)
        .get("/api/ai-gateway/spend?period=7d")
        // A hostile client header must be stripped and replaced with the
        // authenticated JWT tenant context.
        .set("x-organization-id", "999")
        .set("x-user-id", "999")
        .set("x-role", "SuperAdmin");

      expect(res.status).toBe(200);

      // Shape consumed by SpendDashboard/index.tsx (`spendRes.data.summary`,
      // `data.by_day || data.byDay`).
      expect(res.body.summary.total_requests).toBe(5);
      expect(Array.isArray(res.body.by_day)).toBe(true);

      const upstream = gateway.captured[0];
      expect(upstream).toBeDefined();
      // pathRewrite: "^/" → "/internal/"
      expect(upstream.url).toBe("/internal/spend?period=7d");
      expect(upstream.headers["x-internal-key"]).toBe("test-internal-key");
      expect(upstream.headers["x-organization-id"]).toBe("7");
      expect(upstream.headers["x-user-id"]).toBe("42");
      expect(upstream.headers["x-role"]).toBe("Admin");
    });

    it("response bodies pass through unchanged for the other dashboard panels", async () => {
      const gateway = await startMockGateway((req) => {
        if (req.url.startsWith("/internal/spend/exists")) {
          return { status: 200, body: { has_logs: true } };
        }
        if (req.url.startsWith("/internal/spend/by-endpoint")) {
          return { status: 200, body: { data: [{ group_key: "default", requests: 3 }] } };
        }
        if (req.url.startsWith("/internal/guardrails/stats")) {
          return {
            status: 200,
            body: { summary: { blocked: 1, masked: 2, total: 9 }, byType: [] },
          };
        }
        if (req.url.startsWith("/internal/cache/stats")) {
          return { status: 200, body: { stats: { hits: 1, misses: 2 } } };
        }
        return { status: 404, body: { detail: "not found" } };
      });
      testServers.push(gateway.server);
      process.env.AI_GATEWAY_URL = gateway.url;

      // fetchHasLogs(): `res?.data?.has_logs`
      const exists = await testRequest(app).get("/api/ai-gateway/spend/exists");
      expect(exists.status).toBe(200);
      expect(exists.body.has_logs).toBe(true);

      // by-endpoint panel: `(endpointRes?.data?.data || [])` with group_key
      const byEndpoint = await testRequest(app).get("/api/ai-gateway/spend/by-endpoint?period=1d");
      expect(byEndpoint.status).toBe(200);
      expect(Array.isArray(byEndpoint.body.data)).toBe(true);
      expect(byEndpoint.body.data[0].group_key).toBe("default");

      // guardrails panel maps `summary.blocked|masked|total` and `byType`
      const guardrails = await testRequest(app).get("/api/ai-gateway/guardrails/stats?period=1d");
      expect(guardrails.status).toBe(200);
      expect(guardrails.body.summary.blocked).toBe(1);
      expect(Array.isArray(guardrails.body.byType)).toBe(true);

      // cache panel: `cacheRes?.data?.stats`
      const cache = await testRequest(app).get("/api/ai-gateway/cache/stats");
      expect(cache.status).toBe(200);
      expect(cache.body.stats.misses).toBe(2);
    });

    it("POST bodies are re-streamed to the gateway (fixRequestBody)", async () => {
      const gateway = await startMockGateway((req) => ({
        status: 200,
        body: { echoed: JSON.parse(req.body || "{}") },
      }));
      testServers.push(gateway.server);
      process.env.AI_GATEWAY_URL = gateway.url;

      const res = await testRequest(app)
        .post("/api/ai-gateway/chat")
        .set("Content-Type", "application/json")
        .send({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] });

      expect(res.status).toBe(200);
      expect(res.body.echoed.model).toBe("gpt-4o");
      const upstream = gateway.captured[0];
      expect(upstream.url).toBe("/internal/chat");
      expect(JSON.parse(upstream.body).messages).toHaveLength(1);
    });
  });

  describe("gateway unreachable — graceful degradation contract", () => {
    it("GET returns 200 { data: [] } so UI panels degrade silently", async () => {
      // Reserve a port, then close the server so connections are refused.
      const dead = await startMockGateway(() => ({ status: 200, body: {} }));
      process.env.AI_GATEWAY_URL = dead.url;
      await new Promise<void>((resolve) => dead.server.close(() => resolve()));

      const res = await testRequest(app).get("/api/ai-gateway/spend?period=7d");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [] });
    });

    it("non-GET returns 502 with a JSON error body", async () => {
      const dead = await startMockGateway(() => ({ status: 200, body: {} }));
      process.env.AI_GATEWAY_URL = dead.url;
      await new Promise<void>((resolve) => dead.server.close(() => resolve()));

      const res = await testRequest(app).post("/api/ai-gateway/chat").send({ model: "gpt-4o" });
      expect(res.status).toBe(502);
      expect(res.body.error).toBe("AI Gateway proxy error");
    });
  });
});
