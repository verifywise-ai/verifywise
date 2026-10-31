import express, { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import authenticateJWT from "../middleware/auth.middleware";
import superAdminOnly from "../middleware/superAdminOnly.middleware";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { buildMcpServer } from "../mcp/server";
import logger from "../utils/logger/fileLogger";

const router = express.Router();

// Same gate as the super-admin API these tools drive: the client sends its API
// token as a bearer token, which authenticateJWT already accepts and resolves
// to a user, and superAdminOnly re-checks super_admins membership per request.
router.use(authenticateJWT, superAdminOnly);

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
