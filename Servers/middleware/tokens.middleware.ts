import { NextFunction, Request, Response } from "express";
import { getNumberOfApiTokensQuery } from "../utils/tokens.utils";

export const validateTokenCreation = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  if (req.role !== "Admin") {
    return res.status(403).json({
      message: req.t!("Only Admin users can create API tokens."),
    });
  }

  const numberOfTokens = await getNumberOfApiTokensQuery(req.organizationId!);
  if (numberOfTokens >= 10) {
    return res.status(403).json({
      message: req.t!("Token limit reached. Maximum 10 tokens allowed."),
    });
  }
  next();
};

export const validateTokenDeletion = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  if (req.role !== "Admin") {
    return res.status(403).json({
      message: req.t!("Only Admin users can delete API tokens."),
    });
  }
  next();
};
