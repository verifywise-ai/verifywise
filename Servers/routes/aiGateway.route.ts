/**
 * AI Gateway Routes — thin proxy to FastAPI AIGateway service.
 *
 * All logic (CRUD, chat proxy, guardrails, spend, etc.) lives in the
 * AIGateway Python service. Express only handles JWT authentication and
 * forwards the request with tenant context headers.
 */

import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";
import authenticateJWT from "../middleware/auth.middleware";
import express, { NextFunction, Request, Response, Router } from "express";
import { updateGuardrailSettings } from "../controllers/aiGatewaySettings.ctrl";
import { getGatewayInternalKey, getGatewayUrl } from "../utils/aiGatewayConfig";
import { requestHasPermission } from "../utils/rolePermissions.utils";

const jsonParser = express.json({ limit: "50mb" });

/**
 * Header that tells the AI Gateway the caller holds "llmKeys.admin", so a
 * custom role (which never matches the "Admin" role name the gateway also
 * accepts) can manage provider keys. The proxy always strips a client-supplied
 * value and sets it only from the permission, so the gateway can trust it the
 * same way it trusts x-role.
 */
export const LLM_KEYS_ADMIN_HEADER = "x-can-manage-llm-keys";

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type KeysPermissionRequest = Request & { canManageLlmKeys?: boolean };

/**
 * Whether the request path (relative to /api/ai-gateway) is under /keys.
 * Decoded and lower-cased; a spelling that doesn't match only means the
 * header is not set, and the gateway falls back to the role name (fail closed).
 */
export function isKeysPath(path: string): boolean {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Malformed escape: keep the raw path.
  }
  const normalized = decoded.toLowerCase().replace(/\/+/g, "/");
  return normalized === "/keys" || normalized.startsWith("/keys/");
}

/**
 * For writes to the provider key routes, resolve whether the caller holds
 * "llmKeys.admin". Other requests skip the lookup. Fails closed: on a lookup
 * error the flag stays unset and the gateway checks the role name only.
 */
export async function resolveLlmKeysPermission(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const r = req as KeysPermissionRequest;
  r.canManageLlmKeys = false;
  if (!READ_ONLY_METHODS.has(req.method) && isKeysPath(req.path)) {
    try {
      r.canManageLlmKeys = await requestHasPermission(req, "llmKeys.admin");
    } catch (error) {
      console.error("[AI Gateway Proxy] Permission lookup failed:", error);
    }
  }
  next();
}

function aiGatewayRoutes() {
  const router = Router();

  const proxy = createProxyMiddleware({
    // The startup fallback http-proxy-middleware requires; router below wins.
    target: getGatewayUrl(),
    // Resolve the gateway URL per request, so it follows AI_GATEWAY_URL as
    // read now rather than when the router was built.
    router: () => getGatewayUrl(),
    changeOrigin: true,
    timeout: 30_000, // 30s — abort if AI Gateway doesn't respond
    proxyTimeout: 30_000, // 30s — abort if connection takes too long
    // /api/ai-gateway/* → /internal/*
    pathRewrite: { "^/": "/internal/" },
    on: {
      proxyReq: (proxyReq, req) => {
        const expressReq = req as Request;

        // Forward internal API key
        proxyReq.setHeader("x-internal-key", getGatewayInternalKey());

        // Forward the request id so logs thread across services
        if (expressReq.requestId) {
          proxyReq.setHeader("x-request-id", expressReq.requestId);
        }
        // Strip client-supplied tenant headers: the gateway trusts these,
        // so they must only ever come from the authenticated JWT context.
        proxyReq.removeHeader("x-organization-id");
        proxyReq.removeHeader("x-user-id");
        proxyReq.removeHeader("x-role");
        proxyReq.removeHeader(LLM_KEYS_ADMIN_HEADER);

        // Forward tenant context from JWT
        if (expressReq.organizationId) {
          proxyReq.setHeader("x-organization-id", expressReq.organizationId.toString());
        }
        if (expressReq.userId) {
          proxyReq.setHeader("x-user-id", expressReq.userId.toString());
        }
        if (expressReq.role) {
          proxyReq.setHeader("x-role", expressReq.role);
        }
        if ((expressReq as KeysPermissionRequest).canManageLlmKeys) {
          proxyReq.setHeader(LLM_KEYS_ADMIN_HEADER, "true");
        }

        // Re-stream parsed body to proxy target
        fixRequestBody(proxyReq, req as Request);
      },
      error: (err, req, res) => {
        const errAny = err as any;
        const isConnectionRefused = errAny.code === "ECONNREFUSED" || errAny.code === "ECONNRESET";

        // For read-only GET endpoints, return a graceful empty response when the
        // AI Gateway service is not running, so the UI degrades silently.
        if (isConnectionRefused && req.method === "GET" && res && "writeHead" in res) {
          (res as any).writeHead(200, { "Content-Type": "application/json" });
          (res as any).end(JSON.stringify({ data: [] }));
          return;
        }

        console.error(
          `[AI Gateway Proxy] Error for ${req.url}:`,
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

  // Settings updates go through Express first so retention changes are
  // recorded in the audit ledger; the gateway still enforces admin access.
  router.put("/guardrails/settings", authenticateJWT, jsonParser, updateGuardrailSettings);

  // All routes: authenticate JWT, parse body, forward to AIGateway
  router.use("/", authenticateJWT, jsonParser, resolveLlmKeysPermission, proxy);

  return router;
}

export default aiGatewayRoutes;
