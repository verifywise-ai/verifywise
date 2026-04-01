/**
 * AI Gateway Routes — thin proxy to FastAPI AIGateway service.
 *
 * All logic (CRUD, chat proxy, guardrails, spend, etc.) lives in the
 * AIGateway Python service. Express only handles JWT authentication and
 * forwards the request with tenant context headers.
 */

import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";
import authenticateJWT from "../middleware/auth.middleware";
import express, { Request, Router } from "express";

const AI_GATEWAY_URL =
  process.env.AI_GATEWAY_URL || "http://127.0.0.1:8100";
const AI_GATEWAY_KEY =
  process.env.AI_GATEWAY_INTERNAL_KEY || "";

const jsonParser = express.json({ limit: "50mb" });

function aiGatewayRoutes() {
  const router = Router();

  const proxy = createProxyMiddleware({
    target: AI_GATEWAY_URL,
    changeOrigin: true,
    timeout: 30_000,        // 30s — abort if AI Gateway doesn't respond
    proxyTimeout: 30_000,   // 30s — abort if connection takes too long
    // /api/ai-gateway/* → /internal/*
    pathRewrite: { "^/": "/internal/" },
    on: {
      proxyReq: (proxyReq, req) => {
        const expressReq = req as Request;

        // Forward internal API key
        proxyReq.setHeader("x-internal-key", AI_GATEWAY_KEY);

        // Forward tenant context from JWT
        if (expressReq.organizationId) {
          proxyReq.setHeader(
            "x-organization-id",
            expressReq.organizationId.toString()
          );
        }
if (expressReq.userId) {
          proxyReq.setHeader("x-user-id", expressReq.userId.toString());
        }
        if (expressReq.role) {
          proxyReq.setHeader("x-role", expressReq.role);
        }

        // Re-stream parsed body to proxy target
        fixRequestBody(proxyReq, req as Request);
      },
      error: (err, req, res) => {
        const errAny = err as any;
        console.error(
          `[AI Gateway Proxy] Error for ${req.url}:`,
          errAny.message || errAny.code || errAny
        );
        if (res && "writeHead" in res) {
          (res as any).writeHead(502, { "Content-Type": "application/json" });
          (res as any).end(
            JSON.stringify({
              error: "AI Gateway proxy error",
              message: errAny.message || errAny.code || "Unknown error",
            })
          );
        }
      },
    },
  });

  // All routes: authenticate JWT, parse body, forward to AIGateway
  router.use("/", authenticateJWT, jsonParser, proxy);

  return router;
}

export default aiGatewayRoutes;
