import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { canUseMcp } from "../middleware/mcpAccess.middleware";
import {
  approveAuthorizationRequest,
  denyAuthorizationRequest,
  readAuthorizationRequest,
} from "../mcp/oauth";
import { getUserGrantsQuery, revokeUserGrantQuery } from "../utils/mcpOAuth.utils";
import { getOrganizationByIdQuery } from "../utils/organization.utils";

const FILE = "mcpOAuth.ctrl.ts";

/**
 * What the consent page shows: the client asking, where the browser goes
 * afterwards (its host, which the MCP authorization spec requires the page to
 * show), the organization the connection will act in (the session's; none for
 * a pure super admin), and whether this user may allow it.
 */
export async function getAuthorizationRequestHandler(req: Request, res: Response) {
  const fn = "getAuthorizationRequestHandler";
  logStructured("processing", "reading an MCP authorization request", fn, FILE);
  try {
    const request =
      typeof req.query.request === "string"
        ? await readAuthorizationRequest(req.query.request)
        : null;
    if (!request) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            req.t!(
              "This sign-in request is invalid or has expired. Start again from your MCP client.",
            ),
          ),
        );
    }
    const organization = req.organizationId
      ? await getOrganizationByIdQuery(req.organizationId)
      : null;
    logStructured("successful", `authorization request from client ${request.clientId}`, fn, FILE);
    return res.status(200).json(
      STATUS_CODE[200]({
        clientName: request.clientName,
        redirectHost: new URL(request.redirectUri).host,
        organizationName: organization?.name ?? null,
        canAllow: canUseMcp(req),
      }),
    );
  } catch (error) {
    logStructured("error", "failed to read an MCP authorization request", fn, FILE);
    logger.error(`❌ Error in ${fn}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * The user's answer. Allowing issues a code for the organization of their
 * session; either way the response says where to send the browser, which is
 * the client's own redirect URI.
 */
export async function decideAuthorizationRequestHandler(req: Request, res: Response) {
  const fn = "decideAuthorizationRequestHandler";
  logStructured("processing", "deciding an MCP authorization request", fn, FILE);
  try {
    const request =
      typeof req.body?.request === "string"
        ? await readAuthorizationRequest(req.body.request)
        : null;
    if (!request) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            req.t!(
              "This sign-in request is invalid or has expired. Start again from your MCP client.",
            ),
          ),
        );
    }
    if (req.body.allow !== true) {
      logStructured(
        "successful",
        `user ${req.userId} declined client ${request.clientId}`,
        fn,
        FILE,
      );
      return res
        .status(200)
        .json(STATUS_CODE[200]({ redirectUrl: denyAuthorizationRequest(request) }));
    }
    if (!canUseMcp(req)) {
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("Access restricted to Admins and super admins")));
    }
    const redirectUrl = await approveAuthorizationRequest(request, {
      userId: req.userId!,
      organizationId: req.organizationId ?? null,
    });
    logStructured("successful", `user ${req.userId} allowed client ${request.clientId}`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200]({ redirectUrl }));
  } catch (error) {
    logStructured("error", "failed to decide an MCP authorization request", fn, FILE);
    logger.error(`❌ Error in ${fn}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/** The signed-in user's own MCP connections, in every organization. */
export async function listConnectionsHandler(req: Request, res: Response) {
  const fn = "listConnectionsHandler";
  logStructured("processing", "listing MCP connections", fn, FILE);
  try {
    const connections = await getUserGrantsQuery(req.userId!);
    logStructured("successful", `${connections.length} MCP connections`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](connections));
  } catch (error) {
    logStructured("error", "failed to list MCP connections", fn, FILE);
    logger.error(`❌ Error in ${fn}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/** Ends one of the user's own connections: its access and refresh tokens stop working at once. */
export async function revokeConnectionHandler(req: Request, res: Response) {
  const fn = "revokeConnectionHandler";
  logStructured("processing", `revoking MCP connection ${req.params.id}`, fn, FILE);
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid connection id")));
    }
    if (!(await revokeUserGrantQuery(id, req.userId!))) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Connection not found")));
    }
    logStructured("successful", `revoked MCP connection ${id}`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200]({ revoked: true }));
  } catch (error) {
    logStructured("error", "failed to revoke an MCP connection", fn, FILE);
    logger.error(`❌ Error in ${fn}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
