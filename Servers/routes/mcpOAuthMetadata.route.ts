import express, { Request, Response } from "express";
import cors from "cors";
import { authorizationServerMetadata, protectedResourceMetadata } from "../mcp/oauth";

const router = express.Router();

/**
 * The two discovery documents of the MCP server's sign-in. Their paths are
 * fixed by RFC 9728 and RFC 8414 (the well-known prefix goes at the site
 * root, before the resource or issuer path), so they cannot sit under
 * /api/v1. Mounted at /.well-known; the deployment's proxies send these two
 * prefixes to the backend (see Clients/nginx.conf). Public, like any OAuth metadata, and readable
 * cross-origin for browser-based MCP clients.
 */
function sendMetadata(res: Response, metadata: object | null) {
  if (!metadata) return res.status(404).json({ error: "MCP sign-in is not configured" });
  return res.status(200).json(metadata);
}

function getProtectedResourceMetadata(_req: Request, res: Response) {
  return sendMetadata(res, protectedResourceMetadata());
}

function getAuthorizationServerMetadata(_req: Request, res: Response) {
  return sendMetadata(res, authorizationServerMetadata());
}

router.get("/oauth-protected-resource/api/mcp", cors(), getProtectedResourceMetadata);
router.get("/oauth-authorization-server/api/v1/oauth", cors(), getAuthorizationServerMetadata);

export default router;
