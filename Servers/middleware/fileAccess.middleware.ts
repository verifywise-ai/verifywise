/**
 * @fileoverview File access middleware for routes that act on a file by id.
 *
 * Applies canUserAccessFile, the rule the file download uses: the
 * organization's Admins, the uploader, and for a project file the project's
 * owner and members. Anyone else gets the same 403 the download answers, which
 * a file that does not exist also gets, so a file's existence is not disclosed.
 *
 * @module middleware/fileAccess
 */

import { Request, Response, NextFunction } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { canUserAccessFile } from "../utils/fileUpload.utils";

/** @param param - the route parameter holding the file id */
export function requireFileAccess(param = "id") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const raw = req.params[param];
    const fileId = Number(Array.isArray(raw) ? raw[0] : raw);
    if (!Number.isInteger(fileId) || fileId <= 0) {
      return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
    }
    if (!req.userId || !req.organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthenticated"));
    }
    try {
      const allowed = await canUserAccessFile(
        fileId,
        Number(req.userId),
        req.role || "",
        req.organizationId,
        req.organizationId,
      );
      if (!allowed) return res.status(403).json(STATUS_CODE[403]("Access denied"));
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
