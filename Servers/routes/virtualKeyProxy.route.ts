/**
 * Virtual Key Proxy Routes — thin proxy to FastAPI AIGateway service.
 *
 * OpenAI-compatible /v1/* endpoints. No JWT required.
 * Virtual key authentication is handled by the AIGateway Python service.
 */

import { createProxyMiddleware } from "http-proxy-middleware";
import { Router } from "express";

const AI_GATEWAY_URL =
  process.env.AI_GATEWAY_URL || "http://127.0.0.1:8100";

function virtualKeyProxyRoutes() {
  const router = Router();

  const proxy = createProxyMiddleware({
    target: AI_GATEWAY_URL,
    changeOrigin: true,
    // /v1/* → /v1/* (no rewrite — AIGateway already handles /v1/*)
    on: {
      error: (err, req, res) => {
        const errAny = err as any;
        console.error(
          `[Virtual Key Proxy] Error for ${req.url}:`,
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

  router.use("/", proxy);

  return router;
}

export default virtualKeyProxyRoutes;
