/**
 * Virtual Key Proxy Routes — thin proxy to FastAPI AIGateway service.
 *
 * OpenAI-compatible /v1/* endpoints. No JWT required.
 * Virtual key authentication is handled by the AIGateway Python service.
 */

import { createProxyMiddleware } from "http-proxy-middleware";
import { Router } from "express";
import { getGatewayUrl } from "../utils/aiGatewayConfig";

function virtualKeyProxyRoutes() {
  const router = Router();

  const proxy = createProxyMiddleware({
    // The startup fallback http-proxy-middleware requires; router below wins.
    target: getGatewayUrl(),
    // Resolve the gateway URL per request, so it follows AI_GATEWAY_URL as
    // read now rather than when the router was built.
    router: () => getGatewayUrl(),
    changeOrigin: true,
    // /v1/* → /v1/* (no rewrite — AIGateway already handles /v1/*)
    on: {
      error: (err, req, res) => {
        const errAny = err as any;
        console.error(
          `[Virtual Key Proxy] Error for ${req.url}:`,
          errAny.message || errAny.code || errAny,
        );
        if (res && "writeHead" in res) {
          (res as any).writeHead(502, { "Content-Type": "application/json" });
          (res as any).end(
            JSON.stringify({
              error: "AI Gateway proxy error",
              message: errAny.message || errAny.code || "Unknown error",
            }),
          );
        }
      },
    },
  });

  router.use("/", proxy);

  return router;
}

export default virtualKeyProxyRoutes;
