import express, { NextFunction, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import authenticateJWT from "../middleware/auth.middleware";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { buildMcpServer } from "../mcp/server";
import logger from "../utils/logger/fileLogger";

const router = express.Router();

/**
 * Super admins, and Admins of the organization their token names.
 *
 * authenticateJWT has already resolved the bearer token to a user, re-checked
 * super_admins membership and confirmed the token's role is still the user's
 * role in that organization, so both checks hold per request: a revoked super
 * admin or a demoted Admin loses access without the token being revoked.
 * Which tools each gets is decided in mcp/server.ts.
 */
function adminOrSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isSuperAdmin || (req.role === "Admin" && req.organizationId)) {
    return next();
  }
  return res
    .status(403)
    .json(STATUS_CODE[403](req.t!("Access restricted to Admins and super admins")));
}

router.use(authenticateJWT, adminOrSuperAdmin);

/**
 * One MCP request.
 *
 * Stateless: a fresh server and transport per request, with no session id, so
 * nothing is held between calls and any backend instance can serve any client.
 * `enableJsonResponse` keeps replies as ordinary JSON rather than an SSE
 * stream, which survives the proxy in front of the deployment unchanged.
 */
async function handleMcpRequest(req: Request, res: Response) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = buildMcpServer({
    userId: req.userId!,
    organizationId: req.organizationId ?? null,
    role: req.role!,
    isSuperAdmin: req.isSuperAdmin === true,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    // express.json() already consumed the body, so it is passed in rather than
    // re-read from the stream.
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error(`❌ MCP request failed: ${(error as Error).message}`);
    if (!res.headersSent) {
      res.status(500).json(STATUS_CODE[500]({ message: "MCP request failed" }));
    }
  }
}

// Stateless mode serves no standalone event stream and keeps no session to
// terminate, so the other two verbs the spec allows are answered explicitly
// rather than falling through to the app's 404.
function rejectMcpGet(_req: Request, res: Response) {
  res.status(405).json(STATUS_CODE[405]({ message: "Use POST for MCP requests" }));
}

function rejectMcpDelete(_req: Request, res: Response) {
  res.status(405).json(STATUS_CODE[405]({ message: "This MCP server is stateless" }));
}

// Named handlers give each operation a distinct operationId in swagger.yaml.
router.post("/", handleMcpRequest);
router.get("/", rejectMcpGet);
router.delete("/", rejectMcpDelete);

export default router;
