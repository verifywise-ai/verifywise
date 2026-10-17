/**
 * @fileoverview Keeps bias audit stance PDFs out of the generic file endpoints.
 *
 * A stance PDF is a files row, but it is served only by the bias audit stance
 * endpoint, which applies the project-member rule with no SuperAdmin bypass
 * and checks the recorded hash. On the generic file routes it answers exactly
 * as a missing file does, so its existence is not disclosed either.
 *
 * @module middleware/stanceFileGuard
 */

import { Request, Response, NextFunction } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { isStanceFile } from "../utils/files/visibleFiles";

/** For file-manager routes taking `:id`; place after authenticateJWT and the id validator. */
export async function refuseStanceFile(req: Request, res: Response, next: NextFunction) {
  const fileId = Number(req.params.id);
  if (!Number.isInteger(fileId) || !req.organizationId) return next();
  try {
    if (await isStanceFile(fileId, req.organizationId)) {
      return res.status(404).json(STATUS_CODE[404](req.t!("File not found")));
    }
    return next();
  } catch (error) {
    return next(error);
  }
}
