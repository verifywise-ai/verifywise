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

/**
 * The file id in `raw`, or null unless it is plain decimal digits. Number()
 * reads "5e2" as 500 and parseInt() reads it as 5, so a looser parse could
 * check one file and act on another.
 */
export function parseFileId(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * @param param - the route parameter holding the file id. On success the
 *   parsed id is set on req.fileId for the handler to use.
 */
export function requireFileAccess(param = "id") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const fileId = parseFileId(req.params[param]);
    if (fileId === null) {
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
      req.fileId = fileId;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
