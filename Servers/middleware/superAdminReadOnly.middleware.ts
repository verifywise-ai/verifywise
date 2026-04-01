import { Request, Response, NextFunction } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";

/**
 * Middleware that enforces read-only mode when a super-admin is viewing an organization.
 *
 * When req.isSuperAdmin is true AND req.organizationId is set (viewing an org),
 * only GET, HEAD, and OPTIONS methods are allowed. All other methods return 403.
 *
 * Exception: Routes under /api/super-admin/* are excluded (super-admin management routes).
 */
const superAdminReadOnly = (req: Request, res: Response, next: NextFunction): void | Response => {
  if (!req.isSuperAdmin || !req.organizationId) {
    return next();
  }

  // Allow super-admin management routes
  if (req.path.startsWith('/api/super-admin') || req.baseUrl?.startsWith('/api/super-admin')) {
    return next();
  }

  const readOnlyMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (!readOnlyMethods.includes(req.method.toUpperCase())) {
    return res.status(403).json(
      STATUS_CODE[403]("Super-admin has read-only access when viewing an organization")
    );
  }

  next();
};

export default superAdminReadOnly;
