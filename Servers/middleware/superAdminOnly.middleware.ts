import { Request, Response, NextFunction } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";

/**
 * Middleware that restricts access to super-admin users only.
 * Returns 403 unless req.isSuperAdmin === true.
 */
const superAdminOnly = (req: Request, res: Response, next: NextFunction): void | Response => {
  if (!req.isSuperAdmin) {
    return res.status(403).json(
      STATUS_CODE[403]("Access restricted to super-admin only")
    );
  }
  next();
};

export default superAdminOnly;
