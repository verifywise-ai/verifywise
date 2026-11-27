import express from "express";
import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { tokenHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/token.js";
import { clientRegistrationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/register.js";
import { revocationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/revoke.js";
import authenticateJWT from "../../middleware/auth.middleware";
import { mcpOAuthProvider } from "../../mcp/oauth";
import {
  decideAuthorizationRequestHandler,
  getAuthorizationRequestHandler,
  listConnectionsHandler,
  revokeConnectionHandler,
} from "../../controllers/mcpOAuth.ctrl";

const router = express.Router();

// The OAuth endpoints of the MCP server's sign-in (mcp/oauth.ts). The SDK's
// handlers validate the protocol (PKCE, client authentication, redirect URIs)
// and rate-limit per IP. The SDK's mcpAuthRouter is not used because it
// serves these at the site root, which the deployment's proxies do not send
// to the backend; here they sit under the issuer, /api/v1/oauth.
router.use("/authorize", authorizationHandler({ provider: mcpOAuthProvider }));
router.use("/token", tokenHandler({ provider: mcpOAuthProvider }));
router.use("/register", clientRegistrationHandler({ clientsStore: mcpOAuthProvider.clientsStore }));
router.use("/revoke", revocationHandler({ provider: mcpOAuthProvider }));

// The consent page and the MCP tab, for the signed-in user.
router.get("/authorization-requests", authenticateJWT, getAuthorizationRequestHandler);
router.post("/authorization-requests/decision", authenticateJWT, decideAuthorizationRequestHandler);
router.get("/connections", authenticateJWT, listConnectionsHandler);
router.delete("/connections/:id", authenticateJWT, revokeConnectionHandler);

export default router;
