import { NextFunction, Request, Response } from "express";
import { getNumberOfApiTokensQuery } from "../utils/tokens.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";

export const validateTokenCreation = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  // Org Admins, plus super admins. A pure super admin has no org role at all
  // (role_id IS NULL), so the role check alone would lock them out of the only
  // credential that can drive the super-admin API.
  if (req.role !== "Admin" && !req.isSuperAdmin) {
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
  if (req.role !== "Admin" && !req.isSuperAdmin) {
    return res
      .status(403)
      .json(STATUS_CODE[403](req.t!("Only Admin and super admin users can delete API tokens.")));
  }
  next();
};
