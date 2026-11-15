import { NextFunction, Request, Response } from "express";
import { getNumberOfApiTokensQuery } from "../utils/tokens.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { requestHasPermission } from "../utils/rolePermissions.utils";

/**
 * Super admins (pure or elected) always may manage API tokens: a pure super
 * admin has no org role, and the token is the only credential that can drive
 * the super-admin API. Everyone else needs apiKeys.admin (Admin by default,
 * or a custom role granted it).
 */
async function canManageApiTokens(req: Request): Promise<boolean> {
  if (req.isSuperAdmin) return true;
  return requestHasPermission(req, "apiKeys.admin");
}

export const validateTokenCreation = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  if (!(await canManageApiTokens(req))) {
    return res
      .status(403)
      .json(STATUS_CODE[403](req.t!("Only Admin and super admin users can create API tokens.")));
  }

  // null for a super admin with no organization — their tokens are scoped by
  // organization_id IS NULL and counted against the same per-owner limit.
  const numberOfTokens = await getNumberOfApiTokensQuery(req.organizationId ?? null);
  if (numberOfTokens >= 10) {
    return res
      .status(403)
      .json(STATUS_CODE[403](req.t!("Token limit reached. Maximum 10 tokens allowed.")));
  }
  next();
};

export const validateTokenDeletion = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  if (!(await canManageApiTokens(req))) {
    return res
      .status(403)
      .json(STATUS_CODE[403](req.t!("Only Admin and super admin users can delete API tokens.")));
  }
  next();
};
