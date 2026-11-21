/**
 * @fileoverview File access middleware for routes that act on a file by id.
 *
 * Applies canUserAccessFile, the rule the File Manager download uses: the
 * organization's Admins; any member for an organization-level file; for a
 * project file its uploader and the project's owner and members. Anyone else
 * gets the same 403 the download answers, which a file that does not exist
 * also gets, so a file's existence is not disclosed.
 *
 * @module middleware/fileAccess
 */

import { Request, Response, NextFunction } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { canUserAccessFile } from "../utils/fileUpload.utils";
import { logFailure } from "../utils/logger/logHelper";

/** @param param - the route parameter holding the file id */
export function requireFileAccess(param = "id") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const raw = req.params[param];
    const fileId = Number(Array.isArray(raw) ? raw[0] : raw);
    if (!Number.isInteger(fileId) || fileId <= 0) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid file ID")));
    }
    if (!req.userId || !req.organizationId) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthenticated")));
    }
    const userId = Number(req.userId);
    const role = req.role || "";
    try {
      const allowed = await canUserAccessFile(fileId, userId, role, req.organizationId);
      if (!allowed) {
        await logFailure({
          eventType: "Read",
          description: `Access denied to file ID ${fileId} for user ${userId}`,
          functionName: "requireFileAccess",
          fileName: "fileAccess.middleware.ts",
          error: new Error(`User ${userId} with role '${role}' denied access to file ${fileId}`),
          userId,
          organizationId: req.organizationId,
        });
        return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
