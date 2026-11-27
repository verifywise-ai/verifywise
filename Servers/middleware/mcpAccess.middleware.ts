import { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";

/**
 * Who may use the MCP server: super admins, and Admins of the organization
 * their session or token names. The /api/mcp gate and the OAuth consent page
 * both ask this, so a user who could not call the server cannot connect a
 * client to it either.
 */
export function canUseMcp(user: {
  role?: string;
  organizationId?: number | null;
  isSuperAdmin?: boolean;
}): boolean {
  return user.isSuperAdmin === true || (user.role === "Admin" && Boolean(user.organizationId));
}

/**
 * The /api/mcp gate.
 *
 * authenticateJWT has already resolved the bearer token to a user, re-checked
 * super_admins membership and confirmed the token's role is still the user's
 * role in that organization, so both checks hold per request: a revoked super
 * admin or a demoted Admin loses access without the token being revoked.
 * Which tools each gets is decided in mcp/server.ts.
 */
export function requireMcpAccess(req: Request, res: Response, next: NextFunction) {
  if (canUseMcp(req)) {
    return next();
  }
  return res
    .status(403)
    .json(STATUS_CODE[403](req.t!("Access restricted to Admins and super admins")));
}
